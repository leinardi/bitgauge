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
	"os"
	"path/filepath"
	"testing"
	"time"
)

// pingOutput is iputils ping -D as the shaper runs it: the header, replies, a timeout and the
// summary.
const pingOutput = `PING bitgauge-test-abcd-guard (172.18.0.2) 56(84) bytes of data.
[1760000000.250000] 64 bytes from 172.18.0.2: icmp_seq=1 ttl=64 time=50.0 ms
[1760000000.45] 64 bytes from 172.18.0.2: icmp_seq=2 ttl=64 time=50.4 ms
no answer yet for icmp_seq=3
[1760000001.123456789] 64 bytes from 172.18.0.2: icmp_seq=4 ttl=64 time=123 ms

--- bitgauge-test-abcd-guard ping statistics ---
4 packets transmitted, 3 received, 25% packet loss, time 1000ms
rtt min/avg/max/mdev = 50.000/74.466/123.000/34.300 ms`

func TestParsePing(t *testing.T) {
	t.Parallel()

	samples := ParsePing(pingOutput)
	if len(samples) != 3 {
		t.Fatalf("%d samples: %+v", len(samples), samples)
	}

	// The send time is the arrival less the round trip.
	for index, want := range []struct {
		sent time.Time
		rtt  float64
	}{
		{time.Unix(1760000000, 200_000_000), 50},
		{time.Unix(1760000000, 399_600_000), 50.4},
		{time.Unix(1760000001, 456_789), 123},
	} {
		got := samples[index]
		if got.RTTMs != want.rtt || got.SentAt.Sub(want.sent).Abs() > time.Microsecond {
			t.Errorf(
				"sample %d = %v %.1f ms, want %v %.1f ms",
				index,
				got.SentAt,
				got.RTTMs,
				want.sent,
				want.rtt,
			)
		}
	}
}

func TestPhaseWindows(t *testing.T) {
	t.Parallel()

	transitions, err := ParsePhases([]byte(`[
		{"phase":"idle","state":"pending","atMs":1000},
		{"phase":"idle","state":"active","atMs":2000},
		{"phase":"idle","state":"done","atMs":7000},
		{"phase":"download","state":"active","atMs":7000},
		{"phase":"download","state":"done","atMs":19000},
		{"phase":"download","state":"active","atMs":40000},
		{"phase":"upload","state":"active","atMs":19000}
	]`))
	if err != nil {
		t.Fatal(err)
	}

	windows := PhaseWindows(transitions)

	// The first run of the active state counts; a phase still active has no window.
	for phase, want := range map[string]PhaseWindow{
		PhaseIdle:     {From: time.UnixMilli(2000), To: time.UnixMilli(7000)},
		PhaseDownload: {From: time.UnixMilli(7000), To: time.UnixMilli(19000)},
	} {
		if got := windows[phase]; !got.From.Equal(want.From) || !got.To.Equal(want.To) {
			t.Errorf("%s window %v, want %v", phase, got, want)
		}
	}

	if _, ok := windows[PhaseUpload]; ok || len(windows) != 2 {
		t.Errorf("windows %v", windows)
	}

	_, err = ParsePhases([]byte(`{`))
	if err == nil {
		t.Error("a broken phases file was read")
	}
}

// pingEvery is a ping every 200 ms from start for count samples, each with its round trip.
func pingEvery(start time.Time, count int, rtt func(int) float64) []PingSample {
	samples := make([]PingSample, count)
	for index := range samples {
		samples[index] = PingSample{
			SentAt: start.Add(time.Duration(index) * 200 * time.Millisecond),
			RTTMs:  rtt(index),
		}
	}

	return samples
}

// TestSummarizePing places the samples by their send time, and starts each direction after its
// I_s: max(1 s, 4 × the idle median).
func TestSummarizePing(t *testing.T) {
	t.Parallel()

	start := time.UnixMilli(1_000_000)
	at := func(seconds float64) time.Time { return start.Add(time.Duration(seconds * float64(time.Second))) }

	// Idle 0–5 s at 300 ms, so I_s is 1.2 s; download 5–15 s, its first 1.2 s at 900 ms and the
	// rest at 400 ms; upload 15–25 s at 500 ms throughout, its ramp at 1.0 s past I_s.
	samples := pingEvery(start, 125, func(index int) float64 {
		sent := float64(index) * 0.2

		switch {
		case sent < 5:
			return 300
		case sent < 6.2:
			return 900
		case sent < 15:
			return 400
		default:
			return 500
		}
	})
	windows := map[string]PhaseWindow{
		PhaseIdle:     {From: at(0), To: at(5)},
		PhaseDownload: {From: at(5), To: at(15)},
		PhaseUpload:   {From: at(15), To: at(25)},
	}

	ping := SummarizePing(samples, windows)

	if ping.Idle == nil || ping.Idle.Samples != 25 || ping.Idle.MedianMs != 300 {
		t.Fatalf("idle %+v", ping.Idle)
	}

	if ping.Download == nil || ping.Download.Samples != 44 || ping.Download.MedianMs != 400 ||
		ping.Download.IncreaseMs == nil || *ping.Download.IncreaseMs != 100 {
		t.Errorf("download %+v", ping.Download)
	}

	if ping.Upload == nil || ping.Upload.Samples != 44 || *ping.Upload.IncreaseMs != 200 {
		t.Errorf("upload %+v", ping.Upload)
	}

	// I_s never falls below 1 s; without idle latency there is no increase.
	short := SummarizePing(
		pingEvery(start, 50, func(int) float64 { return 10 }),
		map[string]PhaseWindow{
			PhaseDownload: {From: at(0), To: at(10)},
		},
	)
	if short.Idle != nil || short.Download == nil || short.Download.Samples != 45 ||
		short.Download.IncreaseMs != nil {
		t.Errorf("without idle latency %+v %+v", short.Idle, short.Download)
	}

	// A window without samples has no figures.
	empty := SummarizePing(nil, windows)
	if empty.Idle != nil || empty.Download != nil || empty.Upload != nil {
		t.Errorf("no samples %+v", empty)
	}

	if got := median([]float64{4, 1, 3, 2}); got != 2.5 {
		t.Errorf("median of an even count %v", got)
	}
}

// TestRecordPing keeps the full output beside the export and summarizes it over the recorded
// phases; without a phases file the summary is ping's own.
func TestRecordPing(t *testing.T) {
	t.Parallel()

	out := t.TempDir()
	artifacts := ArtifactsFor("ci-10m", "firefox")

	ping, err := RecordPing(out, artifacts, pingOutput)
	if err != nil {
		t.Fatal(err)
	}

	logged, err := os.ReadFile(filepath.Join(out, artifacts.PingLog))
	if err != nil || string(logged) != pingOutput {
		t.Fatalf("the ping output was not kept: %v", err)
	}

	if ping.Log != "exports/ci-10m/firefox.ping.txt" || ping.Idle != nil ||
		ping.Summary != "4 packets transmitted, 3 received, 25% packet loss, time 1000ms "+
			"rtt min/avg/max/mdev = 50.000/74.466/123.000/34.300 ms" {
		t.Errorf("without phases %+v", ping)
	}

	err = os.WriteFile(
		filepath.Join(out, artifacts.Phases),
		[]byte(
			`[{"phase":"idle","state":"active","atMs":1760000000000},{"phase":"idle","state":"done","atMs":1760000001000}]`,
		),
		fileMode,
	)
	if err != nil {
		t.Fatal(err)
	}

	ping, err = RecordPing(out, artifacts, pingOutput)
	if err != nil || ping.Idle == nil || ping.Idle.Samples != 2 || ping.Idle.MedianMs != 50.2 ||
		ping.Log == "" {
		t.Errorf("with phases %+v, %v", ping, err)
	}

	err = os.WriteFile(filepath.Join(out, artifacts.Phases), []byte(`not json`), fileMode)
	if err != nil {
		t.Fatal(err)
	}

	_, err = RecordPing(out, artifacts, pingOutput)
	if err == nil {
		t.Error("a broken phases file was summarized")
	}
}
