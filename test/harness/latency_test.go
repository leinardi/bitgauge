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
	"slices"
	"strings"
	"testing"
)

func TestGradeFor(t *testing.T) {
	t.Parallel()

	// measurement.md section 11.3: below each threshold its letter, F from 400 ms.
	for increase, want := range map[float64]string{
		-1: "A+", 0: "A+", 4.9: "A+", 5: "A", 29.9: "A", 30: "B", 59.9: "B", 60: "C",
		199.9: "C", 200: "D", 399.9: "D", 400: "F", 2000: "F",
	} {
		if got := gradeFor(increase); got != want {
			t.Errorf("gradeFor(%v) = %s, want %s", increase, got, want)
		}
	}
}

// TestAllowedGrades is the adjacency rule: the letter across a threshold is allowed only while the
// ping increase lies within its tolerance, ±20 % or 5 ms, of that threshold.
func TestAllowedGrades(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		increase float64
		want     []string
	}{
		{0, []string{"A+", "A"}},    // 5 ms from the 5 ms threshold
		{10, []string{"A", "A+"}},   // the 5 ms floor reaches it exactly
		{10.1, []string{"A"}},       // and no further
		{25, []string{"A", "B"}},    // 5 ms below 30
		{24.9, []string{"A"}},       // just past it
		{50, []string{"B", "C"}},    // 10 ms below 60
		{49.9, []string{"B"}},       // its 20 % is 9.98 ms
		{75, []string{"C", "B"}},    // 15 ms above 60
		{75.1, []string{"C"}},       // its 20 % is 15.02 ms, 15.1 ms past it
		{166.7, []string{"C", "D"}}, // 20 % of 166.7 is 33.3 ms
		{166, []string{"C"}},        // 34 ms below, 33.2 allowed
		{250, []string{"D", "C"}},   // 50 ms above 200
		{333.4, []string{"D", "F"}}, // 66.7 ms below 400
		{500, []string{"F", "D"}},   // 100 ms above 400
		{500.1, []string{"F"}},      // its 20 % is 100.02, 100.1 past it
	} {
		got := allowedGrades(tc.increase)
		if !slices.Equal(got, tc.want) {
			t.Errorf("allowedGrades(%v) = %v, want %v", tc.increase, got, tc.want)
		}
	}
}

// TestLoadedRuleBoundaries walks the increase rule at and just past ±20 % and the 5 ms floor.
func TestLoadedRuleBoundaries(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		ping, engine float64
		pass         bool
	}{
		{100, 120, true},
		{100, 80, true},
		{100, 120.1, false},
		{100, 79.9, false},
		{10, 15, true}, // 20 % is 2 ms: the 5 ms floor holds
		{10, 5, true},
		{10, 15.1, false},
		{-2, 0, true}, // the engine clamps a negative increase to 0
		{-2, 3.1, false},
	} {
		run := stableRun(100*mbit, 1, 1)
		run.Result.Download.LoadedLatency = loadedAt(tc.engine)
		run.Ping = pingAt(tc.ping, 20)
		// The grade follows the larger ping increase, so only the download rule is under test.
		run.Result.Bufferbloat = &Bufferbloat{
			Grade:      gradeFor(max(tc.engine, 20)),
			Basis:      basisBoth,
			IncreaseMs: max(tc.engine, 20),
		}
		run.Judge(profileAt(100*mbit, true))

		failed := slices.ContainsFunc(run.Findings, func(f string) bool {
			return strings.HasPrefix(f, "download loaded") &&
				strings.HasSuffix(f, "outside the tolerance")
		})
		if failed == tc.pass {
			t.Errorf("ping %+v ms, engine %+v ms: %s", tc.ping, tc.engine, run.Verdict)
		}
	}
}

// TestGradeRule judges the grade against the larger ping increase of its basis.
func TestGradeRule(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name      string
		down, up  float64
		grade     string
		basis     string
		wantPass  bool
		wantWords string
	}{
		{"its letter", 20, 45, "B", basisBoth, true, "grade B (download+upload) vs ping +45.0 ms (B)"},
		{"the larger increase decides", 45, 20, "A", basisBoth, false, "is not the ping's letter"},
		{"one direction's basis", 45, 20, "A", PhaseUpload, true, "vs ping +20.0 ms (A)"},
		{"adjacent within the tolerance", 20, 26, "B", basisBoth, true, "(A or B)"},
		{"two letters away", 20, 26, "C", basisBoth, false, "is not the ping's letter"},
	} {
		run := stableRun(100*mbit, 1, 1)
		run.Result.Download.LoadedLatency = loadedAt(tc.down)
		run.Result.Upload.LoadedLatency = loadedAt(tc.up)
		run.Ping = pingAt(tc.down, tc.up)
		run.Result.Bufferbloat = &Bufferbloat{Grade: tc.grade, Basis: tc.basis, IncreaseMs: tc.up}
		run.Judge(profileAt(100*mbit, true))

		if (run.Status == StatusPass) != tc.wantPass ||
			!strings.Contains(run.Verdict, tc.wantWords) {
			t.Errorf("%s: %s", tc.name, run.Verdict)
		}
	}
}

// TestLoadedRuleRefuses: on a judged direction, an unavailable loaded latency, a missing increase,
// a missing grade or a ping without figures fails the run.
func TestLoadedRuleRefuses(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name   string
		change func(*Run)
		says   string
	}{
		{"no loaded latency", func(r *Run) { r.Result.Upload.LoadedLatency = nil }, "upload: no loaded latency"},
		{
			"unavailable",
			func(r *Run) {
				r.Result.Download.LoadedLatency = &LoadedLatency{Source: SourceWebSocket, Status: "unavailable", Reason: "insufficient-samples", Samples: 4}
			},
			"download: loaded latency unavailable (insufficient-samples)",
		},
		{"no increase", func(r *Run) { r.Result.Upload.LoadedLatency.IncreaseMs = nil }, "upload: loaded latency without an increase over idle"},
		{"no grade", func(r *Run) { r.Result.Bufferbloat = nil }, "no bufferbloat grade"},
		{"no ping in the window", func(r *Run) { r.Ping.Download = nil }, "download: the ping has no samples"},
		{"no ping at all", func(r *Run) { r.Ping = nil }, "upload: the ping has no samples"},
	} {
		run := stableRun(100*mbit, 1, 1)
		tc.change(&run)
		run.Judge(profileAt(100*mbit, true))

		if run.Status != StatusFail || !strings.Contains(run.Verdict, tc.says) {
			t.Errorf("%s: %s", tc.name, run.Verdict)
		}
	}
}

// TestHTTP2Recorded: a direction over the HTTP/2 or HTTP/3 probe is recorded with the ping figures,
// never judged, and so is a grade whose basis includes it.
func TestHTTP2Recorded(t *testing.T) {
	t.Parallel()

	for _, source := range []string{"http-h2", "http-h3"} {
		run := stableRun(100*mbit, 1, 1)
		run.Result.Download.LoadedLatency = &LoadedLatency{
			Source:     source,
			Samples:    30,
			MedianMs:   400,
			IncreaseMs: new(float64(350)),
		}
		run.Result.Bufferbloat = &Bufferbloat{Grade: "D", Basis: basisBoth, IncreaseMs: 350}
		run.Judge(profileAt(100*mbit, true))

		if run.Status != StatusPass ||
			!strings.Contains(
				run.Verdict,
				"download loaded latency over "+source+" recorded, not judged (ping +20.0 ms)",
			) ||
			!strings.Contains(run.Verdict, "grade D recorded, not judged") {
			t.Errorf("%s: %s", source, run.Verdict)
		}

		// An unavailable one over that source is recorded too.
		run = stableRun(100*mbit, 1, 1)
		run.Result.Download.LoadedLatency = &LoadedLatency{
			Source: source,
			Status: "unavailable",
			Reason: "insufficient-samples",
		}
		run.Result.Bufferbloat = &Bufferbloat{Grade: "A", Basis: PhaseUpload, IncreaseMs: 20}
		run.Judge(profileAt(100*mbit, true))

		if run.Status != StatusPass ||
			!strings.Contains(run.Verdict, "grade A (upload) vs ping +20.0 ms (A)") {
			t.Errorf("%s unavailable: %s", source, run.Verdict)
		}
	}
}

// TestExpectedFallback holds the ws-blocked profile to the reserved HTTP/1.1 probe: its source, at
// least 10 samples, at most 5 streams and the probe-reservation notice.
func TestExpectedFallback(t *testing.T) {
	t.Parallel()

	profile := profileAt(100*mbit, true)
	profile.ExpectFallback = SourceReserved

	reserved := func() Run {
		run := stableRun(100*mbit, 1, 1)
		for _, dir := range []*Direction{run.Result.Download, run.Result.Upload} {
			dir.Streams = 5
			dir.LoadedLatency.Source = SourceReserved
			dir.LoadedLatency.Samples = 10
		}

		run.Result.Notices = []json.RawMessage{
			json.RawMessage(`{"code":"probe-reservation","streams":5}`),
		}

		return run
	}

	pass := reserved()
	pass.Judge(profile)

	if pass.Status != StatusPass || !strings.Contains(pass.Verdict, "(http-h1-reserved) vs ping") {
		t.Fatalf("the reserved fallback at its bounds: %s", pass.Verdict)
	}

	for _, tc := range []struct {
		name   string
		change func(*Run)
		says   string
	}{
		{"over the WebSocket", func(r *Run) { r.Result.Upload.LoadedLatency.Source = SourceWebSocket }, `upload: loaded latency from "websocket", want http-h1-reserved`},
		{"9 samples", func(r *Run) { r.Result.Download.LoadedLatency.Samples = 9 }, "download: 9 http-h1-reserved samples, want at least 10"},
		{"6 streams", func(r *Run) { r.Result.Upload.Streams = 6 }, "upload: 6 streams beside the reserved probe, want at most 5"},
		{"no notice", func(r *Run) { r.Result.Notices = nil }, "no probe-reservation notice"},
	} {
		run := reserved()
		tc.change(&run)
		run.Judge(profile)

		if run.Status != StatusFail || !strings.Contains(run.Verdict, tc.says) {
			t.Errorf("%s: %s", tc.name, run.Verdict)
		}
	}
}
