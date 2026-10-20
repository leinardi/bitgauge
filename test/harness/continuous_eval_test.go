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
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const (
	evalMinutes  = 6
	baselineUsed = 1_000_000
)

// samplesFile is a driver's sample file of minutes 0 to count-1, every one at baselineUsed but
// those the overrides set.
func samplesFile(t *testing.T, count int, overrides map[int]int64) []byte {
	t.Helper()

	samples := make([]HeapSample, count)
	for minute := range samples {
		used := int64(baselineUsed)
		if value, ok := overrides[minute]; ok {
			used = value
		}

		samples[minute] = HeapSample{
			Minute:     minute,
			AtMs:       int64(minute) * 60_000,
			UsedBytes:  used,
			TotalBytes: 2 * baselineUsed,
		}
	}

	data, err := json.Marshal(
		heapFile{WorkerURL: "http://bitgauge:8080/assets/worker-x.js", Samples: samples},
	)
	if err != nil {
		t.Fatal(err)
	}

	return data
}

func TestJudgeHeap(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		data     func(t *testing.T) []byte
		status   string
		finding  string
		maxDrift int64
	}{
		{
			name: "every sample from minute 5 within 2 MiB, the bound itself included, passes",
			data: func(t *testing.T) []byte {
				t.Helper()
				// Minute 4 is before the baseline, so its growth is not judged.
				return samplesFile(t, evalMinutes+1, map[int]int64{
					4: baselineUsed + 10*ContinuousBoundBytes,
					6: baselineUsed + ContinuousBoundBytes,
				})
			},
			status:   StatusPass,
			maxDrift: ContinuousBoundBytes,
		},
		{
			name: "a sample 2 MiB + 1 B from the minute-5 one fails",
			data: func(t *testing.T) []byte {
				t.Helper()

				return samplesFile(
					t,
					evalMinutes+1,
					map[int]int64{6: baselineUsed + ContinuousBoundBytes + 1},
				)
			},
			status:  StatusFail,
			finding: "minute 6: 3097153 bytes used, +2097153 from the minute-5 sample, past 2 MiB",
		},
		{
			name: "a shrink past 2 MiB fails too",
			data: func(t *testing.T) []byte {
				t.Helper()

				return samplesFile(
					t,
					evalMinutes+1,
					map[int]int64{5: baselineUsed + ContinuousBoundBytes + 1},
				)
			},
			status:  StatusFail,
			finding: "minute 6: 1000000 bytes used, -2097153 from the minute-5 sample, past 2 MiB",
		},
		{
			name: "a short file fails",
			data: func(t *testing.T) []byte {
				t.Helper()

				return samplesFile(t, evalMinutes, nil)
			},
			status:  StatusFail,
			finding: "short: 6 samples, where minutes 0 to 6 need 7",
		},
		{
			name:    "an empty file fails",
			data:    func(*testing.T) []byte { return nil },
			status:  StatusFail,
			finding: "the sample file is empty",
		},
		{
			name:    "a file that does not parse fails",
			data:    func(*testing.T) []byte { return []byte("{") },
			status:  StatusFail,
			finding: "the sample file does not parse",
		},
		{
			name: "a sample out of order or without a heap size fails",
			data: func(t *testing.T) []byte {
				t.Helper()

				return samplesFile(t, evalMinutes+1, map[int]int64{3: 0})
			},
			status:  StatusFail,
			finding: "sample 3 reads minute 3 with 0 bytes used",
		},
	}

	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			verdict := JudgeHeap(test.data(t), evalMinutes)
			if verdict.Status != test.status {
				t.Fatalf(
					"status = %s, want %s (findings %v)",
					verdict.Status,
					test.status,
					verdict.Findings,
				)
			}

			if test.finding != "" &&
				!strings.Contains(strings.Join(verdict.Findings, "\n"), test.finding) {
				t.Errorf("findings %v hold no %q", verdict.Findings, test.finding)
			}

			if test.status == StatusPass &&
				(verdict.MaxDriftBytes == nil || *verdict.MaxDriftBytes != test.maxDrift) {
				t.Errorf("max drift = %v, want %d", verdict.MaxDriftBytes, test.maxDrift)
			}
		})
	}
}

func TestContinuousMinutes(t *testing.T) {
	t.Parallel()

	for value, want := range map[string]int{"": ContinuousMinutesDefault, "6": 6, "90": 90} {
		got, err := ContinuousMinutes(value)
		if err != nil || got != want {
			t.Errorf("ContinuousMinutes(%q) = %d, %v; want %d", value, got, err, want)
		}
	}

	for _, value := range []string{"5", "0", "-6", "6.5", "an hour"} {
		_, err := ContinuousMinutes(value)
		if err == nil {
			t.Errorf("ContinuousMinutes(%q) took a value it should refuse", value)
		}
	}
}

func TestContinuousReport(t *testing.T) {
	t.Parallel()

	write := func(t *testing.T, data []byte) string {
		t.Helper()

		dir := t.TempDir()
		if data != nil {
			path := filepath.Join(dir, ContinuousExport())

			err := os.MkdirAll(filepath.Dir(path), dirMode)
			if err != nil {
				t.Fatal(err)
			}

			err = os.WriteFile(path, data, fileMode)
			if err != nil {
				t.Fatal(err)
			}
		}

		return dir
	}

	t.Run("a clean run within the bound passes, and its report says so", func(t *testing.T) {
		t.Parallel()

		dir := write(t, samplesFile(t, evalMinutes+1, nil))
		report := NewContinuousReport(evalMinutes, "env", time.Unix(0, 0))
		report.Egress = zero()
		report.Judge(os.ReadFile(filepath.Join(dir, ContinuousExport())))

		if report.Status != StatusPass {
			t.Fatalf("status = %s: %s", report.Status, report.Verdict)
		}

		err := report.Write(dir)
		if err != nil {
			t.Fatal(err)
		}

		markdown, err := os.ReadFile(filepath.Join(dir, "report.md"))
		if err != nil {
			t.Fatal(err)
		}

		for _, want := range []string{"**pass: minutes 5 to 6 within 2097152 bytes", "| 6 | 1000000 | 2000000 | +0 |", CannotProve} {
			if !strings.Contains(string(markdown), want) {
				t.Errorf("report.md holds no %q", want)
			}
		}
	})

	t.Run("a missing sample file fails, never skips", func(t *testing.T) {
		t.Parallel()

		report := NewContinuousReport(evalMinutes, "env", time.Unix(0, 0))
		report.Egress = zero()
		report.Judge(os.ReadFile(filepath.Join(write(t, nil), ContinuousExport())))

		if report.Status != StatusFail ||
			!strings.Contains(report.Verdict, "the sample file is missing") {
			t.Errorf("status %s, verdict %q", report.Status, report.Verdict)
		}
	})

	t.Run("egress or a missing counter fails a run within the bound", func(t *testing.T) {
		t.Parallel()

		for _, counters := range []map[string]uint64{nil, {"egress": 1, "dns": 0, "loopback": 0}} {
			report := NewContinuousReport(evalMinutes, "env", time.Unix(0, 0))
			report.Egress = counters
			report.Judge(
				os.ReadFile(
					filepath.Join(write(t, samplesFile(t, evalMinutes+1, nil)), ContinuousExport()),
				),
			)

			if report.Status != StatusFail {
				t.Errorf("counters %v: status %s", counters, report.Status)
			}
		}
	})

	t.Run("a run that could not complete stays failed", func(t *testing.T) {
		t.Parallel()

		report := NewContinuousReport(evalMinutes, "env", time.Unix(0, 0))
		report.Egress = zero()
		report.Error = "shaper self-test failed"
		report.Judge(
			os.ReadFile(
				filepath.Join(write(t, samplesFile(t, evalMinutes+1, nil)), ContinuousExport()),
			),
		)

		if report.Status != StatusFailed || report.Verdict != "failed: shaper self-test failed" {
			t.Errorf("status %s, verdict %q", report.Status, report.Verdict)
		}
	})
}
