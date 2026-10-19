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

// Run statuses before judgment: a run that completed is recorded until Judge turns it into pass,
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
		"behavior must be re-checked on real Safari.",
	"Mobile power management: device runs happen with the screen on.",
}

// CannotProve is the closing statement of testing.md section 5.
const CannotProve = "What the harness cannot prove: " +
	"real Wi-Fi behavior, real VPN MTU effects, carrier-grade NAT, " +
	"and anything about networks the project does not target."

// A report is the operator's own: private to them, like the dist tree it sits in.
const (
	dirMode  = 0o750
	fileMode = 0o600
)

const (
	msPerSecond = 1000
	bytesPerMB  = 1e6
	// runColumns is the number of columns of the report's runs table.
	runColumns = 19
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

// LoadedLatency is a direction's loaded latency without its series (measurement.md sections 11.4
// and 17): measured from its source, with the increase over idle beside an idle median, or
// unavailable with its reason.
type LoadedLatency struct {
	Source     string   `json:"source,omitempty"`
	Status     string   `json:"status,omitempty"`
	Reason     string   `json:"reason,omitempty"`
	Samples    int      `json:"samples"`
	MedianMs   float64  `json:"medianMs,omitempty"`
	P90Ms      float64  `json:"p90Ms,omitempty"`
	IncreaseMs *float64 `json:"increaseMs,omitempty"`
}

// Responsiveness is a direction's HTTP loaded responsiveness, path B (measurement.md sections 12.6
// and 17): its state, the protocol and samples it rests on, and the RPM when measured or
// uncertain.
type Responsiveness struct {
	State    string  `json:"state"`
	Protocol string  `json:"protocol"`
	Samples  int     `json:"samples"`
	RPM      float64 `json:"rpm,omitempty"`
}

// Direction is one direction of a result, as the harness records it.
type Direction struct {
	Status         string          `json:"status"`
	BitsPerSecond  float64         `json:"bitsPerSecond"`
	WindowMs       float64         `json:"windowMs"`
	Bytes          float64         `json:"bytes"`
	Streams        int             `json:"streams"`
	Confidence     *Confidence     `json:"confidence,omitempty"`
	LoadedLatency  *LoadedLatency  `json:"loadedLatency,omitempty"`
	Responsiveness *Responsiveness `json:"responsiveness,omitempty"`
}

// Bufferbloat is the result's grade (measurement.md section 11.3): its letter, the directions it
// was read from and the increase it was read from.
type Bufferbloat struct {
	Grade      string  `json:"grade"`
	Basis      string  `json:"basis"`
	IncreaseMs float64 `json:"increaseMs"`
}

// ResultSummary is what the harness keeps of an exported result (measurement.md section 17): the
// headline per direction, its steady window and loaded latency, the grade, the data used and the
// notices.
type ResultSummary struct {
	Status        string            `json:"status"`
	Preset        string            `json:"preset"`
	Protocol      string            `json:"protocol"`
	Download      *Direction        `json:"download,omitempty"`
	Upload        *Direction        `json:"upload,omitempty"`
	Bufferbloat   *Bufferbloat      `json:"bufferbloat,omitempty"`
	DataUsedBytes float64           `json:"dataUsedBytes"`
	Notices       []json.RawMessage `json:"notices"`
}

// NoticeCodes are the codes of the result's notices.
func (r *ResultSummary) NoticeCodes() []string {
	codes := make([]string, 0, len(r.Notices))

	for _, raw := range r.Notices {
		var notice struct {
			Code string `json:"code"`
		}

		if json.Unmarshal(raw, &notice) == nil {
			codes = append(codes, notice.Code)
		}
	}

	return codes
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
			Bufferbloat   *Bufferbloat      `json:"bufferbloat"`
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
		Bufferbloat:   result.Bufferbloat,
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
	// SelfTest is what the shaper self-test judged: the rate each direction's tbf sent while iperf3
	// saturated it, within 5 % of the configured rate.
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
	// Verdict is the run's judgment in one line, and Findings what made it fail or inconclusive.
	Verdict  string   `json:"verdict,omitempty"`
	Findings []string `json:"findings,omitempty"`
	// Ping is the ICMP ping that ran concurrently with the browser, the loaded-latency reference.
	Ping *Ping `json:"ping,omitempty"`
	// ClientUsage is the client's CPU and memory over the browser run.
	ClientUsage *Usage `json:"clientUsage,omitempty"`
	// Egress is the netguard counters at the end of the run; all must be zero.
	Egress map[string]uint64 `json:"egress,omitempty"`
	// Export is the path of the downloaded result, relative to the report directory.
	Export string `json:"export,omitempty"`
	// Compat is what the compatibility step recorded on a Compat profile (testing.md section 5).
	Compat *Compat `json:"compat,omitempty"`
}

// Report is one harness invocation.
type Report struct {
	Tier                Tier      `json:"tier"`
	EnvID               string    `json:"envId"`
	Started             time.Time `json:"started"`
	Finished            time.Time `json:"finished"`
	Tolerances          string    `json:"tolerances"`
	LatencyRule         string    `json:"latencyRule"`
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
		LatencyRule:         LatencyRule,
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
	fmt.Fprintf(&out, "- Loaded latency: %s\n", r.LatencyRule)
	fmt.Fprintf(&out, "- No-egress layer: %s\n\n", r.NoEgressLayer)

	out.WriteString("## Runs\n\n")
	out.WriteString(
		"| Profile | Browser | Attempt | Status | Self-test down / up | iperf3 before down / up | " +
			"iperf3 after down / up | Reference down / up | Download | Upload | " +
			"Loaded latency down / up | Ping idle / down / up | Grade | Path B down / up | " +
			"Data used | Client CPU and memory | Egress | Compatibility clients | Verdict |\n",
	)
	out.WriteString("|" + strings.Repeat(" --- |", runColumns) + "\n")

	for index := range r.Runs {
		run := &r.Runs[index]

		fmt.Fprintf(
			&out,
			"|"+strings.Repeat(" %s |", runColumns)+"\n",
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
			loaded(run.Result),
			pingFigures(run.Ping),
			grade(run.Result),
			pathB(run.Result),
			dataUsed(run.Result),
			usage(run.ClientUsage),
			egress(run.Egress),
			compatClients(run.Compat),
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

// loaded is each direction's loaded latency: its increase over idle and its source, or why it has
// none.
func loaded(result *ResultSummary) string {
	if result == nil {
		return "—"
	}

	parts := make([]string, 0, 2)

	for _, dir := range []*Direction{result.Download, result.Upload} {
		switch {
		case dir == nil || dir.LoadedLatency == nil:
			parts = append(parts, "—")
		case dir.LoadedLatency.Status != "":
			parts = append(parts, dir.LoadedLatency.Status+" ("+dir.LoadedLatency.Reason+")")
		case dir.LoadedLatency.IncreaseMs == nil:
			parts = append(
				parts,
				fmt.Sprintf(
					"%.1f ms, no increase (%s)",
					dir.LoadedLatency.MedianMs,
					dir.LoadedLatency.Source,
				),
			)
		default:
			parts = append(parts, fmt.Sprintf(
				"%+.1f ms (%s, %d samples)",
				*dir.LoadedLatency.IncreaseMs,
				dir.LoadedLatency.Source,
				dir.LoadedLatency.Samples,
			))
		}
	}

	return strings.Join(parts, " / ")
}

// pingFigures is the ping's idle median and each direction's increase over it.
func pingFigures(ping *Ping) string {
	if ping == nil || ping.Idle == nil {
		return "—"
	}

	parts := []string{fmt.Sprintf("%.1f ms", ping.Idle.MedianMs)}

	for _, phase := range []*PingPhase{ping.Download, ping.Upload} {
		if phase == nil || phase.IncreaseMs == nil {
			parts = append(parts, "—")

			continue
		}

		parts = append(parts, fmt.Sprintf("%+.1f ms", *phase.IncreaseMs))
	}

	return strings.Join(parts, " / ")
}

func grade(result *ResultSummary) string {
	if result == nil || result.Bufferbloat == nil {
		return "—"
	}

	return fmt.Sprintf(
		"%s (%s, %+.1f ms)",
		result.Bufferbloat.Grade,
		result.Bufferbloat.Basis,
		result.Bufferbloat.IncreaseMs,
	)
}

// pathB is each direction's path B state, with its RPM and protocol where it has them.
func pathB(result *ResultSummary) string {
	if result == nil {
		return "—"
	}

	parts := make([]string, 0, 2)

	for _, dir := range []*Direction{result.Download, result.Upload} {
		switch {
		case dir == nil || dir.Responsiveness == nil:
			parts = append(parts, "—")
		case dir.Responsiveness.RPM > 0:
			parts = append(parts, fmt.Sprintf("%s, %.0f RPM (%s, %d samples)",
				dir.Responsiveness.State, dir.Responsiveness.RPM, dir.Responsiveness.Protocol,
				dir.Responsiveness.Samples))
		default:
			parts = append(parts, dir.Responsiveness.State)
		}
	}

	return strings.Join(parts, " / ")
}

// compatClients is each compatibility client's download and upload, with goresponsiveness's RPM.
func compatClients(compat *Compat) string {
	if compat == nil {
		return "—"
	}

	clients := []struct {
		name   string
		client *CompatClient
	}{
		{"librespeed-cli", compat.LibreSpeed},
		{"goresponsiveness", compat.GoResponsiveness},
		{"OpenSpeedTest UI", compat.OpenSpeedTest},
	}
	parts := make([]string, 0, len(clients))

	for _, entry := range clients {
		if entry.client == nil {
			continue
		}

		part := entry.name + " " + rate(entry.client.DownloadBitsPerSecond) + " / " +
			rate(entry.client.UploadBitsPerSecond)
		if entry.client.RPM > 0 {
			part += fmt.Sprintf(", %.0f RPM", entry.client.RPM)
		}

		if entry.client.Estimate {
			part += " (estimate)"
		}

		parts = append(parts, part)
	}

	if len(parts) == 0 {
		return "—"
	}

	return cell(strings.Join(parts, "; "))
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
