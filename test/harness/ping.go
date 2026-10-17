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
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

// The ICMP ping that runs beside the browser, the reference of the loaded-latency rule (testing.md
// section 5). iputils ping with -D prints each reply with the wall-clock time it arrived; less its
// round trip, that is when its request was sent, which places it in the phase windows the browser
// driver records from the Test screen, on the same host clock.

// The Test screen's measuring phases, as the browser driver names them.
const (
	PhaseIdle     = "idle"
	PhaseDownload = "download"
	PhaseUpload   = "upload"
)

const (
	// stateActive is a phase step's state while its phase runs (ui/screens.md section 1).
	stateActive = "active"
	// slowStartFloor and slowStartRTTs are I_s of measurement.md section 11: max(1 s, 4 × RTT).
	slowStartFloor = time.Second
	slowStartRTTs  = 4
	nanoDigits     = 9
	half           = 2
)

// pingReply is one reply line of ping -D: "[1760000000.123456] 64 bytes from …: icmp_seq=1 ttl=64
// time=50.3 ms".
var pingReply = regexp.MustCompile(`^\[(\d+)\.(\d+)\] .*\btime=([0-9.]+) ms`)

// PingSample is one ping reply: when its request was sent, on the wall clock, and its round trip.
type PingSample struct {
	SentAt time.Time
	RTTMs  float64
}

// ParsePing reads the replies of ping -D output. Every other line, the header, a timeout or the
// summary, carries no round trip and is skipped.
func ParsePing(output string) []PingSample {
	var samples []PingSample

	for line := range strings.SplitSeq(output, "\n") {
		match := pingReply.FindStringSubmatch(strings.TrimSpace(line))
		if match == nil {
			continue
		}

		seconds, secondsErr := strconv.ParseInt(match[1], 10, 64)
		fraction, fractionErr := strconv.ParseInt(
			(match[2] + strings.Repeat("0", nanoDigits))[:nanoDigits],
			10,
			64,
		)
		rtt, rttErr := strconv.ParseFloat(match[3], 64)

		if secondsErr != nil || fractionErr != nil || rttErr != nil {
			continue
		}

		arrived := time.Unix(seconds, fraction)
		samples = append(samples, PingSample{
			SentAt: arrived.Add(-time.Duration(rtt * float64(time.Millisecond))),
			RTTMs:  rtt,
		})
	}

	return samples
}

// PhaseTransition is one change of a Test screen phase step's state, with the wall-clock time the
// page saw it, in Unix milliseconds, as the browser driver records it.
type PhaseTransition struct {
	Phase string `json:"phase"`
	State string `json:"state"`
	AtMs  int64  `json:"atMs"`
}

// ParsePhases reads the browser driver's <browser>.phases.json.
func ParsePhases(data []byte) ([]PhaseTransition, error) {
	var transitions []PhaseTransition

	err := json.Unmarshal(data, &transitions)
	if err != nil {
		return nil, fmt.Errorf("read the phase transitions: %w", err)
	}

	return transitions, nil
}

// PhaseWindow is when a phase ran: from its step turning active to its leaving that state.
type PhaseWindow struct {
	From time.Time
	To   time.Time
}

// PhaseWindows is each phase's first run of the active state; a phase that never left it has no
// window.
func PhaseWindows(transitions []PhaseTransition) map[string]PhaseWindow {
	windows := map[string]PhaseWindow{}
	started := map[string]time.Time{}

	for _, transition := range transitions {
		seen := time.UnixMilli(transition.AtMs)

		_, done := windows[transition.Phase]
		from, running := started[transition.Phase]

		switch {
		case done:
		case transition.State == stateActive && !running:
			started[transition.Phase] = seen
		case transition.State != stateActive && running:
			windows[transition.Phase] = PhaseWindow{From: from, To: seen}
		}
	}

	return windows
}

// PingPhase is the ping over one phase's window: its samples, their median and, for a direction,
// the increase of that median over idle latency's.
type PingPhase struct {
	Samples    int      `json:"samples"`
	MedianMs   float64  `json:"medianMs"`
	IncreaseMs *float64 `json:"increaseMs,omitempty"`
}

// Ping is the ICMP ping that ran alongside the browser: ping's own closing summary, the file its
// full output went to, relative to the report directory, and its figures per phase window.
type Ping struct {
	Summary  string     `json:"summary,omitempty"`
	Log      string     `json:"log,omitempty"`
	Idle     *PingPhase `json:"idle,omitempty"`
	Download *PingPhase `json:"download,omitempty"`
	Upload   *PingPhase `json:"upload,omitempty"`
}

// SummarizePing places the samples by their send time: idle latency's whole window, and each
// direction's window after its first I_s, max(1 s, 4 × the idle median) (testing.md section 5).
// A direction's increase exists only beside an idle median; a window without samples has no
// figures.
func SummarizePing(samples []PingSample, windows map[string]PhaseWindow) Ping {
	var ping Ping

	idleWindow, ok := windows[PhaseIdle]
	if ok {
		ping.Idle = pingPhase(samples, idleWindow.From, idleWindow.To)
	}

	slowStart := slowStartFloor
	if ping.Idle != nil {
		slowStart = max(
			slowStartFloor,
			time.Duration(slowStartRTTs*ping.Idle.MedianMs*float64(time.Millisecond)),
		)
	}

	for _, direction := range []struct {
		phase string
		into  **PingPhase
	}{{PhaseDownload, &ping.Download}, {PhaseUpload, &ping.Upload}} {
		window, found := windows[direction.phase]
		if !found {
			continue
		}

		figures := pingPhase(samples, window.From.Add(slowStart), window.To)
		if figures != nil && ping.Idle != nil {
			increase := figures.MedianMs - ping.Idle.MedianMs
			figures.IncreaseMs = &increase
		}

		*direction.into = figures
	}

	return ping
}

// pingPhase is the samples sent in [from, to), nil when there are none.
func pingPhase(samples []PingSample, from, to time.Time) *PingPhase {
	var rtts []float64

	for _, sample := range samples {
		if !sample.SentAt.Before(from) && sample.SentAt.Before(to) {
			rtts = append(rtts, sample.RTTMs)
		}
	}

	if len(rtts) == 0 {
		return nil
	}

	return &PingPhase{Samples: len(rtts), MedianMs: median(rtts)}
}

// median is the middle value, or the mean of the two middle values of an even count.
func median(values []float64) float64 {
	sorted := slices.Clone(values)
	slices.Sort(sorted)

	middle := len(sorted) / half
	if len(sorted)%half == 1 {
		return sorted[middle]
	}

	return (sorted[middle-1] + sorted[middle]) / half
}

// Artifacts are where one browser run's files go, relative to the report directory: the export,
// the phase transitions the driver recorded beside it, and the ping's full output.
type Artifacts struct {
	Export  string
	Phases  string
	PingLog string
}

// ArtifactsFor is the files of one profile in one browser.
func ArtifactsFor(profile, browser string) Artifacts {
	dir := filepath.Join("exports", profile)

	return Artifacts{
		Export:  filepath.Join(dir, browser+".json"),
		Phases:  filepath.Join(dir, browser+".phases.json"),
		PingLog: filepath.Join(dir, browser+".ping.txt"),
	}
}

// pingSummaryLines are the lines ping prints last: its packet counts and its round-trip summary.
const pingSummaryLines = 2

// RecordPing keeps the ping's full output beside the export and summarizes it over the phase
// windows the driver recorded. A run whose driver wrote no phases, as when the browser failed
// early, keeps the output and ping's own summary without phase figures.
func RecordPing(outDir string, artifacts Artifacts, output string) (*Ping, error) {
	logPath := filepath.Join(outDir, artifacts.PingLog)

	err := os.MkdirAll(filepath.Dir(logPath), dirMode)
	if err != nil {
		return nil, fmt.Errorf("create the export directory: %w", err)
	}

	err = os.WriteFile(logPath, []byte(output), fileMode)
	if err != nil {
		return nil, fmt.Errorf("write the ping output: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(output), "\n")
	summary := strings.Join(lines[max(0, len(lines)-pingSummaryLines):], " ")
	ping := &Ping{Summary: summary, Log: artifacts.PingLog}

	data, err := os.ReadFile(filepath.Join(outDir, artifacts.Phases))
	if errors.Is(err, os.ErrNotExist) {
		return ping, nil
	}

	if err != nil {
		return ping, fmt.Errorf("read the phase transitions: %w", err)
	}

	transitions, err := ParsePhases(data)
	if err != nil {
		return ping, err
	}

	figures := SummarizePing(ParsePing(output), PhaseWindows(transitions))
	figures.Summary, figures.Log = ping.Summary, ping.Log

	return &figures, nil
}
