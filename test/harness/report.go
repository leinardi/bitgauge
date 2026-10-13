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
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Run statuses before judgement: a run that completed is recorded until Judge turns it into pass,
// fail or inconclusive (evaluate.go); a run that could not complete is failed. Recorded stays only
// on a debugging run that is not judged.
const (
	StatusRecorded = "recorded"
	StatusFailed   = "failed"
)

// NoEgressLayer names the no-egress claim a harness run makes (testing.md section 5): netguard's,
// not the image test's syscall layer.
const NoEgressLayer = "no packet egress (netguard counters, from BitGauge's start to the end of the run)"

// EnvironmentalLimits is the list testing.md section 5 requires in every report.
var EnvironmentalLimits = []string{
	"tc shaping jitter (tbf burst sizes, netem timer granularity).",
	"Docker bridge overhead at high rates.",
	"Playwright WebKit ≠ Safari: Worker XHR and nextHopProtocol " +
		"behaviour must be re-checked on real Safari.", //nolint:misspell // testing.md's spelling, verbatim
	"Mobile power management: device runs happen with the screen on.",
}

// CannotProve is the closing statement of testing.md section 5.
const CannotProve = "What the harness cannot prove: " +
	"real Wi-Fi behaviour, real VPN MTU effects, carrier-grade NAT, " + //nolint:misspell // testing.md's spelling, verbatim
	"and anything about networks the project does not target."

// A report is the operator's own: private to them, like the dist tree it sits in.
const (
	dirMode  = 0o750
	fileMode = 0o600
)

const (
	msPerSecond = 1000
	bytesPerMB  = 1e6
)

var errNoResult = errors.New("the export holds no result")

// Throughput is one iperf3 measurement in both directions.
type Throughput struct {
	DownloadBitsPerSecond float64 `json:"downloadBitsPerSecond"`
	UploadBitsPerSecond   float64 `json:"uploadBitsPerSecond"`
	Seconds               float64 `json:"seconds"`
}

// Confidence is a direction's confidence level; the ceiling tier needs cpu-bound.
type Confidence struct {
	Level string `json:"level"`
}

// Direction is one direction of a result, as the harness records it.
type Direction struct {
	Status        string      `json:"status"`
	BitsPerSecond float64     `json:"bitsPerSecond"`
	WindowMs      float64     `json:"windowMs"`
	Bytes         float64     `json:"bytes"`
	Confidence    *Confidence `json:"confidence,omitempty"`
}

// ResultSummary is what the harness keeps of an exported result (measurement.md section 17): the
// headline per direction, its steady window, the data used and the notices.
type ResultSummary struct {
	Status        string            `json:"status"`
	Preset        string            `json:"preset"`
	Protocol      string            `json:"protocol"`
	Download      *Direction        `json:"download,omitempty"`
	Upload        *Direction        `json:"upload,omitempty"`
	DataUsedBytes float64           `json:"dataUsedBytes"`
	Notices       []json.RawMessage `json:"notices"`
}

// SummarizeExport reads the Download JSON export of one result: the history export format with a
// single entry (frontend.md section 5).
func SummarizeExport(data []byte) (ResultSummary, error) {
	var export struct {
		Format  string `json:"format"`
		Results []struct {
			Status   string `json:"status"`
			Settings struct {
				Preset string `json:"preset"`
			} `json:"settings"`
			Client struct {
				Protocol string `json:"protocol"`
			} `json:"client"`
			Download      *Direction        `json:"download"`
			Upload        *Direction        `json:"upload"`
			DataUsedBytes float64           `json:"dataUsedBytes"`
			Notices       []json.RawMessage `json:"notices"`
		} `json:"results"`
	}

	err := json.Unmarshal(data, &export)
	if err != nil {
		return ResultSummary{}, fmt.Errorf("read the export: %w", err)
	}

	if export.Format != "bitgauge.history" || len(export.Results) != 1 {
		return ResultSummary{}, fmt.Errorf(
			"%w: format %q with %d results, want bitgauge.history with one",
			errNoResult,
			export.Format,
			len(export.Results),
		)
	}

	result := export.Results[0]

	return ResultSummary{
		Status:        result.Status,
		Preset:        result.Settings.Preset,
		Protocol:      result.Client.Protocol,
		Download:      result.Download,
		Upload:        result.Upload,
		DataUsedBytes: result.DataUsedBytes,
		Notices:       result.Notices,
	}, nil
}

// Run is one profile in one browser.
type Run struct {
	Profile string `json:"profile"`
	// EnvID is the run's own test environment, the label its containers carried.
	EnvID   string `json:"envId,omitempty"`
	Browser string `json:"browser"`
	Status  string `json:"status"`
	Error   string `json:"error,omitempty"`
	// Shaped is false for an unshaped (ceiling) run, which has no shaper and no self-test.
	Shaped bool `json:"shaped"`
	// SelfTest is the measurement the shaper self-test judged: each direction within 5 % of the
	// goodput the configured rate lets through (ExpectedGoodput).
	SelfTest *Throughput `json:"selfTest,omitempty"`
	// ReferenceBefore and ReferenceAfter are the raw iperf3 runs either side of the browser run.
	ReferenceBefore *Throughput `json:"referenceBefore,omitempty"`
	ReferenceAfter  *Throughput `json:"referenceAfter,omitempty"`
	// Reference is mean(before, after), set only when the pair is stable.
	Reference *Throughput    `json:"reference,omitempty"`
	Result    *ResultSummary `json:"result,omitempty"`
	// Attempt is 1, or 2 for the re-run of an inconclusive first attempt; Rerun marks an attempt
	// the re-run superseded, which stays in the report with its raw values.
	Attempt int  `json:"attempt"`
	Rerun   bool `json:"rerun,omitempty"`
	// Verdict is the run's judgement in one line, and Findings what made it fail or inconclusive.
	Verdict  string   `json:"verdict,omitempty"`
	Findings []string `json:"findings,omitempty"`
	// Ping is the summary of the ICMP ping that ran concurrently with the browser, as ping
	// printed it.
	Ping string `json:"ping,omitempty"`
	// ClientUsage is the client's CPU and memory over the browser run.
	ClientUsage *Usage `json:"clientUsage,omitempty"`
	// Egress is the netguard counters at the end of the run; all must be zero.
	Egress map[string]uint64 `json:"egress,omitempty"`
	// Export is the path of the downloaded result, relative to the report directory.
	Export string `json:"export,omitempty"`
}

// Report is one harness invocation.
type Report struct {
	Tier                Tier      `json:"tier"`
	EnvID               string    `json:"envId"`
	Started             time.Time `json:"started"`
	Finished            time.Time `json:"finished"`
	Tolerances          string    `json:"tolerances"`
	NoEgressLayer       string    `json:"noEgressLayer"`
	Runs                []Run     `json:"runs"`
	Manual              []string  `json:"manual,omitempty"`
	EnvironmentalLimits []string  `json:"environmentalLimits"`
	CannotProve         string    `json:"cannotProve"`
}

// NewReport starts a report with the fixed statements every report carries.
func NewReport(spec *TierSpec, envID string, started time.Time) *Report {
	return &Report{
		Tier:                spec.Tier,
		EnvID:               envID,
		Started:             started.UTC(),
		Tolerances:          Tolerances,
		NoEgressLayer:       NoEgressLayer,
		Manual:              spec.Manual,
		EnvironmentalLimits: EnvironmentalLimits,
		CannotProve:         CannotProve,
	}
}

// Dir is where a report goes: <root>/<tier>-<UTC>-<envid> (testing.md section 5.1).
func Dir(root string, tier Tier, started time.Time, envID string) string {
	return filepath.Join(root, string(tier)+"-"+started.UTC().Format("20060102T150405Z")+"-"+envID)
}

// Write writes report.json and report.md into dir, creating it.
func (r *Report) Write(dir string) error {
	err := os.MkdirAll(dir, dirMode)
	if err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}

	encoded, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return fmt.Errorf("encode the report: %w", err)
	}

	err = os.WriteFile(filepath.Join(dir, "report.json"), append(encoded, '\n'), fileMode)
	if err != nil {
		return fmt.Errorf("write report.json: %w", err)
	}

	err = os.WriteFile(filepath.Join(dir, "report.md"), []byte(r.Markdown()), fileMode)
	if err != nil {
		return fmt.Errorf("write report.md: %w", err)
	}

	return nil
}

// Markdown renders the report for the CI step summary and for docs/engineering/harness-runs.
func (r *Report) Markdown() string {
	var out strings.Builder

	fmt.Fprintf(&out, "# Accuracy harness: %s tier\n\n", r.Tier)
	fmt.Fprintf(&out, "- Environment: `%s`\n", r.EnvID)
	fmt.Fprintf(&out, "- Started: %s\n", r.Started.Format(time.RFC3339))
	fmt.Fprintf(&out, "- Finished: %s\n", r.Finished.UTC().Format(time.RFC3339))
	fmt.Fprintf(&out, "- Tolerances: %s\n", r.Tolerances)
	fmt.Fprintf(&out, "- No-egress layer: %s\n\n", r.NoEgressLayer)

	out.WriteString("## Runs\n\n")
	out.WriteString(
		"| Profile | Browser | Attempt | Status | Self-test down / up | iperf3 before down / up | " +
			"iperf3 after down / up | Reference down / up | Download | Upload | Data used | " +
			"Client CPU and memory | Egress | Verdict |\n",
	)
	out.WriteString(
		"| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n",
	)

	for index := range r.Runs {
		run := &r.Runs[index]

		fmt.Fprintf(
			&out,
			"| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |\n",
			run.Profile,
			run.Browser,
			attempt(run),
			status(run),
			throughput(run.SelfTest, run.Shaped),
			throughput(run.ReferenceBefore, true),
			throughput(run.ReferenceAfter, true),
			throughput(run.Reference, true),
			direction(run.Result, true),
			direction(run.Result, false),
			dataUsed(run.Result),
			usage(run.ClientUsage),
			egress(run.Egress),
			cell(run.Verdict),
		)
	}

	if len(r.Manual) > 0 {
		out.WriteString("\n## Manual runs this tier requires\n\n")

		for _, manual := range r.Manual {
			fmt.Fprintf(&out, "- %s\n", manual)
		}
	}

	out.WriteString("\n## Environmental limits\n\n")

	for _, limit := range r.EnvironmentalLimits {
		fmt.Fprintf(&out, "- %s\n", limit)
	}

	fmt.Fprintf(&out, "\n%s\n", r.CannotProve)

	return out.String()
}

func status(run *Run) string {
	if run.Error == "" {
		return run.Status
	}

	return run.Status + ": " + cell(run.Error)
}

// attempt is the attempt number, and says when a re-run superseded it.
func attempt(run *Run) string {
	if run.Rerun {
		return strconv.Itoa(run.Attempt) + " (re-run)"
	}

	return strconv.Itoa(run.Attempt)
}

// cell keeps a value inside its Markdown table cell.
func cell(value string) string {
	if value == "" {
		return "—"
	}

	return strings.ReplaceAll(value, "|", `\|`)
}

func throughput(value *Throughput, shaped bool) string {
	if !shaped {
		return "unshaped"
	}

	if value == nil {
		return "—"
	}

	return rate(value.DownloadBitsPerSecond) + " / " + rate(value.UploadBitsPerSecond)
}

func direction(result *ResultSummary, download bool) string {
	if result == nil {
		return "—"
	}

	dir := result.Upload
	if download {
		dir = result.Download
	}

	if dir == nil {
		return "—"
	}

	return fmt.Sprintf(
		"%s (%s, %.1f s window)",
		rate(dir.BitsPerSecond),
		dir.Status,
		dir.WindowMs/msPerSecond,
	)
}

func dataUsed(result *ResultSummary) string {
	if result == nil {
		return "—"
	}

	return strconv.FormatFloat(result.DataUsedBytes/bytesPerMB, 'f', 1, 64) + " MB"
}

func usage(value *Usage) string {
	if value == nil {
		return "—"
	}

	cores := 0.0
	if value.WallSeconds > 0 {
		cores = value.CPUSeconds / value.WallSeconds
	}

	return fmt.Sprintf(
		"%.1f s CPU in %.1f s (%.2f cores), %.1f MB peak",
		value.CPUSeconds,
		value.WallSeconds,
		cores,
		float64(value.PeakMemoryBytes)/bytesPerMB,
	)
}

func egress(counters map[string]uint64) string {
	if counters == nil {
		return "—"
	}

	var total uint64
	for _, packets := range counters {
		total += packets
	}

	if total == 0 {
		return "0"
	}

	return fmt.Sprintf("%d packets: %v", total, counters)
}

// rate formats bits per second with the largest unit that keeps the value at or above one.
func rate(bitsPerSecond float64) string {
	switch {
	case bitsPerSecond >= gbit:
		return strconv.FormatFloat(bitsPerSecond/gbit, 'f', 2, 64) + " Gbit/s"
	case bitsPerSecond >= mbit:
		return strconv.FormatFloat(bitsPerSecond/mbit, 'f', 2, 64) + " Mbit/s"
	default:
		return strconv.FormatFloat(bitsPerSecond/kbit, 'f', 1, 64) + " kbit/s"
	}
}
