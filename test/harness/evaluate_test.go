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
	"math"
	"slices"
	"strings"
	"testing"
)

// zero is netguard's counters after a clean run.
func zero() map[string]uint64 {
	return map[string]uint64{"egress": 0, "dns": 0, "loopback": 0}
}

// loadedAt is a measured loaded latency over the WebSocket, increaseMs above an idle median of
// 50 ms.
func loadedAt(increaseMs float64) *LoadedLatency {
	return &LoadedLatency{
		Source:     SourceWebSocket,
		Samples:    40,
		MedianMs:   50 + increaseMs,
		IncreaseMs: new(increaseMs),
	}
}

// pingAt is the ping beside it: 50 ms idle, and each direction's increase over that.
func pingAt(downMs, upMs float64) *Ping {
	return &Ping{
		Idle:     &PingPhase{Samples: 50, MedianMs: 50},
		Download: &PingPhase{Samples: 40, MedianMs: 50 + downMs, IncreaseMs: new(downMs)},
		Upload:   &PingPhase{Samples: 40, MedianMs: 50 + upMs, IncreaseMs: new(upMs)},
	}
}

// stableRun is a completed, shaped run whose iperf3 pair sits on the configured goodput of rate,
// with both headlines at the given fractions of it, and both loaded latencies and the grade on the
// ping's 20 ms increase.
func stableRun(rate int64, downFraction, upFraction float64) Run {
	goodput := ExpectedGoodput(rate)

	return Run{
		Status: StatusRecorded,
		Shaped: true,
		ReferenceBefore: &Throughput{
			DownloadBitsPerSecond: goodput,
			UploadBitsPerSecond:   goodput,
			Seconds:               10,
		},
		ReferenceAfter: &Throughput{
			DownloadBitsPerSecond: goodput,
			UploadBitsPerSecond:   goodput,
			Seconds:               10,
		},
		Result: &ResultSummary{
			Status: "complete",
			Download: &Direction{
				Status:        "measured",
				BitsPerSecond: goodput * downFraction,
				Streams:       6,
				LoadedLatency: loadedAt(20),
			},
			Upload: &Direction{
				Status:        "measured",
				BitsPerSecond: goodput * upFraction,
				Streams:       6,
				LoadedLatency: loadedAt(20),
			},
			Bufferbloat: &Bufferbloat{Grade: "A", Basis: basisBoth, IncreaseMs: 20},
		},
		Ping:   pingAt(20, 20),
		Egress: zero(),
	}
}

func profileAt(rate int64, shaped bool) *Profile {
	return &Profile{Name: "test", RateBitsPerSecond: rate, Shaped: shaped, Preset: PresetStandard}
}

// TestTolerancesFollowTestingMD walks each row of the tolerance table at and just past its bound.
func TestTolerancesFollowTestingMD(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		rate      int64
		tolerance float64
	}{
		{300 * kbit, 0.15},
		{500 * kbit, 0.15},
		{mbit, 0.15},
		{10 * mbit, 0.10},
		{100 * mbit, 0.10},
		{gbit, 0.10},
		{2500 * mbit, 0.20},
		{10 * gbit, 0.20},
	} {
		got, ok := Tolerance(tc.rate)
		if !ok || got != tc.tolerance {
			t.Errorf("Tolerance(%d) = %v, %v; want %v", tc.rate, got, ok, tc.tolerance)
		}

		for _, sign := range []float64{1, -1} {
			at := stableRun(tc.rate, 1+sign*tc.tolerance, 1)
			at.Judge(profileAt(tc.rate, true))

			if at.Status != StatusPass {
				t.Errorf("%d at %+.0f %%: %s", tc.rate, sign*tc.tolerance*percent, at.Verdict)
			}

			past := stableRun(tc.rate, 1, 1+sign*(tc.tolerance+0.001))
			past.Judge(profileAt(tc.rate, true))

			if past.Status != StatusFail || !strings.Contains(past.Verdict, "upload") {
				t.Errorf(
					"%d past %+.1f %%: %s",
					tc.rate,
					sign*(tc.tolerance+0.001)*percent,
					past.Verdict,
				)
			}
		}
	}

	// The table has no row between its ranges; such a rate is never judged a pass.
	for _, rate := range []int64{2 * mbit, 500 * mbit, 2 * gbit} {
		if _, ok := Tolerance(rate); ok {
			t.Errorf("Tolerance(%d) has a row", rate)
		}

		run := stableRun(rate, 1, 1)
		run.Judge(profileAt(rate, true))

		if run.Status != StatusFail || !strings.Contains(run.Verdict, "no tolerance") {
			t.Errorf("%d: %s", rate, run.Verdict)
		}
	}
}

// TestInstability applies the 5 % rule: before against after, and each against the configured
// goodput; only a stable pair becomes the reference.
func TestInstability(t *testing.T) {
	t.Parallel()

	const rate = 100 * mbit

	goodput := ExpectedGoodput(rate)

	for _, tc := range []struct {
		name          string
		before, after float64
		shaped        bool
		want          string
	}{
		// mean 100, spread 5.0 %: stable; 5.1 %: unstable.
		{"5.0 % apart", goodput * 1.025, goodput * 0.975, true, StatusPass},
		{"5.1 % apart", goodput * 1.0255, goodput * 0.9745, true, StatusInconclusive},
		{"5.0 % off the goodput", goodput * 1.05, goodput * 1.05, true, StatusPass},
		{"5.1 % off the goodput", goodput * 1.051, goodput * 1.051, true, StatusInconclusive},
		{"below the goodput", goodput * 0.94, goodput * 0.94, true, StatusInconclusive},
		// Unshaped, there is no configured goodput to hold to; only the pair counts.
		{"unshaped, far from the nominal rate", goodput * 0.5, goodput * 0.5, false, StatusPass},
		{"unshaped, 5.1 % apart", goodput * 0.51275, goodput * 0.48725, false, StatusInconclusive},
	} {
		run := stableRun(rate, 1, 1)
		run.Shaped = tc.shaped
		run.ReferenceBefore.DownloadBitsPerSecond = tc.before
		run.ReferenceAfter.DownloadBitsPerSecond = tc.after
		mean := (tc.before + tc.after) / 2
		run.Result.Download.BitsPerSecond = mean

		run.Judge(profileAt(rate, tc.shaped))

		if run.Status != tc.want {
			t.Errorf("%s: %s", tc.name, run.Verdict)

			continue
		}

		switch run.Status {
		case StatusPass:
			if run.Reference == nil || run.Reference.DownloadBitsPerSecond != mean {
				t.Errorf("%s: reference %+v, want the mean %.0f", tc.name, run.Reference, mean)
			}
		case StatusInconclusive:
			if run.Reference != nil || len(run.Findings) == 0 {
				t.Errorf("%s: an unstable pair became a reference: %+v", tc.name, run)
			}

			// Both raw values stay in the report.
			if run.ReferenceBefore.DownloadBitsPerSecond != tc.before ||
				run.ReferenceAfter.DownloadBitsPerSecond != tc.after {
				t.Errorf("%s: the raw values changed", tc.name)
			}
		}
	}
}

// TestRerunOnce is the re-run accounting: an inconclusive first attempt is run again, the second
// is final, and only final runs fail the tier.
func TestRerunOnce(t *testing.T) {
	t.Parallel()

	unstable := stableRun(10*mbit, 1, 1)
	unstable.ReferenceAfter.UploadBitsPerSecond *= 0.8
	unstable.Judge(profileAt(10*mbit, true))

	if unstable.Status != StatusInconclusive || !ShouldRerun(&unstable, 1) ||
		ShouldRerun(&unstable, 2) {
		t.Fatalf("an unstable first attempt is re-run once: %s", unstable.Verdict)
	}

	unstable.Rerun = true
	if unstable.Failing() {
		t.Error("a superseded attempt fails the tier")
	}

	unstable.Rerun = false
	if !unstable.Failing() {
		t.Error("a final inconclusive run passes the tier")
	}

	// Only a pass lets the tier pass; a recorded debugging run is not evidence.
	for _, status := range []string{StatusPass, StatusFail, StatusFailed, StatusRecorded} {
		run := Run{Status: status}
		if ShouldRerun(&run, 1) {
			t.Errorf("%s is re-run", status)
		}

		if want := status != StatusPass; run.Failing() != want {
			t.Errorf("%s: failing %v", status, run.Failing())
		}
	}
}

// TestCPUBound is the ceiling rule: at 2.5 Gbit and above, a headline outside its tolerance
// without confidence: cpu-bound is a finding of its own.
func TestCPUBound(t *testing.T) {
	t.Parallel()

	run := stableRun(10*gbit, 0.7, 1)
	run.Shaped = false
	run.Judge(profileAt(10*gbit, false))

	if run.Status != StatusFail ||
		!slices.Contains(
			run.Findings,
			"download: outside the tolerance without confidence: cpu-bound",
		) {
		t.Errorf("missing cpu-bound: %s", run.Verdict)
	}

	marked := stableRun(10*gbit, 0.7, 1)
	marked.Shaped = false
	marked.Result.Download.Confidence = &Confidence{Level: "cpu-bound"}
	marked.Judge(profileAt(10*gbit, false))

	if marked.Status != StatusFail ||
		slices.ContainsFunc(
			marked.Findings,
			func(f string) bool { return strings.Contains(f, "cpu-bound") },
		) {
		t.Errorf("cpu-bound reported: %s", marked.Verdict)
	}

	// Below the ceiling range the rule does not apply.
	slow := stableRun(gbit, 0.7, 1)
	slow.Judge(profileAt(gbit, true))

	if slices.ContainsFunc(
		slow.Findings,
		func(f string) bool { return strings.Contains(f, "cpu-bound") },
	) {
		t.Errorf("1 Gbit asks for cpu-bound: %s", slow.Verdict)
	}
}

// TestJudgeRefusesWhatIsNotEvidence covers the runs that are never a pass: egress, a failed or
// incomplete run, a result that is not complete or lacks a headline, and an unshaped debugging run.
func TestJudgeRefusesWhatIsNotEvidence(t *testing.T) {
	t.Parallel()

	profile := profileAt(100*mbit, true)

	for _, tc := range []struct {
		name   string
		change func(*Run)
		want   string
		says   string
	}{
		{"egress", func(r *Run) { r.Egress["dns"] = 2 }, StatusFailed, "netguard"},
		{"no counters", func(r *Run) { r.Egress = nil }, StatusFailed, "netguard"},
		{"no counter at all", func(r *Run) { r.Egress = map[string]uint64{} }, StatusFailed, "netguard"},
		{"a counter missing", func(r *Run) { delete(r.Egress, "loopback") }, StatusFailed, "netguard"},
		{"a failed run", func(r *Run) { r.Status = StatusFailed }, StatusFailed, "not judged"},
		{"no reference after", func(r *Run) { r.ReferenceAfter = nil }, StatusFailed, "iperf3 reference"},
		{"no result", func(r *Run) { r.Result = nil }, StatusFailed, "result"},
		{"a partial result", func(r *Run) { r.Result.Status = "partial" }, StatusFail, "partial, not complete"},
		{"no upload headline", func(r *Run) { r.Result.Upload = &Direction{Status: "insufficient-data"} }, StatusFail, "upload: no headline (insufficient-data)"},
		{"no download", func(r *Run) { r.Result.Download = nil }, StatusFail, "download: no headline (absent)"},
		{"an unshaped debugging run", func(r *Run) { r.Shaped = false }, StatusRecorded, "debugging run"},
	} {
		run := stableRun(100*mbit, 1, 1)
		tc.change(&run)
		run.Judge(profile)

		if run.Status != tc.want || !strings.Contains(run.Verdict, tc.says) {
			t.Errorf("%s: %s %q", tc.name, run.Status, run.Verdict)
		}
	}

	pass := stableRun(100*mbit, 1.02, 0.97)
	pass.Judge(profile)

	if pass.Status != StatusPass ||
		!strings.Contains(
			pass.Verdict,
			"download loaded +20.0 ms (websocket) vs ping +20.0 ms (±5.0 ms)",
		) ||
		!strings.Contains(pass.Verdict, "grade A (download+upload) vs ping +20.0 ms (A)") ||
		len(pass.Findings) != 0 {
		t.Errorf("a run inside its tolerances: %s", pass.Verdict)
	}
}

// TestLossyReference holds a lossy profile's reference to the goodput its loss leaves: at 1 %
// loss, 300 kbit/s carries 284.0 kbit/s of payload sent once, so the 272.3 kbit/s the floor
// profile's iperf3 read is 4.1 % off it, and 269.6 kbit/s, 5.1 % off, is not.
func TestLossyReference(t *testing.T) {
	t.Parallel()

	profile := &Profile{
		Name:              "lossy",
		RateBitsPerSecond: 300 * kbit,
		LossPercent:       1,
		Shaped:            true,
		Preset:            PresetStandard,
	}
	if got := ConfiguredGoodput(profile); math.Abs(got-284052.8) > 0.1 {
		t.Fatalf("ConfiguredGoodput = %.1f, want 284052.8", got)
	}

	for _, tc := range []struct {
		reference float64
		want      string
	}{
		{272_300, StatusPass},
		{269_600, StatusInconclusive},
	} {
		run := stableRun(300*kbit, 1, 1)
		run.ReferenceBefore.UploadBitsPerSecond = tc.reference
		run.ReferenceAfter.UploadBitsPerSecond = tc.reference
		run.Result.Upload.BitsPerSecond = tc.reference

		run.Judge(profile)

		if run.Status != tc.want {
			t.Errorf("reference %.0f bit/s: %s", tc.reference, run.Verdict)
		}
	}
}

// TestPathBRule is the path B rule of testing.md section 5: on the Caddy profile each measured
// direction must run path B over h2 with an RPM, measured or uncertain alike; on the Traefik
// profile it must read unavailable_h1; a missing responsiveness fails both; elsewhere any state
// passes.
func TestPathBRule(t *testing.T) {
	t.Parallel()

	measured := &Responsiveness{
		State:    ResponsivenessMeasured,
		Protocol: "h2",
		Samples:  30,
		RPM:      900,
	}
	uncertain := &Responsiveness{
		State:    ResponsivenessUncertain,
		Protocol: "h2",
		Samples:  8,
		RPM:      180,
	}
	h3 := &Responsiveness{State: ResponsivenessMeasured, Protocol: "h3", Samples: 30, RPM: 900}
	insufficient := &Responsiveness{State: "unavailable_insufficient", Protocol: "h2", Samples: 3}
	h1 := &Responsiveness{State: ResponsivenessH1, Protocol: "http/1.1"}

	for _, tc := range []struct {
		name             string
		rule             PathBRule
		download, upload *Responsiveness
		pass             bool
		finding          string
	}{
		{"h2 measured", PathBOverH2, measured, measured, true, "download path B measured"},
		{"h2 uncertain", PathBOverH2, uncertain, measured, true, "download path B uncertain"},
		{"h2 upload on h1", PathBOverH2, measured, h1, false, `upload: path B unavailable_h1 (protocol "http/1.1", 0 samples), want measured or uncertain over h2 with an RPM`},
		{"h2 upload over h3", PathBOverH2, measured, h3, false, `upload: path B measured (protocol "h3", 30 samples)`},
		{"h2 no number", PathBOverH2, insufficient, measured, false, "download: path B unavailable_insufficient"},
		{"h2 download missing", PathBOverH2, nil, measured, false, "download: no path B responsiveness, want measured or uncertain"},
		{"h1 unavailable", PathBUnavailableH1, h1, h1, true, ""},
		{"h1 measured", PathBUnavailableH1, measured, h1, false, "download: path B measured"},
		{"h1 missing", PathBUnavailableH1, h1, nil, false, "upload: no path B responsiveness, want unavailable_h1"},
		{"not judged", PathBRecorded, h1, nil, true, ""},
	} {
		run := stableRun(100*mbit, 1, 1)
		run.Result.Download.Responsiveness = tc.download
		run.Result.Upload.Responsiveness = tc.upload
		profile := profileAt(100*mbit, true)
		profile.PathB = tc.rule

		run.Judge(profile)

		if (run.Status == StatusPass) != tc.pass || !strings.Contains(run.Verdict, tc.finding) {
			t.Errorf("%s: %s", tc.name, run.Verdict)
		}
	}

	// A direction that was not measured is not held to the rule.
	run := stableRun(100*mbit, 1, 1)
	run.Result.Download.Responsiveness = measured
	run.Result.Upload = &Direction{Status: "skipped"}
	profile := profileAt(100*mbit, true)
	profile.PathB = PathBOverH2

	run.Judge(profile)

	if strings.Contains(run.Verdict, "upload: no path B") ||
		!strings.Contains(run.Verdict, "download path B measured") {
		t.Errorf("a skipped upload: %s", run.Verdict)
	}
}

// TestCompatProfileNeedsItsStep fails a Compat profile's run that carries no compatibility results.
func TestCompatProfileNeedsItsStep(t *testing.T) {
	t.Parallel()

	profile := profileAt(100*mbit, true)
	profile.Compat = true

	run := stableRun(100*mbit, 1, 1)
	run.Judge(profile)

	if run.Status != StatusFailed ||
		!strings.Contains(run.Verdict, "compatibility step recorded nothing") {
		t.Errorf("a Compat run without its step: %s", run.Verdict)
	}

	run = stableRun(100*mbit, 1, 1)
	run.Compat = &Compat{
		LibreSpeed: &CompatClient{DownloadBitsPerSecond: 1, UploadBitsPerSecond: 1},
	}
	run.Judge(profile)

	if run.Status != StatusPass {
		t.Errorf("a Compat run with its step: %s", run.Verdict)
	}
}
