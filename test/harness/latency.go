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
	"fmt"
	"math"
	"slices"
	"strings"
)

// The loaded-latency rule of testing.md section 5: each direction measured with the WebSocket or
// the reserved HTTP/1.1 probe is held to the concurrent ICMP ping's increase over idle, and the
// grade to the letter of the larger ping increase its basis names. A direction measured over an
// HTTP/2 or HTTP/3 probe waits behind its own load connection's data, which the ping does not, so
// it is recorded with the ping figures and not judged.

// The loaded-latency sources of measurement.md section 11.
const (
	SourceWebSocket = "websocket"
	SourceReserved  = "http-h1-reserved"
)

const (
	// latencyTolerance and latencyFloorMs are the rule's ±20 % or 5 ms, whichever is larger.
	latencyTolerance = 0.20
	latencyFloorMs   = 5
	// minFallbackSamples, maxReservedStreams and reservationNotice are what the ws-blocked profile
	// must show: the reserved probe with at least 10 samples, at most 5 streams beside it, and the
	// notice that says so.
	minFallbackSamples = 10
	maxReservedStreams = 5
	reservationNotice  = "probe-reservation"
	basisBoth          = "download+upload"
)

// gradeLetters and gradeThresholds are measurement.md section 11.3's table: an increase below a
// threshold has the letter at its index, one at or above the last has the last letter.
var (
	gradeLetters    = []string{"A+", "A", "B", "C", "D", "F"}
	gradeThresholds = []float64{5, 30, 60, 200, 400}
)

// gradeFor is the letter of an increase.
func gradeFor(increaseMs float64) string {
	for index, threshold := range gradeThresholds {
		if increaseMs < threshold {
			return gradeLetters[index]
		}
	}

	return gradeLetters[len(gradeLetters)-1]
}

// toleranceMs is the rule's allowance around a ping increase: 20 % of it, or 5 ms when larger.
func toleranceMs(pingIncreaseMs float64) float64 {
	return max(latencyTolerance*math.Abs(pingIncreaseMs), latencyFloorMs)
}

// allowedGrades is the ping increase's letter, and the letter across a threshold that lies within
// the tolerance of it.
func allowedGrades(pingIncreaseMs float64) []string {
	allowed := []string{gradeFor(pingIncreaseMs)}
	tolerance := toleranceMs(pingIncreaseMs)

	for index, threshold := range gradeThresholds {
		if math.Abs(pingIncreaseMs-threshold) > tolerance+rounding {
			continue
		}

		for _, letter := range gradeLetters[index : index+2] {
			if !slices.Contains(allowed, letter) {
				allowed = append(allowed, letter)
			}
		}
	}

	return allowed
}

// judged reports whether the rule judges a source; the others are recorded.
func judged(source string) bool {
	return source == SourceWebSocket || source == SourceReserved
}

// judgeLoaded holds one direction's loaded latency to the ping's increase in its window. recorded
// is true for a direction the rule does not judge.
func judgeLoaded(
	name string,
	dir *Direction,
	ping *PingPhase,
) (summary string, recorded bool, findings []string) {
	if dir == nil || dir.LoadedLatency == nil {
		return "", false, []string{name + ": no loaded latency"}
	}

	loaded := dir.LoadedLatency
	figures := "no ping samples"

	if ping != nil && ping.IncreaseMs != nil {
		figures = fmt.Sprintf("ping %+.1f ms", *ping.IncreaseMs)
	}

	if loaded.Source != "" && !judged(loaded.Source) {
		return fmt.Sprintf(
			"%s loaded latency over %s recorded, not judged (%s)",
			name,
			loaded.Source,
			figures,
		), true, nil
	}

	switch {
	case loaded.Status != "":
		return "", false, []string{
			fmt.Sprintf("%s: loaded latency %s (%s)", name, loaded.Status, loaded.Reason),
		}
	case loaded.IncreaseMs == nil:
		return "", false, []string{name + ": loaded latency without an increase over idle"}
	case ping == nil || ping.IncreaseMs == nil:
		return "", false, []string{
			name + ": the ping has no samples in the direction's window, or none in idle latency's",
		}
	}

	tolerance := toleranceMs(*ping.IncreaseMs)
	summary = fmt.Sprintf("%s loaded %+.1f ms (%s) vs ping %+.1f ms (±%.1f ms)",
		name, *loaded.IncreaseMs, loaded.Source, *ping.IncreaseMs, tolerance)

	if math.Abs(*loaded.IncreaseMs-*ping.IncreaseMs) > tolerance+rounding {
		return summary, false, []string{summary + " is outside the tolerance"}
	}

	return summary, false, nil
}

// judgeGrade holds the grade to the larger ping increase over the directions its basis names;
// recordedDirections are those the rule records without judging, which leave the grade recorded.
func judgeGrade(
	result *ResultSummary,
	ping *Ping,
	recordedDirections []string,
) (summary string, findings []string) {
	grade := result.Bufferbloat
	if grade == nil {
		if len(recordedDirections) > 0 {
			return "no grade, beside a direction recorded and not judged", nil
		}

		return "", []string{"no bufferbloat grade"}
	}

	basis := []string{grade.Basis}
	if grade.Basis == basisBoth {
		basis = []string{PhaseDownload, PhaseUpload}
	}

	increase := math.Inf(-1)

	for _, direction := range basis {
		if slices.Contains(recordedDirections, direction) {
			return fmt.Sprintf(
				"grade %s recorded, not judged: its basis %s includes a direction not judged",
				grade.Grade,
				grade.Basis,
			), nil
		}

		phase := ping.Download
		if direction == PhaseUpload {
			phase = ping.Upload
		}

		if phase == nil || phase.IncreaseMs == nil {
			return "", []string{
				"grade " + grade.Grade + ": the ping has no increase for " + direction,
			}
		}

		increase = max(increase, *phase.IncreaseMs)
	}

	allowed := allowedGrades(increase)
	summary = fmt.Sprintf(
		"grade %s (%s) vs ping %+.1f ms (%s)",
		grade.Grade,
		grade.Basis,
		increase,
		strings.Join(allowed, " or "),
	)

	if !slices.Contains(allowed, grade.Grade) {
		return summary, []string{summary + " is not the ping's letter"}
	}

	return summary, nil
}

// judgeFallback is what a profile that expects a fallback source must show: that source with at
// least 10 samples in each direction, at most 5 streams, and the probe-reservation notice.
func judgeFallback(expect string, result *ResultSummary) []string {
	var findings []string

	for _, direction := range []struct {
		name string
		dir  *Direction
	}{{PhaseDownload, result.Download}, {PhaseUpload, result.Upload}} {
		if direction.dir == nil || direction.dir.LoadedLatency == nil {
			continue
		}

		loaded := direction.dir.LoadedLatency
		if loaded.Source != expect {
			findings = append(
				findings,
				fmt.Sprintf(
					"%s: loaded latency from %q, want %s",
					direction.name,
					loaded.Source,
					expect,
				),
			)
		}

		if loaded.Samples < minFallbackSamples {
			findings = append(
				findings,
				fmt.Sprintf(
					"%s: %d %s samples, want at least %d",
					direction.name,
					loaded.Samples,
					expect,
					minFallbackSamples,
				),
			)
		}

		if direction.dir.Streams > maxReservedStreams {
			findings = append(
				findings,
				fmt.Sprintf("%s: %d streams beside the reserved probe, want at most %d",
					direction.name, direction.dir.Streams, maxReservedStreams),
			)
		}
	}

	if !slices.Contains(result.NoticeCodes(), reservationNotice) {
		findings = append(findings, "no "+reservationNotice+" notice")
	}

	return findings
}

// judgeLatency applies the whole rule to a run: each direction, the grade, and the expected
// fallback. It returns the summary parts the verdict carries and the findings.
func (r *Run) judgeLatency(profile *Profile) (parts, findings []string) {
	ping := r.Ping
	if ping == nil {
		ping = &Ping{}
	}

	var recordedDirections []string

	for _, direction := range []struct {
		name  string
		dir   *Direction
		phase *PingPhase
	}{{PhaseDownload, r.Result.Download, ping.Download}, {PhaseUpload, r.Result.Upload, ping.Upload}} {
		summary, recorded, problems := judgeLoaded(direction.name, direction.dir, direction.phase)
		if recorded {
			recordedDirections = append(recordedDirections, direction.name)
		}

		if summary != "" {
			parts = append(parts, summary)
		}

		findings = append(findings, problems...)
	}

	summary, problems := judgeGrade(r.Result, ping, recordedDirections)
	if summary != "" {
		parts = append(parts, summary)
	}

	findings = append(findings, problems...)

	if profile.ExpectFallback != "" {
		findings = append(findings, judgeFallback(profile.ExpectFallback, r.Result)...)
	}

	return parts, findings
}
