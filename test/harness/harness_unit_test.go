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
	"math"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"
)

const testingDoc = "../../docs/features/technical-stack/testing.md"

// TestTiersFollowTestingMD pins the profile table to testing.md section 5, word for word: each
// profile's phrase sits in its tier's row, and each tier has exactly the profiles the row lists.
func TestTiersFollowTestingMD(t *testing.T) {
	t.Parallel()

	doc := readFile(t, testingDoc)

	rows := map[Tier]string{
		TierCI:      tableRow(t, doc, "| CI |"),
		TierFloor:   tableRow(t, doc, "| Manual range floor |"),
		TierCeiling: tableRow(t, doc, "| Manual range ceiling |"),
	}

	counts := map[Tier]int{TierCI: 7, TierFloor: 2, TierCeiling: 2}
	seen := map[string]bool{}

	for _, spec := range Tiers() {
		if len(spec.Profiles) != counts[spec.Tier] {
			t.Errorf(
				"tier %s has %d profiles, testing.md lists %d",
				spec.Tier,
				len(spec.Profiles),
				counts[spec.Tier],
			)
		}

		if !slices.Equal(spec.Browsers, []string{BrowserChromium, BrowserFirefox, BrowserWebKit}) {
			t.Errorf("tier %s runs %v", spec.Tier, spec.Browsers)
		}

		for _, profile := range spec.Profiles {
			if seen[profile.Name] {
				t.Errorf("profile name %s is used twice", profile.Name)
			}

			seen[profile.Name] = true

			if !strings.Contains(rows[spec.Tier], profile.DocPhrase) {
				t.Errorf(
					"%s: %q is not in testing.md's %s row",
					profile.Name,
					profile.DocPhrase,
					spec.Tier,
				)
			}

			if profile.Shaped == (spec.Tier == TierCeiling) {
				t.Errorf(
					"%s: shaped = %v; only the ceiling tier runs unshaped",
					profile.Name,
					profile.Shaped,
				)
			}
		}
	}
}

func TestProfileValues(t *testing.T) {
	t.Parallel()

	byName := map[string]Profile{}

	for _, spec := range Tiers() {
		for _, profile := range spec.Profiles {
			byName[profile.Name] = profile
		}
	}

	for name, want := range map[string]Profile{
		"ci-500k-300ms":                      {RateBitsPerSecond: 500_000, RTT: 300 * time.Millisecond, Preset: PresetStandard},
		"ci-1g":                              {RateBitsPerSecond: 1_000_000_000, Preset: PresetStandard},
		"ci-100m-50ms-caddy-h2":              {RateBitsPerSecond: 100_000_000, RTT: 50 * time.Millisecond, Proxy: ProxyCaddy, Preset: PresetStandard},
		"ci-100m-50ms-traefik-h1-ws-blocked": {RateBitsPerSecond: 100_000_000, RTT: 50 * time.Millisecond, Proxy: ProxyTraefik, WebSocketBlocked: true, Preset: PresetStandard},
		"floor-300k-300ms-1pct-loss":         {RateBitsPerSecond: 300_000, RTT: 300 * time.Millisecond, LossPercent: 1, Preset: PresetStandard},
		"floor-300k-600ms-vpn":               {RateBitsPerSecond: 300_000, RTT: 600 * time.Millisecond, Preset: PresetExtended},
		"ceiling-10g":                        {RateBitsPerSecond: 10_000_000_000, Preset: PresetStandard},
	} {
		got := byName[name]
		got.Name, got.DocPhrase, got.Shaped = "", "", false

		if got != want {
			t.Errorf("%s = %+v, want %+v", name, got, want)
		}
	}
}

func TestSelect(t *testing.T) {
	t.Parallel()

	spec, err := Lookup(TierCI)
	if err != nil {
		t.Fatal(err)
	}

	selected, err := Select(&spec, " ci-10m , ci-1g", "firefox")
	if err != nil {
		t.Fatal(err)
	}

	if len(selected.Profiles) != 2 || selected.Profiles[1].Name != "ci-1g" ||
		!slices.Equal(selected.Browsers, []string{"firefox"}) {
		t.Errorf("selected %+v", selected)
	}

	everything, err := Select(&spec, "", "")
	if err != nil || len(everything.Profiles) != 7 || len(everything.Browsers) != 3 {
		t.Errorf("empty lists narrowed the tier: %+v, %v", everything, err)
	}

	for _, bad := range [][2]string{{"ci-typo", ""}, {"", "safari"}, {"floor-300k-600ms-vpn", ""}} {
		_, err = Select(&spec, bad[0], bad[1])
		if err == nil {
			t.Errorf("Select(%q, %q) accepted a name the tier does not have", bad[0], bad[1])
		}
	}

	_, err = Lookup("nightly")
	if err == nil {
		t.Error("an unknown tier was found")
	}
}

func TestShaperCommands(t *testing.T) {
	t.Parallel()

	profile := Profile{
		RateBitsPerSecond: 300_000,
		RTT:               300 * time.Millisecond,
		LossPercent:       1,
		Shaped:            true,
	}
	commands := strings.Join(ShaperCommands(&profile), "\n")

	for _, want := range []string{
		"tc qdisc add dev eth0 root handle 1: netem delay 300ms\n",
		"tc qdisc add dev eth0 parent 1: handle 2: tbf rate 300000bit burst 3028 latency 400ms",
		"ip link add ifb0 type ifb",
		"action mirred egress redirect dev ifb0",
		"tc qdisc add dev ifb0 root tbf rate 300000bit burst 3028 latency 400ms",
	} {
		if !strings.Contains(commands, want) {
			t.Errorf("the shaper does not run %q:\n%s", want, commands)
		}
	}

	// The self-test runs before the loss: it goes on afterwards, as a change to the same netem.
	if strings.Contains(commands, "loss") {
		t.Errorf("the shaper adds the loss before the self-test:\n%s", commands)
	}

	if got := LossCommand(
		&profile,
	); got != "tc qdisc change dev eth0 root handle 1: netem delay 300ms loss 1%" {
		t.Errorf("LossCommand = %q", got)
	}

	fast := Profile{RateBitsPerSecond: 1_000_000_000}

	shaped := strings.Join(ShaperCommands(&fast), "\n")
	if !strings.Contains(shaped, "netem delay 0ms\n") ||
		!strings.Contains(shaped, "burst 1250000 ") {
		t.Errorf("1 Gbit without delay:\n%s", shaped)
	}

	if got := LossCommand(&fast); got != "" {
		t.Errorf("a profile without loss changes netem: %q", got)
	}
}

// TestExpectedGoodput pins the self-test's target: the payload share of a full frame, about
// 95.6 % of the rate tbf enforces.
func TestExpectedGoodput(t *testing.T) {
	t.Parallel()

	got := ExpectedGoodput(100_000_000)
	if math.Abs(got-95_640_686.9) > 1 {
		t.Errorf("ExpectedGoodput(100 Mbit) = %.1f", got)
	}
}

func TestClientCounters(t *testing.T) {
	t.Parallel()

	usec, err := cpuUsageMicros("usage_usec 24356\nuser_usec 15335\nsystem_usec 9021\n")
	if err != nil || usec != 24356 {
		t.Errorf("cpuUsageMicros = %d, %v", usec, err)
	}

	for _, bad := range []string{"", "user_usec 1\n", "usage_usec many\n"} {
		_, err = cpuUsageMicros(bad)
		if err == nil {
			t.Errorf("%q was read as a CPU time", bad)
		}
	}

	peak, err := memoryPeak("5955584\n")
	if err != nil || peak != 5955584 {
		t.Errorf("memoryPeak = %d, %v", peak, err)
	}

	_, err = memoryPeak("max\n")
	if err == nil {
		t.Error("max was read as a memory peak")
	}
}

func TestReceivedBitsPerSecond(t *testing.T) {
	t.Parallel()

	got, err := receivedBitsPerSecond(
		`{"start":{},"end":{"sum_sent":{"bits_per_second":2},"sum_received":{"bits_per_second":9.5e7}}}`,
	)
	if err != nil || got != 9.5e7 {
		t.Errorf("got %v, %v", got, err)
	}

	for _, bad := range []string{"", "not json", `{"end":{}}`, `{"error":"unable to connect"}`} {
		_, err = receivedBitsPerSecond(bad)
		if err == nil {
			t.Errorf("%q was read as a throughput", bad)
		}
	}
}

// TestImagesArePinned pins the third-party images by digest, and the Playwright image to the
// browsers of the @playwright/test version the workspace installs.
func TestImagesArePinned(t *testing.T) {
	t.Parallel()

	pinned := regexp.MustCompile(`^[a-z0-9.\-/]+:[A-Za-z0-9._\-]+@sha256:[0-9a-f]{64}$`)

	for _, image := range Images() {
		if !pinned.MatchString(image) {
			t.Errorf("%s is not pinned by tag and digest", image)
		}
	}

	var manifest struct {
		DevDependencies map[string]string `json:"devDependencies"`
	}

	err := json.Unmarshal([]byte(readFile(t, "../../web/package.json")), &manifest)
	if err != nil {
		t.Fatal(err)
	}

	version := manifest.DevDependencies["@playwright/test"]
	if !strings.HasPrefix(PlaywrightImage, "mcr.microsoft.com/playwright:v"+version+"-") {
		t.Errorf(
			"the Playwright image %s is not the @playwright/test %s the workspace installs",
			PlaywrightImage,
			version,
		)
	}
}

func TestSummarizeExport(t *testing.T) {
	t.Parallel()

	export := `{"format":"bitgauge.history","formatVersion":1,"exportedAt":"2026-10-09T12:00:00Z","results":[{
		"schema":"bitgauge.result","schemaVersion":1,"status":"complete",
		"client":{"ip":"10.8.0.2","protocol":"h2"},"settings":{"preset":"standard"},
		"download":{"status":"measured","bitsPerSecond":94100000,"windowMs":5600,"bytes":118000000},
		"upload":{"status":"insufficient-data","bitsPerSecond":0,"windowMs":0,"bytes":1000},
		"dataUsedBytes":268000000,"notices":[{"id":"websocket-unavailable"}]}]}`

	summary, err := SummarizeExport([]byte(export))
	if err != nil {
		t.Fatal(err)
	}

	if summary.Status != "complete" || summary.Preset != "standard" || summary.Protocol != "h2" ||
		summary.Download.BitsPerSecond != 94_100_000 || summary.Download.WindowMs != 5600 ||
		summary.Upload.Status != "insufficient-data" || summary.DataUsedBytes != 268_000_000 || len(summary.Notices) != 1 {
		t.Errorf("summary = %+v", summary)
	}

	for _, bad := range []string{
		`{"format":"bitgauge.history","results":[]}`,
		`{"format":"bitgauge.history","results":[{},{}]}`,
		`{"format":"something.else","results":[{}]}`,
		`not json`,
	} {
		_, err = SummarizeExport([]byte(bad))
		if err == nil {
			t.Errorf("%s was summarized", bad)
		}
	}
}

// TestReport pins what every report carries, in both forms, and where it goes.
func TestReport(t *testing.T) {
	t.Parallel()

	spec, err := Lookup(TierFloor)
	if err != nil {
		t.Fatal(err)
	}

	started := time.Date(2026, 10, 9, 12, 30, 0, 0, time.UTC)
	report := NewReport(&spec, "abcd1234", started)
	report.Finished = started.Add(time.Hour)
	report.Runs = []Run{
		{
			Profile: "floor-300k-600ms-vpn",
			Browser: "firefox",
			Status:  StatusRecorded,
			Attempt: 1,
			Shaped:  true,
			Result: &ResultSummary{
				Status:   "complete",
				Preset:   PresetExtended,
				Download: &Direction{Status: "measured", BitsPerSecond: 281_000, WindowMs: 12_400},
				Upload:   &Direction{Status: "measured", BitsPerSecond: 290_000, WindowMs: 11_000},
			},
			SelfTest: &Throughput{
				DownloadBitsPerSecond: 299_000,
				UploadBitsPerSecond:   301_000,
				Seconds:               5,
			},
			ReferenceBefore: &Throughput{
				DownloadBitsPerSecond: 298_000,
				UploadBitsPerSecond:   297_000,
				Seconds:               20,
			},
			ReferenceAfter: &Throughput{
				DownloadBitsPerSecond: 296_000,
				UploadBitsPerSecond:   299_500,
				Seconds:               20,
			},
			ClientUsage: &Usage{CPUSeconds: 40.5, WallSeconds: 27, PeakMemoryBytes: 812_400_000},
			Egress:      map[string]uint64{"egress": 0, "dns": 0, "loopback": 0},
		},
		{
			Profile: "floor-300k-300ms-1pct-loss",
			Browser: "webkit",
			Status:  StatusFailed,
			Attempt: 1,
			Error:   "shaper | self-test",
			Shaped:  true,
		},
		{
			Profile: "floor-300k-300ms-1pct-loss",
			Browser: "chromium",
			Status:  StatusInconclusive,
			Attempt: 1,
			Rerun:   true,
			Shaped:  true,
			Verdict: "inconclusive: unstable reference; upload: iperf3 before (290.0 kbit/s) and after (250.0 kbit/s) differ by 14.8 %",
		},
	}

	report.Runs[0].Judge(&spec.Profiles[1])

	if report.Runs[0].Status != StatusPass {
		t.Fatalf("the floor run inside its tolerance: %s", report.Runs[0].Verdict)
	}

	dir := Dir(t.TempDir(), report.Tier, started, report.EnvID)
	if filepath.Base(dir) != "floor-20261009T123000Z-abcd1234" {
		t.Errorf("report directory %s", filepath.Base(dir))
	}

	err = report.Write(dir)
	if err != nil {
		t.Fatal(err)
	}

	var decoded Report

	err = json.Unmarshal([]byte(readFile(t, filepath.Join(dir, "report.json"))), &decoded)
	if err != nil {
		t.Fatal(err)
	}

	if decoded.Runs[0].ReferenceBefore.DownloadBitsPerSecond != 298_000 ||
		decoded.Runs[0].ReferenceAfter.UploadBitsPerSecond != 299_500 {
		t.Errorf("the raw iperf3 values did not survive: %+v", decoded.Runs[0])
	}

	if decoded.Tolerances != Tolerances || decoded.Runs[0].Verdict != report.Runs[0].Verdict ||
		decoded.Runs[0].Reference.DownloadBitsPerSecond != 297_000 || !decoded.Runs[2].Rerun {
		t.Errorf("the judgement did not survive: %+v", decoded)
	}

	markdown := readFile(t, filepath.Join(dir, "report.md"))

	for _, want := range append([]string{
		Tolerances, NoEgressLayer, CannotProve, "298.0 kbit/s / 297.0 kbit/s", "296.0 kbit/s / 299.5 kbit/s",
		"| 297.0 kbit/s / 298.2 kbit/s |", "| pass |", report.Runs[0].Verdict, "| 1 (re-run) | inconclusive |",
		"download 281.0 kbit/s vs 297.0 kbit/s (-5.4 %, ±15 %)", LatencyRule,
		`failed: shaper \| self-test`, "one real iOS Safari run over an actual VPN",
		"40.5 s CPU in 27.0 s (1.50 cores), 812.4 MB peak",
	}, EnvironmentalLimits...) {
		if !strings.Contains(markdown, want) {
			t.Errorf("report.md lacks %q:\n%s", want, markdown)
		}
	}
}

// TestEnvironmentalLimitsFollowTestingMD pins the limits list to the one testing.md requires.
func TestEnvironmentalLimitsFollowTestingMD(t *testing.T) {
	t.Parallel()

	// Line wrapping and code spans are the doc's formatting, not its words.
	doc := strings.Join(strings.Fields(strings.ReplaceAll(readFile(t, testingDoc), "`", "")), " ")

	for _, limit := range EnvironmentalLimits {
		if !strings.Contains(doc, "- "+limit) {
			t.Errorf("testing.md does not list %q", limit)
		}
	}

	if !strings.Contains(doc, strings.TrimPrefix(CannotProve, "What the harness cannot prove: ")) {
		t.Errorf("testing.md does not say %q", CannotProve)
	}
}

func tableRow(t *testing.T, doc, prefix string) string {
	t.Helper()

	for line := range strings.SplitSeq(doc, "\n") {
		if strings.HasPrefix(line, prefix) {
			return line
		}
	}

	t.Fatalf("testing.md has no row starting %q", prefix)

	return ""
}

func readFile(t *testing.T, path string) string {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	return string(data)
}
