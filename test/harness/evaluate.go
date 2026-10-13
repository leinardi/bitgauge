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
	"strings"
)

// The judged statuses of testing.md section 5, beside StatusRecorded and StatusFailed: a completed
// run is a pass or a fail against the tolerances, or inconclusive when its reference was unstable
// twice. Inconclusive is never a pass.
const (
	StatusPass         = "pass"
	StatusFail         = "fail"
	StatusInconclusive = "inconclusive"
)

// Tolerances is what every report says about how its runs are judged.
const Tolerances = "testing.md section 5: each direction's headline against mean(iperf3 before, after), " +
	"judged per run as pass, fail or inconclusive"

// LatencyRule is the verdict of the loaded-latency rule: v0.1 has no loaded latency to judge.
const LatencyRule = "loaded latency not applicable (v0.1 measures none)"

const (
	// stabilityBound is testing.md's 5 %: iperf3 before against after, and each against the
	// configured goodput.
	stabilityBound = 0.05
	// rounding absorbs float error at a boundary; it widens no bound by any measurable amount.
	rounding = 1e-9
	// cpuBoundRate is where the browser's CPU is the limit and the result must say so.
	cpuBoundRate = 2500 * mbit
	// maxAttempts is the run and its one re-run.
	maxAttempts = 2
	percent     = 100
)

// The tolerance table of testing.md section 5.
const (
	toleranceFloor   = 0.15 // at or below 1 Mbit/s
	toleranceMiddle  = 0.10 // 10 to 100 Mbit/s, and 1 Gbit
	toleranceCeiling = 0.20 // 2.5 Gbit and above, the browser's CPU the limit
)

// Tolerance is the headline tolerance of testing.md section 5 for a profile's link rate; false
// when the table has no row for it.
func Tolerance(rateBitsPerSecond int64) (float64, bool) {
	switch {
	case rateBitsPerSecond <= mbit:
		return toleranceFloor, true
	case rateBitsPerSecond >= 10*mbit && rateBitsPerSecond <= 100*mbit:
		return toleranceMiddle, true
	case rateBitsPerSecond == gbit:
		return toleranceMiddle, true
	case rateBitsPerSecond >= cpuBoundRate:
		return toleranceCeiling, true
	default:
		return 0, false
	}
}

// exceeds is a relative difference beyond its bound.
func exceeds(ratio, bound float64) bool {
	return ratio > bound+rounding
}

// referenceProblems applies the instability rule to one direction: before and after more than 5 %
// apart, or, on a shaped link, either more than 5 % off the configured goodput.
func referenceProblems(name string, before, after, goodput float64, shaped bool) []string {
	mean := (before + after) / 2
	if mean <= 0 {
		return []string{name + ": iperf3 measured nothing"}
	}

	var problems []string

	if spread := math.Abs(before-after) / mean; exceeds(spread, stabilityBound) {
		problems = append(problems, fmt.Sprintf(
			"%s: iperf3 before (%s) and after (%s) differ by %.1f %%",
			name,
			rate(before),
			rate(after),
			spread*percent,
		))
	}

	if !shaped {
		return problems
	}

	for _, side := range []struct {
		when  string
		value float64
	}{{"before", before}, {"after", after}} {
		if off := math.Abs(side.value-goodput) / goodput; exceeds(off, stabilityBound) {
			problems = append(problems, fmt.Sprintf(
				"%s: iperf3 %s (%s) is %.1f %% off the configured goodput %s",
				name, side.when, rate(side.value), off*percent, rate(goodput)))
		}
	}

	return problems
}

// headline judges one direction's headline against its reference.
func headline(
	name string,
	dir *Direction,
	reference, tolerance float64,
	rateBitsPerSecond int64,
) (summary string, findings []string) {
	if dir == nil || dir.Status != "measured" || dir.BitsPerSecond <= 0 {
		status := "absent"
		if dir != nil {
			status = dir.Status
		}

		return "", []string{fmt.Sprintf("%s: no headline (%s)", name, status)}
	}

	deviation := dir.BitsPerSecond/reference - 1
	summary = fmt.Sprintf("%s %s vs %s (%+.1f %%, ±%.0f %%)",
		name, rate(dir.BitsPerSecond), rate(reference), deviation*percent, tolerance*percent)

	if !exceeds(math.Abs(deviation), tolerance) {
		return summary, nil
	}

	findings = []string{summary + " is outside the tolerance"}

	if rateBitsPerSecond >= cpuBoundRate &&
		(dir.Confidence == nil || dir.Confidence.Level != "cpu-bound") {
		findings = append(findings, name+": outside the tolerance without confidence: cpu-bound")
	}

	return summary, findings
}

// Judge evaluates a completed run against testing.md section 5 and records the outcome on it: its
// status, the reference when it is stable, the findings and the verdict line. A failed run stays
// failed; missing or non-zero egress counters fail any run; an unshaped run of a shaped profile is
// a debugging run, stays recorded and is not judged, and so it fails the tier (Failing).
func (r *Run) Judge(profile *Profile) {
	r.Reference = nil
	r.Findings = nil

	switch {
	case r.Status == StatusFailed:
		r.Verdict = "not judged: the run failed"

		return
	case !countersClean(r.Egress):
		r.Status = StatusFailed
		r.Findings = []string{
			"the netguard counters are missing or not zero: the run is evidence of nothing",
		}
		r.Verdict = "failed: " + r.Findings[0]

		return
	case profile.Shaped && !r.Shaped:
		r.Status = StatusRecorded
		r.Verdict = "not judged: an unshaped run of a shaped profile is a debugging run"

		return
	case r.Result == nil || r.ReferenceBefore == nil || r.ReferenceAfter == nil:
		r.Status = StatusFailed
		r.Findings = []string{"the run lacks its result or an iperf3 reference"}
		r.Verdict = "failed: " + r.Findings[0]

		return
	}

	goodput := ExpectedGoodput(profile.RateBitsPerSecond)
	before, after := r.ReferenceBefore, r.ReferenceAfter

	unstable := referenceProblems(
		"download",
		before.DownloadBitsPerSecond,
		after.DownloadBitsPerSecond,
		goodput,
		r.Shaped,
	)
	unstable = append(
		unstable,
		referenceProblems(
			"upload",
			before.UploadBitsPerSecond,
			after.UploadBitsPerSecond,
			goodput,
			r.Shaped,
		)...)

	if len(unstable) > 0 {
		r.Status = StatusInconclusive
		r.Findings = unstable
		r.Verdict = "inconclusive: unstable reference; " + strings.Join(unstable, "; ")

		return
	}

	reference := &Throughput{
		DownloadBitsPerSecond: (before.DownloadBitsPerSecond + after.DownloadBitsPerSecond) / 2,
		UploadBitsPerSecond:   (before.UploadBitsPerSecond + after.UploadBitsPerSecond) / 2,
		Seconds:               before.Seconds,
	}
	r.Reference = reference
	r.judgeHeadlines(profile, reference)
}

func (r *Run) judgeHeadlines(profile *Profile, reference *Throughput) {
	var findings []string

	if r.Result.Status != "complete" {
		findings = append(findings, fmt.Sprintf("the result is %s, not complete", r.Result.Status))
	}

	tolerance, ok := Tolerance(profile.RateBitsPerSecond)
	if !ok {
		findings = append(
			findings,
			"testing.md section 5 has no tolerance for "+rate(float64(profile.RateBitsPerSecond)),
		)
		r.Status = StatusFail
		r.Findings = findings
		r.Verdict = "fail: " + strings.Join(findings, "; ")

		return
	}

	download, downloadFindings := headline(
		"download",
		r.Result.Download,
		reference.DownloadBitsPerSecond,
		tolerance,
		profile.RateBitsPerSecond,
	)
	upload, uploadFindings := headline(
		"upload",
		r.Result.Upload,
		reference.UploadBitsPerSecond,
		tolerance,
		profile.RateBitsPerSecond,
	)
	findings = append(append(findings, downloadFindings...), uploadFindings...)

	var parts []string

	for _, part := range []string{download, upload, LatencyRule} {
		if part != "" {
			parts = append(parts, part)
		}
	}

	r.Findings = findings
	r.Status = StatusPass

	if len(findings) > 0 {
		r.Status = StatusFail

		parts = append(parts, strings.Join(findings, "; "))
	}

	r.Verdict = r.Status + ": " + strings.Join(parts, "; ")
}

// ShouldRerun is the re-run-once rule: an inconclusive first attempt is run again, and the second
// attempt's verdict is final.
func ShouldRerun(run *Run, attempt int) bool {
	return run.Status == StatusInconclusive && attempt < maxAttempts
}

// Failing reports whether a final run fails the tier: every status but pass does, a recorded
// debugging run included, which is never evidence. An attempt a re-run superseded is not final.
func (r *Run) Failing() bool {
	return !r.Rerun && r.Status != StatusPass
}

// CounterNames are netguard's counters (netguard.Egress, DNS and Loopback), every one of which a
// run must carry. netguard builds only under the image and harness tags, so the untagged evaluator
// names them itself; TestCounterNamesFollowNetguard holds the two lists together.
var CounterNames = []string{"egress", "dns", "loopback"}

// countersClean is netguard's whole set of counters, each present and zero.
func countersClean(counters map[string]uint64) bool {
	for _, name := range CounterNames {
		if packets, ok := counters[name]; !ok || packets != 0 {
			return false
		}
	}

	for _, packets := range counters {
		if packets != 0 {
			return false
		}
	}

	return true
}
