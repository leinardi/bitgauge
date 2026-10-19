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
		"ci-500k-300ms": {RateBitsPerSecond: 500_000, RTT: 300 * time.Millisecond, Preset: PresetStandard},
		"ci-1g":         {RateBitsPerSecond: 1_000_000_000, Preset: PresetStandard},
		"ci-100m-50ms-caddy-h2": {
			RateBitsPerSecond: 100_000_000, RTT: 50 * time.Millisecond, Proxy: ProxyCaddy,
			PathB: PathBOverH2, Compat: true, Preset: PresetStandard,
		},
		"ci-100m-50ms-traefik-h1": {
			RateBitsPerSecond: 100_000_000, RTT: 50 * time.Millisecond, Proxy: ProxyTraefik,
			PathB: PathBUnavailableH1, Preset: PresetStandard,
		},
		"ci-100m-50ms-traefik-h1-ws-blocked": {
			RateBitsPerSecond: 100_000_000, RTT: 50 * time.Millisecond, Proxy: ProxyTraefik, WebSocketBlocked: true,
			ExpectFallback: SourceReserved, Preset: PresetStandard,
		},
		"floor-300k-300ms-1pct-loss": {RateBitsPerSecond: 300_000, RTT: 300 * time.Millisecond, LossPercent: 1, Preset: PresetStandard},
		"floor-300k-600ms-vpn":       {RateBitsPerSecond: 300_000, RTT: 600 * time.Millisecond, Preset: PresetExtended},
		"ceiling-10g":                {RateBitsPerSecond: 10_000_000_000, Preset: PresetStandard},
	} {
		got := byName[name]
		got.Name, got.DocPhrase, got.Shaped = "", "", false

		if got != want {
			t.Errorf("%s = %+v, want %+v", name, got, want)
		}
	}
}

// TestCompatProfile pins the compatibility step to the one CI profile testing.md section 5 names
// for it: ci-100m-50ms-caddy-h2 is the only profile with Compat.
func TestCompatProfile(t *testing.T) {
	t.Parallel()

	var compat []string

	for _, spec := range Tiers() {
		for _, profile := range spec.Profiles {
			if profile.Compat {
				compat = append(compat, profile.Name)
			}
		}
	}

	if !slices.Equal(compat, []string{"ci-100m-50ms-caddy-h2"}) {
		t.Errorf("the Compat profiles are %v, want only ci-100m-50ms-caddy-h2", compat)
	}
}

// TestCompatNeedsHTTPS pins that a Compat profile runs behind an HTTPS proxy, which networkQuality
// needs, and that only a Compat profile starts BitGauge with an environment: the three toggles and
// the proxy network as trusted proxies.
func TestCompatNeedsHTTPS(t *testing.T) {
	t.Parallel()

	for _, spec := range Tiers() {
		for _, profile := range spec.Profiles {
			env := profile.BitGaugeEnv([]string{"172.30.0.0/16", "fd00:30::/64"})

			if !profile.Compat {
				if env != nil {
					t.Errorf("%s is not Compat but starts BitGauge with %v", profile.Name, env)
				}

				continue
			}

			if !profile.Proxy.HTTPS() {
				t.Errorf(
					"%s is Compat behind %q, which serves no HTTPS",
					profile.Name,
					profile.Proxy,
				)
			}

			want := []string{
				"BITGAUGE_COMPAT__OPENSPEEDTEST__ENABLED=true",
				"BITGAUGE_COMPAT__LIBRESPEED__ENABLED=true",
				"BITGAUGE_COMPAT__NETWORKQUALITY__ENABLED=true",
				"BITGAUGE_SERVER__TRUSTED_PROXIES=172.30.0.0/16,fd00:30::/64",
			}
			if !slices.Equal(env, want) {
				t.Errorf("%s starts BitGauge with %v, want %v", profile.Name, env, want)
			}
		}
	}

	for proxy, https := range map[Proxy]bool{ProxyNone: false, ProxyTraefik: false, ProxyCaddy: true} {
		if proxy.HTTPS() != https {
			t.Errorf("%q.HTTPS() = %v, want %v", proxy, proxy.HTTPS(), https)
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
	shaper := ShaperCommands(&profile)
	commands := strings.Join(shaper, "\n")

	// fq_codel's limit is sized in full frames, so a 64 KiB queue caps offload before anything is
	// shaped.
	if shaper[0] != OffloadCommand || OffloadCommand != "ip link set dev eth0 gso_max_segs 1" {
		t.Errorf("the shaper does not cap segmentation offload first:\n%s", commands)
	}

	for _, want := range []string{
		"tc qdisc add dev eth0 root handle 1: netem delay 300ms\n",
		"tc qdisc add dev eth0 parent 1: handle 2: tbf rate 300000bit burst 3028 limit 65536\n",
		"tc qdisc add dev eth0 parent 2:1 handle 3: fq_codel limit 44 target 1748ms interval 3496ms\n",
		"ip link add ifb0 type ifb",
		"action mirred egress redirect dev ifb0",
		"tc qdisc add dev ifb0 root handle 2: tbf rate 300000bit burst 3028 limit 65536\n",
		"tc qdisc add dev ifb0 parent 2:1 handle 3: fq_codel limit 44 target 1748ms interval 3496ms",
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
	if strings.Contains(shaped, OffloadCommand) {
		t.Errorf("the shaper caps offload on a queue above 64 KiB:\n%s", shaped)
	}
	// 80 ms of data at 1 Gbit: 10 MB, 6606 full frames.
	if !strings.Contains(shaped, "netem delay 0ms\n") ||
		!strings.Contains(shaped, "burst 1250000 limit 10000000\n") ||
		!strings.Contains(shaped, "fq_codel limit 6606 target 80ms interval 160ms\n") {
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

	// A loss recovery holds the third second's bytes back into the fourth; the median reads the
	// link, where the mean of the counted seconds would read 5 % fast. The short last interval
	// and the seconds before the settle do not count.
	intervals := `[{"sum":{"start":0,"seconds":1,"bits_per_second":1}},` +
		`{"sum":{"start":2,"seconds":1,"bits_per_second":4.75e5}},` +
		`{"sum":{"start":3,"seconds":1,"bits_per_second":2.5e5}},` +
		`{"sum":{"start":4,"seconds":1,"bits_per_second":7.5e5}},` +
		`{"sum":{"start":5,"seconds":1,"bits_per_second":4.75e5}},` +
		`{"sum":{"start":6,"seconds":0.2,"bits_per_second":9e9}}]`

	for _, test := range []struct {
		name    string
		out     string
		reverse bool
	}{
		{"download, the client's intervals", `{"intervals":` + intervals + `}`, true},
		{"upload, the server's intervals", `{"intervals":[],"server_output_json":{"intervals":` + intervals + `}}`, false},
	} {
		got, err := receivedBitsPerSecond(test.out, test.reverse, 2*time.Second)
		if err != nil || got != 4.75e5 {
			t.Errorf("%s: got %v, %v", test.name, got, err)
		}
	}

	for _, bad := range []string{"", "not json", `{"intervals":[]}`, `{"error":"unable to connect"}`} {
		_, err := receivedBitsPerSecond(bad, true, 2*time.Second)
		if err == nil {
			t.Errorf("%q was read as a throughput", bad)
		}
	}

	_, err := receivedBitsPerSecond(`{"intervals":`+intervals+`}`, false, 2*time.Second)
	if err == nil {
		t.Error("an upload without the server's intervals was read as a throughput")
	}
}

func TestIperf3Settings(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		rate   int64
		length int64
	}{{500 * kbit, 1448}, {10 * mbit, 12500}, {100 * mbit, 125000}, {gbit, 131072}, {0, 131072}} {
		if got := Iperf3Length(test.rate); got != test.length {
			t.Errorf("Iperf3Length(%d) = %d, want %d", test.rate, got, test.length)
		}
	}

	for _, test := range []struct {
		rtt, settle time.Duration
	}{{0, 2 * time.Second}, {50 * time.Millisecond, 2 * time.Second}, {300 * time.Millisecond, 3 * time.Second}, {600 * time.Millisecond, 6 * time.Second}} {
		if got := Iperf3Settle(test.rtt); got != test.settle {
			t.Errorf("Iperf3Settle(%s) = %s, want %s", test.rtt, got, test.settle)
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
				Status: "complete",
				Preset: PresetExtended,
				Download: &Direction{
					Status:        "measured",
					BitsPerSecond: 281_000,
					WindowMs:      12_400,
					LoadedLatency: &LoadedLatency{
						Source:     SourceWebSocket,
						Samples:    40,
						MedianMs:   760,
						IncreaseMs: new(float64(160)),
					},
					Responsiveness: &Responsiveness{
						State: ResponsivenessMeasured, Protocol: "h2", Samples: 31, RPM: 95,
					},
				},
				Upload: &Direction{
					Status:        "measured",
					BitsPerSecond: 290_000,
					WindowMs:      11_000,
					LoadedLatency: &LoadedLatency{
						Source:     SourceWebSocket,
						Samples:    40,
						MedianMs:   790,
						IncreaseMs: new(float64(190)),
					},
					Responsiveness: &Responsiveness{State: ResponsivenessH1, Protocol: "http/1.1"},
				},
				Bufferbloat: &Bufferbloat{Grade: "C", Basis: basisBoth, IncreaseMs: 190},
			},
			Ping: &Ping{
				Summary:  "120 packets transmitted, 120 received, 0% packet loss",
				Log:      "exports/floor-300k-600ms-vpn/firefox.ping.txt",
				Idle:     &PingPhase{Samples: 30, MedianMs: 600},
				Download: &PingPhase{Samples: 60, MedianMs: 750, IncreaseMs: new(float64(150))},
				Upload:   &PingPhase{Samples: 60, MedianMs: 770, IncreaseMs: new(float64(170))},
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
			Compat: &Compat{
				LibreSpeed: &CompatClient{
					DownloadBitsPerSecond: 280_000,
					UploadBitsPerSecond:   270_000,
				},
				GoResponsiveness: &CompatClient{
					DownloadBitsPerSecond: 250_000,
					UploadBitsPerSecond:   240_000,
					RPM:                   61,
					Estimate:              true,
				},
				OpenSpeedTest: &CompatClient{
					DownloadBitsPerSecond: 275_000,
					UploadBitsPerSecond:   265_000,
				},
			},
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

	if *decoded.Runs[0].Ping.Upload.IncreaseMs != 170 ||
		*decoded.Runs[0].Result.Upload.LoadedLatency.IncreaseMs != 190 ||
		decoded.Runs[0].Result.Bufferbloat.Grade != "C" || decoded.LatencyRule != LatencyRule {
		t.Errorf("the loaded latency did not survive: %+v", decoded.Runs[0])
	}

	if decoded.Runs[0].Result.Download.Responsiveness.RPM != 95 ||
		decoded.Runs[0].Compat.GoResponsiveness.RPM != 61 || decoded.Runs[0].Compat.OpenSpeedTest == nil {
		t.Errorf("path B or the compatibility results did not survive: %+v", decoded.Runs[0])
	}

	if decoded.Tolerances != Tolerances || decoded.Runs[0].Verdict != report.Runs[0].Verdict ||
		decoded.Runs[0].Reference.DownloadBitsPerSecond != 297_000 || !decoded.Runs[2].Rerun {
		t.Errorf("the judgment did not survive: %+v", decoded)
	}

	markdown := readFile(t, filepath.Join(dir, "report.md"))

	for _, want := range append([]string{
		Tolerances, NoEgressLayer, CannotProve, "298.0 kbit/s / 297.0 kbit/s", "296.0 kbit/s / 299.5 kbit/s",
		"| 297.0 kbit/s / 298.2 kbit/s |", "| pass |", report.Runs[0].Verdict, "| 1 (re-run) | inconclusive |",
		"download 281.0 kbit/s vs 297.0 kbit/s (-5.4 %, ±15 %)", "- Loaded latency: " + LatencyRule,
		"download loaded +160.0 ms (websocket) vs ping +150.0 ms (±30.0 ms)",
		"grade C (download+upload) vs ping +170.0 ms (C or D)",
		"| +160.0 ms (websocket, 40 samples) / +190.0 ms (websocket, 40 samples) | 600.0 ms / +150.0 ms / +170.0 ms | C (download+upload, +190.0 ms) |",
		`failed: shaper \| self-test`, "one real iOS Safari run over an actual VPN",
		"40.5 s CPU in 27.0 s (1.50 cores), 812.4 MB peak",
		"| measured, 95 RPM (h2, 31 samples) / unavailable_h1 |",
		"| librespeed-cli 280.0 kbit/s / 270.0 kbit/s; goresponsiveness 250.0 kbit/s / 240.0 kbit/s, " +
			"61 RPM (estimate); OpenSpeedTest UI 275.0 kbit/s / 265.0 kbit/s |",
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

func TestCapsOffloadOnlyOnTheMinimumQueue(t *testing.T) {
	t.Parallel()

	// 64 KiB is 80 ms of data at 6.5536 Mbit/s: below it the queue is the minimum.
	for _, tc := range []struct {
		rate int64
		want bool
	}{
		{300_000, true},
		{500_000, true},
		{6_553_599, true},
		{6_553_600, false},
		{10_000_000, false},
		{1_000_000_000, false},
	} {
		if got := CapsOffload(&Profile{RateBitsPerSecond: tc.rate}); got != tc.want {
			t.Errorf("CapsOffload(%d bit/s) = %v, want %v", tc.rate, got, tc.want)
		}
	}
}

// TestTbfSentBytes reads the self-test's counter from real tc -s output: the tbf's own line, not
// the netem above it or the fq_codel below.
func TestTbfSentBytes(t *testing.T) {
	t.Parallel()

	out := "qdisc netem 1: root refcnt 33 limit 1000 delay 600ms seed 1\n" +
		" Sent 527356 bytes 599 pkt (dropped 22, overlimits 0 requeues 0) \n" +
		" backlog 0b 0p requeues 0\n" +
		"qdisc tbf 2: parent 1: rate 300Kbit burst 3027b lat 1.67s \n" +
		" Sent 527300 bytes 598 pkt (dropped 22, overlimits 1696 requeues 0) \n" +
		" backlog 0b 0p requeues 0\n" +
		"qdisc fq_codel 3: parent 2:1 limit 44p flows 1024 quantum 1514 target 1.75s interval 3.5s\n" +
		" Sent 527356 bytes 599 pkt (dropped 22, overlimits 0 requeues 0) \n"

	got, err := TbfSentBytes(out)
	if err != nil || got != 527300 {
		t.Errorf("TbfSentBytes = %d, %v; want 527300", got, err)
	}

	for _, bad := range []string{
		"qdisc fq_codel 3: parent 2:1\n Sent 1 bytes 1 pkt\n",
		"qdisc tbf 2: root refcnt 2 rate 300Kbit\n backlog 0b 0p\n",
		"qdisc tbf 2: root refcnt 2 rate 300Kbit\n Sent many bytes 1 pkt\n",
		"qdisc tbf 2: root refcnt 2 rate 300Kbit",
	} {
		_, err = TbfSentBytes(bad)
		if !errors.Is(err, errTbfOutput) {
			t.Errorf("TbfSentBytes(%q) = %v, want errTbfOutput", bad, err)
		}
	}
}
