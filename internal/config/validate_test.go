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

package config

import (
	"bytes"
	"encoding/json"
	"net/netip"
	"slices"
	"strings"
	"testing"
	"time"
)

// problemsFor loads a YAML file and an environment and returns every problem Check reports.
func problemsFor(t *testing.T, file string, environ ...string) []Problem {
	t.Helper()

	loaded, err := LoadFrom(writeFile(t, file), true, environ)
	if err != nil {
		t.Fatalf("LoadFrom error = %v", err)
	}

	return Check(&loaded)
}

func problemKeys(problems []Problem) []string {
	keys := make([]string, 0, len(problems))
	for _, problem := range problems {
		keys = append(keys, problem.Key)
	}

	return keys
}

// TestRulesOfSection4 has one row per rule of configuration.md section 4, using the table's own
// rejected examples, and rows for every range of section 2.
func TestRulesOfSection4(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		file     string
		environ  []string
		wantKeys []string
	}{
		// Unknown keys.
		{
			name:     "unknown key in the file",
			file:     "server:\n  lisen: \":8080\"\n",
			wantKeys: []string{"server.lisen"},
		},
		{
			name:     "unknown key in the environment",
			environ:  []string{"BITGAUGE_SERVER__LISTN=:8080"},
			wantKeys: []string{"server.listn"},
		},
		// Values must parse as their type.
		{
			name:     "size in words",
			file:     "limits:\n  max_upload_bytes: 256 megs\n",
			wantKeys: []string{"limits.max_upload_bytes"},
		},
		{
			name:     "enum outside its values",
			file:     "test_defaults:\n  units: nibbles\n",
			wantKeys: []string{"test_defaults.units"},
		},
		// Invalid CIDR.
		{
			name:     "CIDR beyond /32",
			file:     "server:\n  trusted_proxies: [10.0.0.0/33]\n",
			wantKeys: []string{"server.trusted_proxies[0]"},
		},
		{
			name:     "host name as a CIDR",
			file:     "server:\n  trusted_proxies: [proxy.lan]\n",
			wantKeys: []string{"server.trusted_proxies[0]"},
		},
		// Port range.
		{name: "port 0", file: "server:\n  listen: \":0\"\n", wantKeys: []string{"server.listen"}},
		{
			name:     "port 70000",
			file:     "server:\n  listen: \":70000\"\n",
			wantKeys: []string{"server.listen"},
		},
		// Base path shape.
		{
			name:     "relative base path",
			file:     "server:\n  base_path: speed\n",
			wantKeys: []string{"server.base_path"},
		},
		{
			name:     "trailing slash",
			file:     "server:\n  base_path: /speed/\n",
			wantKeys: []string{"server.base_path"},
		},
		{
			name:     "dot-dot segment",
			file:     "server:\n  base_path: /a/../b\n",
			wantKeys: []string{"server.base_path"},
		},
		{
			name:     "dot segment",
			file:     "server:\n  base_path: /a/./b\n",
			wantKeys: []string{"server.base_path"},
		},
		{
			name:     "query in the base path",
			file:     "server:\n  base_path: /speed?x=1\n",
			wantKeys: []string{"server.base_path"},
		},
		{
			name:     "fragment in the base path",
			file:     "server:\n  base_path: \"/speed#top\"\n",
			wantKeys: []string{"server.base_path"},
		},
		{
			name:     "space in the base path",
			file:     "server:\n  base_path: /my speed\n",
			wantKeys: []string{"server.base_path"},
		},
		{
			name:     "empty base path",
			file:     "server:\n  base_path: \"\"\n",
			wantKeys: []string{"server.base_path"},
		},
		// public_url.
		{
			name:     "public url without a scheme",
			file:     "server:\n  public_url: speed.example.lan\n",
			wantKeys: []string{"server.public_url"},
		},
		{
			name:     "public url with a path",
			file:     "server:\n  public_url: https://x/speed\n",
			wantKeys: []string{"server.public_url"},
		},
		{
			name:     "public url with a trailing slash",
			file:     "server:\n  public_url: https://x/\n",
			wantKeys: []string{"server.public_url"},
		},
		{
			name:     "public url with a query",
			file:     "server:\n  public_url: https://x?a=1\n",
			wantKeys: []string{"server.public_url"},
		},
		{
			name:     "public url with a fragment",
			file:     "server:\n  public_url: \"https://x#a\"\n",
			wantKeys: []string{"server.public_url"},
		},
		{
			name:     "public url with a user",
			file:     "server:\n  public_url: https://user@x\n",
			wantKeys: []string{"server.public_url"},
		},
		{
			name:     "public url over ftp",
			file:     "server:\n  public_url: ftp://x\n",
			wantKeys: []string{"server.public_url"},
		},
		// CORS origins.
		{
			name:     "CORS star",
			file:     "server:\n  cors:\n    allowed_origins: [\"*\"]\n",
			wantKeys: []string{"server.cors.allowed_origins[0]"},
		},
		{
			name:     "CORS origin with a path",
			file:     "server:\n  cors:\n    allowed_origins: [https://ok.lan, https://x/path]\n",
			wantKeys: []string{"server.cors.allowed_origins[1]"},
		},
		{
			name:     "empty CORS origin",
			environ:  []string{"BITGAUGE_SERVER__CORS__ALLOWED_ORIGINS=https://a.lan,"},
			wantKeys: []string{"server.cors.allowed_origins[1]"},
		},
		// Caps below the engine minimum.
		{
			name:     "download cap below 64 KiB",
			file:     "limits:\n  max_download_bytes: 32KiB\n",
			wantKeys: []string{"limits.max_download_bytes"},
		},
		{
			name:     "upload cap below 64 KiB",
			file:     "limits:\n  max_upload_bytes: 32KiB\n",
			wantKeys: []string{"limits.max_upload_bytes"},
		},
		// Ranges of section 2.
		{
			name:     "download cap above 4 GiB",
			file:     "limits:\n  max_download_bytes: 5GiB\n",
			wantKeys: []string{"limits.max_download_bytes"},
		},
		{
			name:     "streams per client 0",
			file:     "limits:\n  max_streams_per_client: 0\n",
			wantKeys: []string{"limits.max_streams_per_client", "test_defaults.streams.max"},
		},
		{
			name:     "streams per client 65",
			file:     "limits:\n  max_streams_per_client: 65\n",
			wantKeys: []string{"limits.max_streams_per_client"},
		},
		{
			name:     "requests per minute 59",
			file:     "limits:\n  requests_per_minute: 59\n",
			wantKeys: []string{"limits.requests_per_minute"},
		},
		{
			name:     "requests per minute 100001",
			file:     "limits:\n  requests_per_minute: 100001\n",
			wantKeys: []string{"limits.requests_per_minute"},
		},
		{
			name:     "tracked clients 15",
			file:     "limits:\n  tracked_clients: 15\n",
			wantKeys: []string{"limits.tracked_clients"},
		},
		{
			name:     "tracked clients 1000001",
			file:     "limits:\n  tracked_clients: 1000001\n",
			wantKeys: []string{"limits.tracked_clients"},
		},
		{
			name:     "networkQuality drain below 1 MiB",
			file:     "compat:\n  networkquality:\n    max_upload_bytes: 512KiB\n",
			wantKeys: []string{"compat.networkquality.max_upload_bytes"},
		},
		{
			name:     "networkQuality drain above 64 GiB",
			file:     "compat:\n  networkquality:\n    max_upload_bytes: 65GiB\n",
			wantKeys: []string{"compat.networkquality.max_upload_bytes"},
		},
		{
			name:     "networkQuality flows 0",
			file:     "compat:\n  networkquality:\n    max_flows_per_client: 0\n",
			wantKeys: []string{"compat.networkquality.max_flows_per_client"},
		},
		{
			name:     "networkQuality flows 257",
			file:     "compat:\n  networkquality:\n    max_flows_per_client: 257\n",
			wantKeys: []string{"compat.networkquality.max_flows_per_client"},
		},
		{
			name:     "empty display name",
			file:     "server:\n  display_name: \"\"\n",
			wantKeys: []string{"server.display_name"},
		},
		{
			name:     "display name of 65 characters",
			file:     "server:\n  display_name: " + strings.Repeat("x", 65) + "\n",
			wantKeys: []string{"server.display_name"},
		},
		{
			name:     "display name with a control character",
			file:     "server:\n  display_name: \"a\\tb\"\n",
			wantKeys: []string{"server.display_name"},
		},
		{
			name:     "unknown preset",
			file:     "test_defaults:\n  preset: turbo\n",
			wantKeys: []string{"test_defaults.preset"},
		},
		{
			name:     "unknown streams mode",
			file:     "test_defaults:\n  streams:\n    mode: many\n",
			wantKeys: []string{"test_defaults.streams.mode"},
		},
		{
			name:     "streams max 7",
			file:     "test_defaults:\n  streams:\n    max: 7\n",
			wantKeys: []string{"test_defaults.streams.max"},
		},
		{
			name:     "streams max 0",
			file:     "test_defaults:\n  streams:\n    max: 0\n",
			wantKeys: []string{"test_defaults.streams.max", "test_defaults.streams.fixed"},
		},
		{
			name:     "streams max above the per-client limit",
			file:     "limits:\n  max_streams_per_client: 4\ntest_defaults:\n  streams:\n    max: 6\n    fixed: 3\n",
			wantKeys: []string{"test_defaults.streams.max"},
		},
		{
			name:     "streams.max 8 with max_streams_per_client 4",
			file:     "limits:\n  max_streams_per_client: 4\ntest_defaults:\n  streams:\n    max: 8\n",
			wantKeys: []string{"test_defaults.streams.max", "test_defaults.streams.max"},
		},
		{
			name:     "fixed streams above max",
			file:     "test_defaults:\n  streams:\n    fixed: 7\n",
			wantKeys: []string{"test_defaults.streams.fixed"},
		},
		{
			name:     "fixed streams 0",
			file:     "test_defaults:\n  streams:\n    fixed: 0\n",
			wantKeys: []string{"test_defaults.streams.fixed"},
		},
		{
			name:     "download min below 5 s",
			file:     "test_defaults:\n  download:\n    min_duration: 4s\n",
			wantKeys: []string{"test_defaults.download.min_duration"},
		},
		{
			name: "upload min above 10 m",
			file: "test_defaults:\n  upload:\n    min_duration: 11m\n    max_duration: 10m\n",
			wantKeys: []string{
				"test_defaults.upload.min_duration",
				"test_defaults.upload.max_duration",
			},
		},
		{
			name:     "download max above 10 m",
			file:     "test_defaults:\n  download:\n    max_duration: 11m\n",
			wantKeys: []string{"test_defaults.download.max_duration"},
		},
		{
			name:     "data cap below 1 MiB",
			file:     "test_defaults:\n  data_cap: 512KiB\n",
			wantKeys: []string{"test_defaults.data_cap"},
		},
		{
			name:     "unknown units",
			file:     "test_defaults:\n  units: nibbles\n",
			wantKeys: []string{"test_defaults.units"},
		},
		{
			name:     "fixed warm-up below 1 s",
			file:     "test_defaults:\n  warmup: 500ms\n",
			wantKeys: []string{"test_defaults.warmup"},
		},
		{
			name:     "fixed warm-up above 60 s",
			file:     "test_defaults:\n  warmup: 61s\n",
			wantKeys: []string{"test_defaults.warmup"},
		},
		{
			name:     "ping count 5",
			file:     "test_defaults:\n  ping_count: 5\n",
			wantKeys: []string{"test_defaults.ping_count"},
		},
		{
			name:     "ping count 201",
			file:     "test_defaults:\n  ping_count: 201\n",
			wantKeys: []string{"test_defaults.ping_count"},
		},
		{
			name:     "negative overhead",
			file:     "test_defaults:\n  overhead_compensation_percent: -1\n",
			wantKeys: []string{"test_defaults.overhead_compensation_percent"},
		},
		{
			name:     "overhead above 20",
			file:     "test_defaults:\n  overhead_compensation_percent: 20.5\n",
			wantKeys: []string{"test_defaults.overhead_compensation_percent"},
		},
		{
			name:     "unknown log format",
			file:     "log:\n  format: logfmt\n",
			wantKeys: []string{"log.format"},
		},
		{
			name:     "unknown log level",
			file:     "log:\n  level: verbose\n",
			wantKeys: []string{"log.level"},
		},
		// server.labels entries.
		{
			name:     "label CIDR with host bits",
			file:     "server:\n  labels:\n    - {cidr: 10.0.0.1/8, label: LAN}\n",
			wantKeys: []string{"server.labels[0].cidr"},
		},
		{
			name:     "IPv4-mapped label CIDR",
			file:     "server:\n  labels:\n    - {cidr: \"::ffff:10.8.0.0/120\", label: VPN}\n",
			wantKeys: []string{"server.labels[0].cidr"},
		},
		{
			name: "duplicate label CIDR",
			file: "server:\n  labels:\n    - {cidr: 10.8.0.0/24, label: VPN}\n" +
				"    - {cidr: 10.8.0.0/24, label: WireGuard}\n",
			wantKeys: []string{"server.labels[1].cidr"},
		},
		{
			name: "label of 65 characters",
			file: "server:\n  labels:\n    - {cidr: 10.8.0.0/24, label: " + strings.Repeat(
				"v",
				65,
			) + "}\n",
			wantKeys: []string{"server.labels[0].label"},
		},
		{
			name:     "empty label",
			file:     "server:\n  labels:\n    - {cidr: 10.8.0.0/24, label: \"\"}\n",
			wantKeys: []string{"server.labels[0].label"},
		},
		{
			name:     "label entry without its CIDR",
			file:     "server:\n  labels:\n    - {label: VPN}\n",
			wantKeys: []string{"server.labels[0].cidr"},
		},
		{
			name:     "label CIDR that does not parse",
			file:     "server:\n  labels:\n    - {cidr: 10.8.0.0, label: VPN}\n",
			wantKeys: []string{"server.labels[0].cidr"},
		},
		{
			name:     "label entry with an unknown key",
			file:     "server:\n  labels:\n    - {cidr: 10.8.0.0/24, lable: VPN}\n",
			wantKeys: []string{"server.labels[0].lable", "server.labels[0].label"},
		},
		{
			name:     "label entry written as text in the file",
			file:     "server:\n  labels: [\"10.8.0.0/24=VPN\"]\n",
			wantKeys: []string{"server.labels[0]"},
		},
		{
			name:     "environment label item without =",
			environ:  []string{"BITGAUGE_SERVER__LABELS=10.8.0.0/24=VPN,10.9.0.0/24"},
			wantKeys: []string{"server.labels[1]"},
		},
		{
			name:     "environment label item with host bits",
			environ:  []string{"BITGAUGE_SERVER__LABELS=10.8.0.1/24=VPN"},
			wantKeys: []string{"server.labels[0].cidr"},
		},
		{
			name:     "relative metrics path",
			file:     "metrics:\n  path: metrics\n",
			wantKeys: []string{"metrics.path"},
		},
		{
			name:     "metrics path with a trailing slash",
			file:     "metrics:\n  path: /metrics/\n",
			wantKeys: []string{"metrics.path"},
		},
		// Phases rules.
		{
			name:     "idle after download",
			file:     "test_defaults:\n  phases: [download, idle]\n",
			wantKeys: []string{"test_defaults.phases"},
		},
		{
			name:     "no phase",
			file:     "test_defaults:\n  phases: []\n",
			wantKeys: []string{"test_defaults.phases"},
		},
		{
			name:     "duplicate phase",
			file:     "test_defaults:\n  phases: [download, download]\n",
			wantKeys: []string{"test_defaults.phases"},
		},
		{
			name:     "unknown phase",
			file:     "test_defaults:\n  phases: [info, download]\n",
			wantKeys: []string{"test_defaults.phases"},
		},
		// Duration pairs.
		{
			name:     "min 30s max 20s",
			file:     "test_defaults:\n  download:\n    min_duration: 30s\n    max_duration: 20s\n",
			wantKeys: []string{"test_defaults.download.max_duration"},
		},
		{
			name:     "min above the preset's max",
			file:     "test_defaults:\n  upload:\n    min_duration: 30s\n",
			wantKeys: []string{"test_defaults.upload.min_duration"},
		},
		{
			name:     "max below the preset's min",
			file:     "test_defaults:\n  preset: extended\n  download:\n    max_duration: 15s\n",
			wantKeys: []string{"test_defaults.download.max_duration"},
		},
		// Conflicting toggles.
		{
			name:     "OpenSpeedTest with a download cap under 30 MiB",
			file:     "compat:\n  openspeedtest:\n    enabled: true\nlimits:\n  max_download_bytes: 16MiB\n",
			wantKeys: []string{"limits.max_download_bytes"},
		},
		{
			name: "OpenSpeedTest with an upload cap under 35 MiB",
			environ: []string{
				"BITGAUGE_COMPAT__OPENSPEEDTEST__ENABLED=true",
				"BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=36700159",
			},
			wantKeys: []string{"limits.max_upload_bytes"},
		},
		{
			name: "LibreSpeed with a download cap under one chunk",
			environ: []string{
				"BITGAUGE_COMPAT__LIBRESPEED__ENABLED=true",
				"BITGAUGE_LIMITS__MAX_DOWNLOAD_BYTES=1048575",
			},
			wantKeys: []string{"limits.max_download_bytes"},
		},
		{
			name:     "networkQuality without public_url or a trusted proxy",
			file:     "compat:\n  networkquality:\n    enabled: true\n",
			wantKeys: []string{"compat.networkquality.enabled"},
		},
		{
			name: "networkQuality with an http public_url",
			file: "server:\n  public_url: http://speed.lan\n  trusted_proxies: [172.20.0.2/32]\n" +
				"compat:\n  networkquality:\n    enabled: true\n",
			wantKeys: []string{"compat.networkquality.enabled"},
		},
		// Continuous compares only a pair with both bounds set: an empty one is no bound.
		{
			name:     "Continuous with min 30s max 20s",
			file:     "test_defaults:\n  preset: continuous\n  download:\n    min_duration: 30s\n    max_duration: 20s\n",
			wantKeys: []string{"test_defaults.download.max_duration"},
		},
		{
			name:     "Continuous with a duration out of range",
			file:     "test_defaults:\n  preset: continuous\n  upload:\n    max_duration: 11m\n",
			wantKeys: []string{"test_defaults.upload.max_duration"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			file := tc.file
			if file == "" {
				file = "{}\n"
			}

			problems := problemsFor(t, file, tc.environ...)
			got := problemKeys(problems)

			if !slices.Equal(got, tc.wantKeys) {
				t.Fatalf("problem keys = %v, want %v; problems %+v", got, tc.wantKeys, problems)
			}

			for _, problem := range problems {
				if problem.Rule == "" ||
					problem.Value == "" && problem.Key != "server.base_path" && problem.Key != "server.display_name" &&
						!strings.HasPrefix(problem.Key, "server.cors") &&
						!strings.HasPrefix(problem.Key, "server.labels") {
					t.Fatalf("problem without a value or a rule: %+v", problem)
				}
			}
		})
	}
}

func TestBoundariesAreAccepted(t *testing.T) {
	t.Parallel()

	files := map[string]string{
		"lowest values": `
server:
  listen: ":1"
  display_name: x
limits:
  max_download_bytes: 64KiB
  max_upload_bytes: 65536
  max_streams_per_client: 1
  requests_per_minute: 60
  tracked_clients: 16
test_defaults:
  preset: quick
  phases: [upload]
  streams: {mode: single, fixed: 1, max: 1}
  download: {min_duration: 5s, max_duration: 5s}
  upload: {min_duration: 5s, max_duration: 5s}
  data_cap: 1MiB
  units: bytes
  warmup: 1s
  ping_count: 6
  overhead_compensation_percent: 0
compat:
  networkquality: {max_upload_bytes: 1MiB, max_flows_per_client: 1}
`,
		"highest values": `
server:
  listen: "[::1]:65535"
  base_path: /a-b.c_d~e/f
  display_name: ` + strings.Repeat("é", 64) + `
  public_url: http://speed.example.lan:8443
  trusted_proxies: [172.20.0.2/32, "fd00::2/128"]
  labels:
    - {cidr: 10.0.0.0/8, label: LAN}
    - {cidr: 10.8.0.0/24, label: ` + strings.Repeat("é", 64) + `}
    - {cidr: "fd7a:115c:a1e0::/48", label: Tailscale}
  cors: {allowed_origins: ["https://a.lan", "http://[::1]:5173"]}
limits:
  max_download_bytes: 4GiB
  max_upload_bytes: 4GiB
  max_streams_per_client: 64
  requests_per_minute: 100000
  tracked_clients: 1000000
test_defaults:
  preset: extended
  phases: [idle, upload, download]
  streams: {mode: fixed, fixed: 6, max: 6}
  download: {min_duration: 10m, max_duration: 10m}
  upload: {max_duration: 10m}
  data_cap: 64GiB
  warmup: 60s
  ping_count: 200
  overhead_compensation_percent: 20
compat:
  openspeedtest: {enabled: true}
  networkquality: {max_upload_bytes: 64GiB, max_flows_per_client: 256}
log: {format: json, level: debug}
metrics: {enabled: true, path: /internal/metrics}
`,
	}

	// The OpenSpeedTest and LibreSpeed layers at the lowest limits they accept.
	files["OpenSpeedTest at its minimums"] = `
compat:
  openspeedtest: {enabled: true}
limits: {max_download_bytes: 30MiB, max_upload_bytes: 36700160}
`
	files["LibreSpeed at its minimum"] = `
compat:
  librespeed: {enabled: true}
limits: {max_download_bytes: 1MiB}
`
	// networkQuality with either way to its https URLs.
	files["networkQuality with an https public_url"] = `
server: {public_url: "HTTPS://speed.example.lan"}
compat:
  networkquality: {enabled: true}
`
	// Continuous, with a lone bound that has no preset value to be compared with.
	files["Continuous with a lone minimum"] = `
test_defaults:
  preset: continuous
  download: {min_duration: 30s}
`
	files["networkQuality behind a trusted proxy"] = `
server: {trusted_proxies: [172.20.0.2/32]}
compat:
  networkquality: {enabled: true}
`

	for name, file := range files {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			problems := problemsFor(t, file)
			if len(problems) != 0 {
				t.Fatalf("problems = %+v, want none", problems)
			}
		})
	}
}

func TestDefaultsAreValid(t *testing.T) {
	t.Parallel()

	defaults := Defaults()

	problems := Validate(&defaults)
	if len(problems) != 0 {
		t.Fatalf("the defaults break rules: %+v", problems)
	}

	if warnings := Warnings(&defaults); len(warnings) != 0 {
		t.Fatalf("the defaults raise warnings: %+v", warnings)
	}
}

func TestProblemsAreCollected(t *testing.T) {
	t.Parallel()

	problems := problemsFor(t, `
server:
  listen: ":0"
  lisen: ":8080"
  base_path: speed
limits:
  max_upload_bytes: 256 megs
  max_download_bytes: 32KiB
test_defaults:
  phases: [download, idle]
metrics:
  enabled: true
  path: metrics
`, "BITGAUGE_LOG__LEVEL=loud")

	want := []string{
		"limits.max_upload_bytes",
		"server.lisen",
		"server.listen",
		"server.base_path",
		"limits.max_download_bytes",
		"test_defaults.phases",
		"log.level",
		"metrics.path",
	}

	if got := problemKeys(problems); !slices.Equal(got, want) {
		t.Fatalf("problem keys = %v, want %v", got, want)
	}
}

func TestDecodeFailureIsNotReportedTwice(t *testing.T) {
	t.Parallel()

	// The listen value does not decode, so it keeps its valid default and validation does not
	// add a port-range problem for the same key.
	problems := problemsFor(t, "server:\n  listen: \"8080\"\n  display_name:\n")
	if got := problemKeys(
		problems,
	); !slices.Equal(
		got,
		[]string{"server.display_name", "server.listen"},
	) {
		t.Fatalf("problem keys = %v", got)
	}
}

func TestWarnings(t *testing.T) {
	t.Parallel()

	metricsOn := Defaults()
	metricsOn.Metrics.Enabled = true

	metricsBehindProxy := metricsOn
	metricsBehindProxy.Server.TrustedProxies = []netip.Prefix{
		netip.MustParsePrefix("172.20.0.2/32"),
	}

	continuousPlain := Defaults()
	continuousPlain.TestDefaults.Preset = "continuous"

	continuous := continuousPlain
	continuous.TestDefaults.Download.MinDuration = OptionalDuration{
		Duration: 30 * time.Second,
		Set:      true,
	}
	continuous.TestDefaults.Upload = DurationRange{
		MinDuration: OptionalDuration{Duration: 20 * time.Second, Set: true},
		MaxDuration: OptionalDuration{Duration: 40 * time.Second, Set: true},
	}

	bounded := continuous
	bounded.TestDefaults.Preset = "extended"

	everyone := Defaults()
	everyone.Server.TrustedProxies = []netip.Prefix{
		netip.MustParsePrefix("10.0.0.0/8"),
		netip.MustParsePrefix("0.0.0.0/0"),
		netip.MustParsePrefix("::/0"),
	}

	tests := []struct {
		name     string
		cfg      Config
		wantKeys []string
	}{
		{
			name:     "metrics without trusted proxies",
			cfg:      metricsOn,
			wantKeys: []string{"metrics.enabled"},
		},
		{name: "metrics behind a trusted proxy", cfg: metricsBehindProxy, wantKeys: []string{}},
		{
			name:     "trusting every address",
			cfg:      everyone,
			wantKeys: []string{"server.trusted_proxies[1]", "server.trusted_proxies[2]"},
		},
		{
			name: "duration keys with Continuous, which ignores them",
			cfg:  continuous,
			wantKeys: []string{
				"test_defaults.download.min_duration",
				"test_defaults.upload.min_duration",
				"test_defaults.upload.max_duration",
			},
		},
		{name: "Continuous without duration keys", cfg: continuousPlain, wantKeys: []string{}},
		{name: "duration keys with a bounded preset", cfg: bounded, wantKeys: []string{}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := problemKeys(Warnings(&tc.cfg)); !slices.Equal(got, tc.wantKeys) {
				t.Fatalf("warning keys = %v, want %v", got, tc.wantKeys)
			}
		})
	}
}

func TestReportProblems(t *testing.T) {
	t.Parallel()

	problems := []Problem{
		{Key: "server.listen", Value: ":0", Rule: "port"},
		{Key: "test_defaults.units", Value: "nibbles", Rule: "units"},
	}

	t.Run("valid log settings log on stdout", func(t *testing.T) {
		t.Parallel()

		var stdout, stderr bytes.Buffer

		ReportProblems(problems, Log{Format: "json", Level: "error"}, &stdout, &stderr)

		if stderr.Len() != 0 {
			t.Fatalf("stderr = %q, want nothing", stderr.String())
		}

		lines := slices.Collect(strings.Lines(stdout.String()))
		if len(lines) != len(problems) {
			t.Fatalf("stdout has %d lines, want %d: %q", len(lines), len(problems), stdout.String())
		}

		for index, line := range lines {
			var record map[string]any

			err := json.Unmarshal([]byte(line), &record)
			if err != nil {
				t.Fatal(err)
			}

			want := problems[index]
			if record["level"] != "ERROR" || record["key"] != want.Key ||
				record["value"] != want.Value ||
				record["rule"] != want.Rule {
				t.Fatalf("line %d = %v, want %+v at error", index, record, want)
			}
		}
	})

	t.Run("invalid log settings fall back to text on stderr", func(t *testing.T) {
		t.Parallel()

		var stdout, stderr bytes.Buffer

		ReportProblems(problems, Log{Format: "xml", Level: "info"}, &stdout, &stderr)

		if stdout.Len() != 0 {
			t.Fatalf("stdout = %q, want nothing", stdout.String())
		}

		text := stderr.String()
		if !strings.Contains(text, "level=ERROR") || !strings.Contains(text, "key=server.listen") ||
			!strings.Contains(text, "value=nibbles") || strings.Count(text, "\n") != len(problems) {
			t.Fatalf("stderr = %q, want one text line per problem", text)
		}
	})
}

// TestInvalidLogKeysReportOnStderr covers log settings that never decoded: the configuration
// then still holds the default text and info, but the problems must go to stderr anyway.
func TestInvalidLogKeysReportOnStderr(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		file    string
		environ []string
	}{
		{name: "null level", file: "log:\n  level:\n"},
		{name: "number as the level", file: "log: {level: 1}\n"},
		{name: "scalar log section", file: "log: text\n"},
		{
			name:    "a level below the level",
			file:    "{}\n",
			environ: []string{"BITGAUGE_LOG__LEVEL__X=debug"},
		},
		{name: "unknown format", file: "log:\n  format: logfmt\n"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			loaded, err := LoadFrom(writeFile(t, tc.file), true, tc.environ)
			if err != nil {
				t.Fatal(err)
			}

			problems := Check(&loaded)

			var stdout, stderr bytes.Buffer

			ReportProblems(problems, loaded.Config.Log, &stdout, &stderr)

			if stdout.Len() != 0 || !strings.Contains(stderr.String(), "key=log") {
				t.Fatalf(
					"stdout %q, stderr %q; want the log problem as text on stderr only",
					stdout.String(),
					stderr.String(),
				)
			}
		})
	}
}

func TestEveryDurationProblemInOneRun(t *testing.T) {
	t.Parallel()

	problems := problemsFor(
		t,
		"test_defaults:\n  preset: turbo\n  download:\n    min_duration: 1s\n  upload:\n    max_duration: 11m\n",
	)

	want := []string{
		"test_defaults.preset",
		"test_defaults.download.min_duration",
		"test_defaults.upload.max_duration",
	}
	if got := problemKeys(problems); !slices.Equal(got, want) {
		t.Fatalf("problem keys = %v, want %v", got, want)
	}
}

func TestListElementReportedOnce(t *testing.T) {
	t.Parallel()

	tests := map[string]string{
		"malformed origin": "server:\n  cors:\n    allowed_origins: [https://ok.lan, \"https://x/%zz\"]\n",
		"null origin":      "server:\n  cors:\n    allowed_origins: [https://ok.lan, ~]\n",
		"null phase":       "test_defaults:\n  phases: [idle, ~, ~]\n",
	}

	for name, file := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			problems := problemsFor(t, file)
			for _, problem := range problems {
				if !strings.Contains(problem.Key, "[") {
					t.Fatalf("problems = %+v, want only the failed elements", problems)
				}
			}

			if len(problems) == 0 {
				t.Fatal("no problem reported")
			}
		})
	}
}

func TestExitStatus(t *testing.T) {
	t.Parallel()

	if ExitStatusInvalidConfig != 2 {
		t.Fatalf(
			"ExitStatusInvalidConfig = %d, want 2 (configuration.md section 4)",
			ExitStatusInvalidConfig,
		)
	}
}
