/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * BitGauge is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
 */

package harness

import (
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// The manual Continuous memory check (testing.md section 5, "Continuous memory (manual)"),
// beside the three tiers and outside Tiers(): a Continuous download on one profile in Chromium,
// whose browser driver forces a garbage collection on the engine Worker every 60 s from the steady
// start and reads its heap. Every sample from minute 5 to the last must lie within 2 MiB of the
// minute-5 sample. A missing, empty or short sample file fails the check; nothing here skips.

const (
	// ContinuousProfile is the profile the check runs on.
	ContinuousProfile = "ci-100m-50ms"
	// ContinuousBrowser is the one browser whose DevTools Protocol reaches a Worker's heap.
	ContinuousBrowser = BrowserChromium
	// ContinuousMinutesDefault is the hour testing.md asks for.
	ContinuousMinutesDefault = 60
	// ContinuousMinutesMin leaves a sample after the minute-5 baseline: a shorter run judges
	// nothing.
	ContinuousMinutesMin = 6
	// ContinuousBaselineMinute is the sample every later one is held to.
	ContinuousBaselineMinute = 5
	// ContinuousBoundBytes is 2 MiB.
	ContinuousBoundBytes = 2 << 20
	// ContinuousFile is the driver's sample file in its export directory.
	ContinuousFile = "continuous.json"
	// ContinuousRule is the rule in the report's words.
	ContinuousRule = "every Worker heap sample (Runtime.getHeapUsage usedSize after " +
		"HeapProfiler.collectGarbage, every 60 s from the steady start) from minute 5 to the " +
		"last lies within 2 MiB (2097152 bytes) of the minute-5 sample (testing.md section 5)"
	// continuousSetup covers what a browser run spends outside the sampled minutes: the page
	// load, the idle latency, the warm-up and the run's 30 s past the last sample.
	continuousSetup = 10 * time.Minute
	// continuousReportDir names the report directory, as a tier does: continuous-<UTC>-<envid>.
	continuousReportDir Tier = "continuous"
)

var (
	errContinuousMinutes = fmt.Errorf(
		"HARNESS_CONTINUOUS_MINUTES must be a whole number of at least %d",
		ContinuousMinutesMin,
	)
	errHeapEmpty = errors.New("the sample file is empty")
)

// ContinuousMinutes reads HARNESS_CONTINUOUS_MINUTES: empty is the default hour, anything else a
// whole number of at least ContinuousMinutesMin.
func ContinuousMinutes(value string) (int, error) {
	if strings.TrimSpace(value) == "" {
		return ContinuousMinutesDefault, nil
	}

	minutes, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || minutes < ContinuousMinutesMin {
		return 0, fmt.Errorf("%w, not %q", errContinuousMinutes, value)
	}

	return minutes, nil
}

// ContinuousBrowseLimit is how long the browser run may take: the sampled minutes and the setup.
func ContinuousBrowseLimit(minutes int) time.Duration {
	return time.Duration(minutes)*time.Minute + continuousSetup
}

// ContinuousExport is the sample file's path relative to the report directory.
func ContinuousExport() string {
	return filepath.Join("exports", ContinuousProfile, ContinuousFile)
}

// HeapSample is one reading of the Worker's heap, minute 0 at the steady start.
type HeapSample struct {
	Minute     int   `json:"minute"`
	AtMs       int64 `json:"atMs"`
	UsedBytes  int64 `json:"usedSize"`
	TotalBytes int64 `json:"totalSize"`
}

// heapFile is what web/harness/continuous.spec.ts writes.
type heapFile struct {
	WorkerURL string       `json:"workerUrl"`
	Samples   []HeapSample `json:"samples"`
}

// HeapVerdict is the judged sample file.
type HeapVerdict struct {
	Status    string       `json:"status"`
	Findings  []string     `json:"findings,omitempty"`
	WorkerURL string       `json:"workerUrl,omitempty"`
	Samples   []HeapSample `json:"samples,omitempty"`
	// BaselineBytes is the minute-5 sample's used heap.
	BaselineBytes *int64 `json:"baselineBytes,omitempty"`
	// MaxDriftBytes is the largest distance of a later sample from the baseline.
	MaxDriftBytes *int64 `json:"maxDriftBytes,omitempty"`
}

// JudgeHeap holds every sample from minute 5 to the last within ContinuousBoundBytes of the
// minute-5 one. The samples must be minute 0 to minutes, one each, in order, each with a heap
// size; anything less fails, as does an empty or unreadable file.
func JudgeHeap(data []byte, minutes int) HeapVerdict {
	if strings.TrimSpace(string(data)) == "" {
		return HeapVerdict{Status: StatusFail, Findings: []string{errHeapEmpty.Error()}}
	}

	var file heapFile

	err := json.Unmarshal(data, &file)
	if err != nil {
		return HeapVerdict{
			Status:   StatusFail,
			Findings: []string{"the sample file does not parse: " + err.Error()},
		}
	}

	verdict := HeapVerdict{Status: StatusPass, WorkerURL: file.WorkerURL, Samples: file.Samples}

	if len(file.Samples) < minutes+1 {
		verdict.Status = StatusFail
		verdict.Findings = append(verdict.Findings, fmt.Sprintf(
			"short: %d samples, where minutes 0 to %d need %d",
			len(file.Samples),
			minutes,
			minutes+1,
		))

		return verdict
	}

	for index, sample := range file.Samples {
		if sample.Minute != index || sample.UsedBytes <= 0 {
			verdict.Status = StatusFail
			verdict.Findings = append(verdict.Findings, fmt.Sprintf(
				"sample %d reads minute %d with %d bytes used, not minute %d with a heap size",
				index, sample.Minute, sample.UsedBytes, index))

			return verdict
		}
	}

	baseline := file.Samples[ContinuousBaselineMinute].UsedBytes
	verdict.BaselineBytes = &baseline

	var drift int64

	for _, sample := range file.Samples[ContinuousBaselineMinute:] {
		distance := sample.UsedBytes - baseline
		if distance < 0 {
			distance = -distance
		}

		drift = max(drift, distance)

		if distance > ContinuousBoundBytes {
			verdict.Status = StatusFail
			verdict.Findings = append(verdict.Findings, fmt.Sprintf(
				"minute %d: %d bytes used, %+d from the minute-5 sample, past 2 MiB",
				sample.Minute, sample.UsedBytes, sample.UsedBytes-baseline))
		}
	}

	verdict.MaxDriftBytes = &drift

	return verdict
}

// ContinuousReport is one run of the check, written as report.json and report.md.
type ContinuousReport struct {
	Profile       string    `json:"profile"`
	Browser       string    `json:"browser"`
	Minutes       int       `json:"minutes"`
	EnvID         string    `json:"envId"`
	RunEnvID      string    `json:"runEnvId,omitempty"`
	Started       time.Time `json:"started"`
	Finished      time.Time `json:"finished"`
	Rule          string    `json:"rule"`
	NoEgressLayer string    `json:"noEgressLayer"`
	// Status is pass or fail once judged, or failed when the run could not complete.
	Status  string `json:"status"`
	Verdict string `json:"verdict"`
	Error   string `json:"error,omitempty"`
	// Heap is the judged sample file.
	Heap     HeapVerdict       `json:"heap"`
	SelfTest *Throughput       `json:"selfTest,omitempty"`
	Egress   map[string]uint64 `json:"egress,omitempty"`
	// Export is the sample file, relative to the report directory.
	Export              string   `json:"export"`
	EnvironmentalLimits []string `json:"environmentalLimits"`
	CannotProve         string   `json:"cannotProve"`
}

// NewContinuousReport starts a report of the check with its fixed statements.
func NewContinuousReport(minutes int, envID string, started time.Time) *ContinuousReport {
	return &ContinuousReport{
		Profile:             ContinuousProfile,
		Browser:             ContinuousBrowser,
		Minutes:             minutes,
		EnvID:               envID,
		Started:             started.UTC(),
		Rule:                ContinuousRule,
		NoEgressLayer:       NoEgressLayer,
		Status:              StatusFailed,
		Export:              ContinuousExport(),
		EnvironmentalLimits: EnvironmentalLimits,
		CannotProve:         CannotProve,
	}
}

// ContinuousDir is where the check's report goes: <root>/continuous-<UTC>-<envid>.
func ContinuousDir(root string, started time.Time, envID string) string {
	return Dir(root, continuousReportDir, started, envID)
}

// Judge turns the run into pass or fail from the sample file's contents, or the error reading it,
// which fails it; a run that could not complete stays failed. Its netguard counters must all be
// present and zero.
func (r *ContinuousReport) Judge(data []byte, readErr error) {
	if readErr != nil {
		r.Heap = HeapVerdict{
			Status:   StatusFail,
			Findings: []string{"the sample file is missing: " + readErr.Error()},
		}
	} else {
		r.Heap = JudgeHeap(data, r.Minutes)
	}

	if r.Error != "" {
		r.Status = StatusFailed
		r.Verdict = "failed: " + r.Error

		return
	}

	r.Status = r.Heap.Status
	findings := r.Heap.Findings

	if !countersClean(r.Egress) {
		r.Status = StatusFail
		findings = append(findings, "netguard counters not all present and zero: "+egress(r.Egress))
	}

	if r.Status == StatusPass {
		r.Verdict = fmt.Sprintf(
			"pass: minutes 5 to %d within %d bytes of the minute-5 sample (largest %d)",
			r.Minutes,
			ContinuousBoundBytes,
			*r.Heap.MaxDriftBytes,
		)

		return
	}

	r.Verdict = "fail: " + strings.Join(findings, "; ")
}

// Write writes report.json and report.md into dir, creating it.
func (r *ContinuousReport) Write(dir string) error {
	return writeReport(dir, r, r.Markdown())
}

// Markdown renders the report for docs/engineering/harness-runs/<version>.md.
func (r *ContinuousReport) Markdown() string {
	var out strings.Builder

	fmt.Fprintf(&out, "# BitGauge Continuous memory check\n\n")
	fmt.Fprintf(&out, "- Profile: `%s`, %s, %d minutes\n", r.Profile, r.Browser, r.Minutes)
	fmt.Fprintf(&out, "- Environment: `%s` (run `%s`)\n", r.EnvID, r.RunEnvID)
	fmt.Fprintf(
		&out,
		"- Started %s, finished %s\n",
		r.Started.UTC().Format(time.RFC3339),
		r.Finished.UTC().Format(time.RFC3339),
	)
	fmt.Fprintf(&out, "- Rule: %s\n", r.Rule)
	fmt.Fprintf(&out, "- No-egress layer: %s\n", r.NoEgressLayer)
	fmt.Fprintf(&out, "- Self-test (down / up): %s\n", throughput(r.SelfTest, true))
	fmt.Fprintf(&out, "- Egress: %s\n", egress(r.Egress))
	fmt.Fprintf(&out, "- Worker: %s\n\n", cell(r.Heap.WorkerURL))
	fmt.Fprintf(&out, "**%s**\n\n", r.Verdict)

	if len(r.Heap.Samples) > 0 {
		out.WriteString("| Minute | Used (bytes) | Total (bytes) | From minute 5 (bytes) |\n")
		out.WriteString("| --- | --- | --- | --- |\n")

		for _, sample := range r.Heap.Samples {
			from := "—"
			if r.Heap.BaselineBytes != nil && sample.Minute >= ContinuousBaselineMinute {
				from = fmt.Sprintf("%+d", sample.UsedBytes-*r.Heap.BaselineBytes)
			}

			fmt.Fprintf(
				&out,
				"| %d | %d | %d | %s |\n",
				sample.Minute,
				sample.UsedBytes,
				sample.TotalBytes,
				from,
			)
		}

		out.WriteString("\n")
	}

	out.WriteString("## Environmental limits\n\n")

	for _, limit := range r.EnvironmentalLimits {
		fmt.Fprintf(&out, "- %s\n", limit)
	}

	fmt.Fprintf(&out, "\n%s\n", r.CannotProve)

	return out.String()
}
