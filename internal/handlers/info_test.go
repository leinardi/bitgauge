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

package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"reflect"
	"testing"
	"time"

	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/config"
)

// fetchInfo runs the info handler for client and decodes the response generically, so the
// assertions see the JSON keys and null exactly as a client does.
func fetchInfo(
	t *testing.T,
	deps *Deps,
	client string,
) (map[string]any, *httptest.ResponseRecorder) {
	t.Helper()

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/v1/info", nil)
	request = request.WithContext(
		clientip.WithAddr(request.Context(), netip.MustParseAddr(client)))

	recorder := httptest.NewRecorder()
	Info(deps.Config, deps.Build, deps.Epoch, deps.Labeler)(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}

	var decoded map[string]any

	err := json.Unmarshal(recorder.Body.Bytes(), &decoded)
	if err != nil {
		t.Fatalf("body %q: %v", recorder.Body.String(), err)
	}

	return decoded, recorder
}

func decodeJSON(t *testing.T, text string) map[string]any {
	t.Helper()

	var decoded map[string]any

	err := json.Unmarshal([]byte(text), &decoded)
	if err != nil {
		t.Fatal(err)
	}

	return decoded
}

func TestInfoEveryField(t *testing.T) {
	t.Parallel()

	got, recorder := fetchInfo(t, testDeps(), "100.101.4.17")

	// The sample of wire-protocol.md section 5, with the default configuration.
	want := decodeJSON(t, `{
		"server": {
			"name": "BitGauge", "version": "0.1.0", "commit": "a1b2c3d",
			"buildDate": "2026-09-30T12:00:00Z", "epoch": "k3V9qW2rT0aY", "basePath": "/"
		},
		"client": {
			"ip": "100.101.4.17", "ipVersion": 4, "addressClass": "cgnat", "suggestedLabel": "VPN"
		},
		"limits": {
			"maxDownloadBytes": 268435456, "maxUploadBytes": 268435456,
			"maxStreamsPerClient": 8, "uploadLifetimeMs": 120000, "bucketMs": 100
		},
		"defaults": {
			"preset": "standard", "phases": ["idle", "download", "upload"],
			"streams": { "mode": "auto", "fixed": 3, "max": 6 },
			"download": { "minMs": 10000, "maxMs": 20000 },
			"upload": { "minMs": 15000, "maxMs": 25000 },
			"dataCapBytes": null, "units": "bits", "warmup": "auto", "pingCount": 20,
			"overheadCompensationPercent": 0
		},
		"compat": { "openspeedtest": false, "librespeed": false, "networkquality": false }
	}`)

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("info =\n%v\nwant\n%v", got, want)
	}

	for name, value := range map[string]string{
		"Cache-Control": "no-store",
		"Content-Type":  "application/json",
	} {
		if header := recorder.Header().Get(name); header != value {
			t.Fatalf("%s = %q, want %q", name, header, value)
		}
	}
}

func TestInfoAddressClassAndLabel(t *testing.T) {
	t.Parallel()

	deps := testDeps()

	for _, test := range []struct {
		ip, class string
		label     any
		version   float64
	}{
		{"127.0.0.1", "loopback", "LAN", 4},
		{"::1", "loopback", "LAN", 6},
		{"10.1.2.3", "private", "LAN", 4},
		{"172.16.0.9", "private", "LAN", 4},
		{"192.168.1.42", "private", "LAN", 4},
		{"169.254.10.1", "link-local", "LAN", 4},
		{"fe80::1", "link-local", "LAN", 6},
		{"fd00::5", "ula", "LAN", 6},
		{"fd7a:115c:a1e0::17", "ula", "VPN", 6},
		{"100.64.0.1", "cgnat", "VPN", 4},
		{"100.127.255.254", "cgnat", "VPN", 4},
		{"100.128.0.1", "public", nil, 4},
		{"203.0.113.9", "public", nil, 4},
		{"2001:db8::9", "public", nil, 6},
	} {
		got, _ := fetchInfo(t, deps, test.ip)

		want := map[string]any{
			"ip": test.ip, "ipVersion": test.version,
			"addressClass": test.class, "suggestedLabel": test.label,
		}
		if !reflect.DeepEqual(got["client"], want) {
			t.Fatalf("%s: client = %v, want %v", test.ip, got["client"], want)
		}
	}
}

func TestInfoLabelsFromServerLabels(t *testing.T) {
	t.Parallel()

	deps := testDeps()
	deps.Labeler = clientip.NewLabeler([]clientip.Rule{
		{Prefix: netip.MustParsePrefix("10.0.0.0/8"), Label: "LAN"},
		{Prefix: netip.MustParsePrefix("10.8.0.0/24"), Label: "VPN"},
		{Prefix: netip.MustParsePrefix("203.0.113.0/24"), Label: "Branch office"},
	})

	for ip, want := range map[string]any{
		"10.8.0.7":     "VPN",
		"10.9.0.7":     "LAN",
		"203.0.113.9":  "Branch office",
		"198.51.100.1": nil,
		"100.64.0.1":   "VPN",
	} {
		got, _ := fetchInfo(t, deps, ip)

		client, _ := got["client"].(map[string]any)
		if client["suggestedLabel"] != want {
			t.Errorf("%s: suggestedLabel = %v, want %v", ip, client["suggestedLabel"], want)
		}
	}
}

func TestInfoDefaultsPerPreset(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		preset           string
		download, upload []any
		pingCount        float64
	}{
		{"quick", []any{5000.0, 10000.0}, []any{5000.0, 10000.0}, 10},
		{"standard", []any{10000.0, 20000.0}, []any{15000.0, 25000.0}, 20},
		{"extended", []any{20000.0, 40000.0}, []any{20000.0, 40000.0}, 50},
		// No minimum and no maximum, and the preset's 20 pings.
		{"continuous", []any{nil, nil}, []any{nil, nil}, 20},
	} {
		deps := testDeps()
		deps.Config.TestDefaults.Preset = test.preset

		got, _ := fetchInfo(t, deps, "10.0.0.1")
		defaults, _ := got["defaults"].(map[string]any)

		for name, want := range map[string][]any{"download": test.download, "upload": test.upload} {
			bounds := map[string]any{"minMs": want[0], "maxMs": want[1]}
			if !reflect.DeepEqual(defaults[name], bounds) {
				t.Fatalf("%s: %s = %v, want %v", test.preset, name, defaults[name], bounds)
			}
		}

		if defaults["preset"] != test.preset || defaults["pingCount"] != test.pingCount {
			t.Fatalf("%s: preset %v, pingCount %v, want %v", test.preset,
				defaults["preset"], defaults["pingCount"], test.pingCount)
		}
	}
}

func TestInfoContinuousIgnoresTheDurationKeys(t *testing.T) {
	t.Parallel()

	deps := testDeps()
	defaults := &deps.Config.TestDefaults
	defaults.Preset = "continuous"
	defaults.Download.MinDuration = config.OptionalDuration{Duration: 30 * time.Second, Set: true}
	defaults.Upload.MaxDuration = config.OptionalDuration{Duration: 90 * time.Second, Set: true}
	defaults.PingCount = 30

	got, _ := fetchInfo(t, deps, "10.0.0.1")
	resolved, _ := got["defaults"].(map[string]any)
	none := map[string]any{"minMs": nil, "maxMs": nil}

	if !reflect.DeepEqual(resolved["download"], none) ||
		!reflect.DeepEqual(resolved["upload"], none) {
		t.Fatalf("bounds = %v and %v, want null", resolved["download"], resolved["upload"])
	}

	if resolved["pingCount"] != 30.0 {
		t.Fatalf("pingCount = %v, want the configured 30", resolved["pingCount"])
	}
}

func TestInfoDefaultsFromConfiguration(t *testing.T) {
	t.Parallel()

	deps := testDeps()
	defaults := &deps.Config.TestDefaults
	defaults.Preset = "quick"
	defaults.Phases = []string{"upload", "download"}
	defaults.Streams = config.Streams{Mode: "fixed", Fixed: 2, Max: 4}
	// One bound set per range: the other keeps the preset's value.
	defaults.Download.MinDuration = config.OptionalDuration{Duration: 7 * time.Second, Set: true}
	defaults.Upload.MaxDuration = config.OptionalDuration{Duration: 90 * time.Second, Set: true}
	defaults.DataCap = 500 * config.MiB
	defaults.Units = "bytes"
	defaults.Warmup = config.Warmup{Duration: 3 * time.Second}
	defaults.PingCount = 30
	defaults.OverheadCompensationPercent = 5.13

	got, _ := fetchInfo(t, deps, "10.0.0.1")

	want := decodeJSON(t, `{
		"preset": "quick", "phases": ["upload", "download"],
		"streams": { "mode": "fixed", "fixed": 2, "max": 4 },
		"download": { "minMs": 7000, "maxMs": 10000 },
		"upload": { "minMs": 5000, "maxMs": 90000 },
		"dataCapBytes": 524288000, "units": "bytes", "warmup": 3000, "pingCount": 30,
		"overheadCompensationPercent": 5.13
	}`)

	if !reflect.DeepEqual(got["defaults"], want) {
		t.Fatalf("defaults =\n%v\nwant\n%v", got["defaults"], want)
	}
}

func TestInfoStreamsModeFollowsThePreset(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		preset, mode string
		want         map[string]any
	}{
		// An unset mode is the preset's: Quick's fixed 3 streams.
		{"quick", "", map[string]any{"mode": "fixed", "fixed": 3.0, "max": 6.0}},
		// A mode set in the configuration stands, whatever the preset.
		{"quick", "auto", map[string]any{"mode": "auto", "fixed": 3.0, "max": 6.0}},
		{"standard", "", map[string]any{"mode": "auto", "fixed": 3.0, "max": 6.0}},
		{"continuous", "", map[string]any{"mode": "auto", "fixed": 3.0, "max": 6.0}},
	} {
		deps := testDeps()
		deps.Config.TestDefaults.Preset = test.preset
		deps.Config.TestDefaults.Streams.Mode = test.mode

		got, _ := fetchInfo(t, deps, "10.0.0.1")

		defaults, _ := got["defaults"].(map[string]any)

		streams := defaults["streams"]
		if !reflect.DeepEqual(streams, test.want) {
			t.Fatalf("preset %s, mode %q: streams = %v, want %v",
				test.preset, test.mode, streams, test.want)
		}
	}
}

func TestInfoWithoutClientAddressIs500(t *testing.T) {
	t.Parallel()

	deps := testDeps()
	recorder := httptest.NewRecorder()
	Info(deps.Config, deps.Build, deps.Epoch, deps.Labeler)(
		recorder,
		httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/v1/info", nil),
	)

	assertEnvelope(t, recorder, http.StatusInternalServerError, CodeInternal)
}

func TestInfoReportsTheCompatibilityToggles(t *testing.T) {
	t.Parallel()

	deps := testDeps()
	deps.Config.Compat.OpenSpeedTest.Enabled = true
	deps.Config.Compat.LibreSpeed.Enabled = true

	got, _ := fetchInfo(t, deps, "10.0.0.5")

	want := map[string]any{"openspeedtest": true, "librespeed": true, "networkquality": false}
	if !reflect.DeepEqual(got["compat"], want) {
		t.Fatalf("compat = %v, want %v", got["compat"], want)
	}

	deps.Config.Compat.NetworkQuality.Enabled = true
	got, _ = fetchInfo(t, deps, "10.0.0.5")

	want = map[string]any{"openspeedtest": true, "librespeed": true, "networkquality": true}
	if !reflect.DeepEqual(got["compat"], want) {
		t.Fatalf("compat = %v, want %v", got["compat"], want)
	}
}
