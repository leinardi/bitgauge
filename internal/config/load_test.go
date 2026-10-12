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
	"errors"
	"net/netip"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

const configurationDoc = "../../docs/features/configuration.md"

// writeFile puts a configuration file in a fresh temporary directory.
func writeFile(t *testing.T, content string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "config.yaml")

	err := os.WriteFile(path, []byte(content), 0o600)
	if err != nil {
		t.Fatal(err)
	}

	return path
}

func missingPath(t *testing.T) string {
	t.Helper()

	return filepath.Join(t.TempDir(), "absent.yaml")
}

// exampleYAML returns the annotated example of configuration.md section 1, which shows every key
// at its default.
func exampleYAML(t *testing.T) string {
	t.Helper()

	doc, err := os.ReadFile(configurationDoc)
	if err != nil {
		t.Fatal(err)
	}

	_, afterHeading, found := strings.Cut(string(doc), "## 1. Config File First")
	if !found {
		t.Fatal("configuration.md has no section 1")
	}

	_, afterFence, found := strings.Cut(afterHeading, "```yaml\n")
	if !found {
		t.Fatal("configuration.md section 1 has no YAML example")
	}

	example, _, found := strings.Cut(afterFence, "```")
	if !found {
		t.Fatal("configuration.md section 1's YAML example is not closed")
	}

	return example
}

func TestDefaultsEqualTheDocumentedExample(t *testing.T) {
	t.Parallel()

	loaded, err := LoadFrom(writeFile(t, exampleYAML(t)), true, nil)
	if err != nil {
		t.Fatalf("LoadFrom(the section 1 example) error = %v", err)
	}

	if !reflect.DeepEqual(loaded.Config, Defaults()) {
		t.Fatalf(
			"the section 1 example decodes to\n%+v\nbut Defaults() is\n%+v",
			loaded.Config,
			Defaults(),
		)
	}
}

func TestNoFileNoEnvironmentGivesDefaults(t *testing.T) {
	t.Parallel()

	loaded, err := LoadFrom(missingPath(t), false, nil)
	if err != nil {
		t.Fatalf("LoadFrom(missing default path) error = %v", err)
	}

	if !reflect.DeepEqual(loaded.Config, Defaults()) {
		t.Fatalf("got %+v, want the defaults", loaded.Config)
	}
}

func TestDefaultsAreTheDocumentedValues(t *testing.T) {
	t.Parallel()

	defaults := Defaults()

	checks := []struct {
		key  string
		got  any
		want any
	}{
		{"server.listen", defaults.Server.Listen.String(), ":8080"},
		{"server.base_path", defaults.Server.BasePath, "/"},
		{"server.display_name", defaults.Server.DisplayName, "BitGauge"},
		{"limits.max_download_bytes", defaults.Limits.MaxDownloadBytes, Size(268435456)},
		{"limits.max_upload_bytes", defaults.Limits.MaxUploadBytes, Size(268435456)},
		{"limits.max_streams_per_client", defaults.Limits.MaxStreamsPerClient, 8},
		{"limits.requests_per_minute", defaults.Limits.RequestsPerMinute, 1200},
		{"limits.tracked_clients", defaults.Limits.TrackedClients, 4096},
		{"test_defaults.preset", defaults.TestDefaults.Preset, "standard"},
		{
			"test_defaults.phases",
			defaults.TestDefaults.Phases,
			[]string{"idle", "download", "upload"},
		},
		{
			"test_defaults.streams",
			defaults.TestDefaults.Streams,
			Streams{Mode: "auto", Fixed: 3, Max: 6},
		},
		{"test_defaults.download", defaults.TestDefaults.Download, DurationRange{}},
		{"test_defaults.upload", defaults.TestDefaults.Upload, DurationRange{}},
		{"test_defaults.data_cap", defaults.TestDefaults.DataCap, Size(0)},
		{"test_defaults.units", defaults.TestDefaults.Units, "bits"},
		{"test_defaults.warmup", defaults.TestDefaults.Warmup, Warmup{Auto: true}},
		{"test_defaults.ping_count", defaults.TestDefaults.PingCount, 0},
		{
			"test_defaults.overhead_compensation_percent",
			defaults.TestDefaults.OverheadCompensationPercent,
			0.0,
		},
		{
			"compat.networkquality.max_upload_bytes",
			defaults.Compat.NetworkQuality.MaxUploadBytes,
			Size(1073741824),
		},
		{
			"compat.networkquality.max_flows_per_client",
			defaults.Compat.NetworkQuality.MaxFlowsPerClient,
			32,
		},
		{"log", defaults.Log, Log{Format: "text", Level: "info"}},
		{"metrics", defaults.Metrics, Metrics{Enabled: false, Path: "/metrics"}},
	}

	for _, check := range checks {
		if !reflect.DeepEqual(check.got, check.want) {
			t.Errorf("default %s = %#v, want %#v", check.key, check.got, check.want)
		}
	}

	if defaults.Compat.OpenSpeedTest.Enabled || defaults.Compat.LibreSpeed.Enabled ||
		defaults.Compat.NetworkQuality.Enabled {
		t.Error("a compatibility layer is on by default")
	}
}

// TestEnvironmentMapping follows the table of configuration-security.md section 1.
func TestEnvironmentMapping(t *testing.T) {
	t.Parallel()

	environ := []string{
		"BITGAUGE_SERVER__LISTEN=:9090",
		"BITGAUGE_SERVER__TRUSTED_PROXIES=172.30.0.2/32,fd00::2/128",
		"BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=512MiB",
		"BITGAUGE_TEST_DEFAULTS__STREAMS__MAX=4",
		"BITGAUGE_COMPAT__NETWORKQUALITY__ENABLED=true",
		"BITGAUGE_PORT=tcp://10.43.0.12:8080",
		"BITGAUGE_SERVICE_HOST=10.43.0.12",
		"HOME=/root",
	}

	loaded, err := LoadFrom(missingPath(t), false, environ)
	if err != nil {
		t.Fatalf("LoadFrom error = %v", err)
	}

	want := Defaults()
	want.Server.Listen = Listen{Port: 9090}
	want.Server.TrustedProxies = []netip.Prefix{
		netip.MustParsePrefix("172.30.0.2/32"),
		netip.MustParsePrefix("fd00::2/128"),
	}
	want.Limits.MaxUploadBytes = 536870912
	want.TestDefaults.Streams.Max = 4
	want.Compat.NetworkQuality.Enabled = true

	if !reflect.DeepEqual(loaded.Config, want) {
		t.Fatalf("got\n%+v\nwant\n%+v", loaded.Config, want)
	}

	wantIgnored := []string{"BITGAUGE_PORT", "BITGAUGE_SERVICE_HOST"}
	if !reflect.DeepEqual(loaded.IgnoredEnv, wantIgnored) {
		t.Fatalf("IgnoredEnv = %v, want %v", loaded.IgnoredEnv, wantIgnored)
	}
}

func TestPrecedence(t *testing.T) {
	t.Parallel()

	path := writeFile(t, `
server:
  display_name: home
  base_path: /speed
limits:
  max_streams_per_client: 16
`)

	tests := []struct {
		name    string
		environ []string
		check   func(t *testing.T, cfg Config)
	}{
		{
			name: "the file overrides only the keys it sets",
			check: func(t *testing.T, cfg Config) {
				t.Helper()

				want := Defaults()
				want.Server.DisplayName = "home"
				want.Server.BasePath = "/speed"
				want.Limits.MaxStreamsPerClient = 16

				if !reflect.DeepEqual(cfg, want) {
					t.Fatalf("got %+v, want %+v", cfg, want)
				}
			},
		},
		{
			name:    "the environment overrides the file",
			environ: []string{"BITGAUGE_SERVER__DISPLAY_NAME=lab"},
			check: func(t *testing.T, cfg Config) {
				t.Helper()

				if cfg.Server.DisplayName != "lab" || cfg.Server.BasePath != "/speed" {
					t.Fatalf(
						"display_name %q, base_path %q; want lab and /speed",
						cfg.Server.DisplayName,
						cfg.Server.BasePath,
					)
				}
			},
		},
		{
			name:    "the environment overrides a default the file leaves alone",
			environ: []string{"BITGAUGE_LOG__LEVEL=debug", "BITGAUGE_LOG__FORMAT=json"},
			check: func(t *testing.T, cfg Config) {
				t.Helper()

				if cfg.Log != (Log{Format: "json", Level: "debug"}) ||
					cfg.Server.DisplayName != "home" {
					t.Fatalf("log %+v, display_name %q", cfg.Log, cfg.Server.DisplayName)
				}
			},
		},
		{
			name:    "an empty list variable clears the list",
			environ: []string{"BITGAUGE_TEST_DEFAULTS__PHASES="},
			check: func(t *testing.T, cfg Config) {
				t.Helper()

				if len(cfg.TestDefaults.Phases) != 0 {
					t.Fatalf("phases = %v, want empty", cfg.TestDefaults.Phases)
				}
			},
		},
		{
			name: "a comma list keeps its order and trims spaces",
			environ: []string{
				"BITGAUGE_TEST_DEFAULTS__PHASES=upload, download",
				"BITGAUGE_SERVER__CORS__ALLOWED_ORIGINS=https://a.lan,http://b.lan:8080",
			},
			check: func(t *testing.T, cfg Config) {
				t.Helper()

				if !reflect.DeepEqual(cfg.TestDefaults.Phases, []string{"upload", "download"}) {
					t.Fatalf("phases = %v", cfg.TestDefaults.Phases)
				}

				if !reflect.DeepEqual(
					cfg.Server.CORS.AllowedOrigins,
					[]Origin{"https://a.lan", "http://b.lan:8080"},
				) {
					t.Fatalf("allowed_origins = %v", cfg.Server.CORS.AllowedOrigins)
				}
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			loaded, err := LoadFrom(path, true, tc.environ)
			if err != nil {
				t.Fatalf("LoadFrom error = %v", err)
			}

			tc.check(t, loaded.Config)
		})
	}
}

func TestFileLists(t *testing.T) {
	t.Parallel()

	path := writeFile(t, `
server:
  trusted_proxies: ["10.0.0.0/8", "::1/128"]
  cors:
    allowed_origins: [https://speed.example.lan]
test_defaults:
  phases: [download]
`)

	loaded, err := LoadFrom(path, true, nil)
	if err != nil {
		t.Fatalf("LoadFrom error = %v", err)
	}

	cfg := loaded.Config
	if !reflect.DeepEqual(
		cfg.Server.TrustedProxies,
		[]netip.Prefix{netip.MustParsePrefix("10.0.0.0/8"), netip.MustParsePrefix("::1/128")},
	) {
		t.Fatalf("trusted_proxies = %v", cfg.Server.TrustedProxies)
	}

	if !reflect.DeepEqual(cfg.Server.CORS.AllowedOrigins, []Origin{"https://speed.example.lan"}) {
		t.Fatalf("allowed_origins = %v", cfg.Server.CORS.AllowedOrigins)
	}

	if !reflect.DeepEqual(cfg.TestDefaults.Phases, []string{"download"}) {
		t.Fatalf("phases = %v", cfg.TestDefaults.Phases)
	}
}

func TestFilePaths(t *testing.T) {
	t.Parallel()

	_, err := LoadFrom(missingPath(t), true, nil)
	if !errors.Is(err, ErrFileNotFound) {
		t.Fatalf("missing explicit path: error = %v, want ErrFileNotFound", err)
	}

	_, err = LoadFrom(missingPath(t), false, nil)
	if err != nil {
		t.Fatalf("missing default path: error = %v, want none", err)
	}

	_, err = LoadFrom(writeFile(t, "server: [unclosed"), true, nil)
	if !errors.Is(err, ErrFile) {
		t.Fatalf("invalid YAML: error = %v, want ErrFile", err)
	}

	_, err = LoadFrom(writeFile(t, "server:\n  listen: \":1\"\n  listen: \":2\"\n"), true, nil)
	if !errors.Is(err, ErrFile) {
		t.Fatalf("duplicate key: error = %v, want ErrFile", err)
	}

	_, err = LoadFrom(t.TempDir(), true, nil)
	if !errors.Is(err, ErrFile) {
		t.Fatalf("a directory as the file: error = %v, want ErrFile", err)
	}

	loaded, err := LoadFrom(writeFile(t, ""), true, nil)
	if err != nil || !reflect.DeepEqual(loaded.Config, Defaults()) {
		t.Fatalf("empty file: %+v, %v; want the defaults", loaded.Config, err)
	}
}

func TestUnknownKeysAreErrors(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		file    string
		environ []string
	}{
		{name: "misspelled key in the file", file: "server:\n  lisen: \":8080\"\n"},
		{name: "unknown section in the file", file: "storage:\n  path: /data\n"},
		{name: "key with the wrong case in the file", file: "Server:\n  listen: \":8080\"\n"},
		{
			name:    "misspelled key in the environment",
			environ: []string{"BITGAUGE_SERVER__LISTN=:8080"},
		},
		{
			name:    "unknown section in the environment",
			environ: []string{"BITGAUGE_STORAGE__PATH=/data"},
		},
		{
			name:    "a level below a value in the environment",
			environ: []string{"BITGAUGE_LOG__LEVEL__X=debug"},
		},
		{
			name: "listen given as its Go fields",
			file: "server:\n  listen: {Host: 0.0.0.0, Port: 9090}\n",
		},
		{
			name: "warm-up given as its Go fields",
			file: "test_defaults:\n  warmup: {Auto: true, Duration: 3000000000}\n",
		},
		{
			name: "duration given as its Go fields",
			file: "test_defaults:\n  download:\n    min_duration: {Duration: 5, Set: true}\n",
		},
		{
			name: "CIDR given as a map",
			file: "server:\n  trusted_proxies: [{addr: 10.0.0.0, bits: 8}]\n",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			path := missingPath(t)
			if tc.file != "" {
				path = writeFile(t, tc.file)
			}

			_, err := LoadFrom(path, tc.file != "", tc.environ)
			if !errors.Is(err, ErrDecode) {
				t.Fatalf("error = %v, want ErrDecode", err)
			}
		})
	}
}

func TestValueSyntax(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		env   string
		check func(cfg Config) bool
	}{
		{
			"plain byte count",
			"BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=1048576",
			func(cfg Config) bool { return cfg.Limits.MaxUploadBytes == 1048576 },
		},
		{
			"KiB",
			"BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=64KiB",
			func(cfg Config) bool { return cfg.Limits.MaxUploadBytes == 65536 },
		},
		{
			"GiB",
			"BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=4GiB",
			func(cfg Config) bool { return cfg.Limits.MaxUploadBytes == 4294967296 },
		},
		{
			"kB",
			"BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=64kB",
			func(cfg Config) bool { return cfg.Limits.MaxUploadBytes == 64000 },
		},
		{
			"MB",
			"BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=30MB",
			func(cfg Config) bool { return cfg.Limits.MaxUploadBytes == 30000000 },
		},
		{
			"GB",
			"BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=2GB",
			func(cfg Config) bool { return cfg.Limits.MaxUploadBytes == 2000000000 },
		},
		{
			"fractional unit",
			"BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=1.5GiB",
			func(cfg Config) bool { return cfg.Limits.MaxUploadBytes == 1610612736 },
		},
		{
			"zero data cap",
			"BITGAUGE_TEST_DEFAULTS__DATA_CAP=0",
			func(cfg Config) bool { return cfg.TestDefaults.DataCap == 0 },
		},
		{
			"milliseconds",
			"BITGAUGE_TEST_DEFAULTS__DOWNLOAD__MIN_DURATION=500ms",
			func(cfg Config) bool {
				return cfg.TestDefaults.Download.MinDuration == OptionalDuration{
					Duration: 500 * time.Millisecond,
					Set:      true,
				}
			},
		},
		{"seconds", "BITGAUGE_TEST_DEFAULTS__UPLOAD__MAX_DURATION=30s", func(cfg Config) bool {
			return cfg.TestDefaults.Upload.MaxDuration == OptionalDuration{
				Duration: 30 * time.Second,
				Set:      true,
			}
		}},
		{"minutes", "BITGAUGE_TEST_DEFAULTS__DOWNLOAD__MAX_DURATION=2m", func(cfg Config) bool {
			return cfg.TestDefaults.Download.MaxDuration == OptionalDuration{
				Duration: 2 * time.Minute,
				Set:      true,
			}
		}},
		{
			"empty duration is the preset's",
			"BITGAUGE_TEST_DEFAULTS__DOWNLOAD__MIN_DURATION=",
			func(cfg Config) bool {
				return cfg.TestDefaults.Download.MinDuration == OptionalDuration{}
			},
		},
		{"fixed warm-up", "BITGAUGE_TEST_DEFAULTS__WARMUP=3s", func(cfg Config) bool {
			return cfg.TestDefaults.Warmup == Warmup{Duration: 3 * time.Second}
		}},
		{
			"auto warm-up",
			"BITGAUGE_TEST_DEFAULTS__WARMUP=auto",
			func(cfg Config) bool { return cfg.TestDefaults.Warmup == Warmup{Auto: true} },
		},
		{"listen with host", "BITGAUGE_SERVER__LISTEN=127.0.0.1:18080", func(cfg Config) bool {
			return cfg.Server.Listen == Listen{Host: "127.0.0.1", Port: 18080}
		}},
		{
			"listen on IPv6",
			"BITGAUGE_SERVER__LISTEN=[::1]:8080",
			func(cfg Config) bool { return cfg.Server.Listen == Listen{Host: "::1", Port: 8080} },
		},
		{
			"boolean false",
			"BITGAUGE_METRICS__ENABLED=false",
			func(cfg Config) bool { return !cfg.Metrics.Enabled },
		},
		{
			"boolean true",
			"BITGAUGE_METRICS__ENABLED=true",
			func(cfg Config) bool { return cfg.Metrics.Enabled },
		},
		{
			"decimal percent",
			"BITGAUGE_TEST_DEFAULTS__OVERHEAD_COMPENSATION_PERCENT=5.13",
			func(cfg Config) bool {
				return cfg.TestDefaults.OverheadCompensationPercent == 5.13
			},
		},
		{
			"public url",
			"BITGAUGE_SERVER__PUBLIC_URL=https://speed.example.lan",
			func(cfg Config) bool {
				return cfg.Server.PublicURL == "https://speed.example.lan"
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			loaded, err := LoadFrom(missingPath(t), false, []string{tc.env})
			if err != nil {
				t.Fatalf("%s: error = %v", tc.env, err)
			}

			if !tc.check(loaded.Config) {
				t.Fatalf("%s decoded to %+v", tc.env, loaded.Config)
			}
		})
	}
}

func TestFileValueSyntax(t *testing.T) {
	t.Parallel()

	path := writeFile(t, `
limits:
  max_download_bytes: 1048576
  max_upload_bytes: 512MiB
test_defaults:
  data_cap: 100MB
  overhead_compensation_percent: 6
  warmup: 2s
  download:
    min_duration: 8s
    max_duration: ""
compat:
  librespeed:
    enabled: true
`)

	loaded, err := LoadFrom(path, true, nil)
	if err != nil {
		t.Fatalf("LoadFrom error = %v", err)
	}

	cfg := loaded.Config
	if cfg.Limits.MaxDownloadBytes != 1048576 || cfg.Limits.MaxUploadBytes != 512*MiB ||
		cfg.TestDefaults.DataCap != 100*Megabyte || cfg.TestDefaults.OverheadCompensationPercent != 6 ||
		cfg.TestDefaults.Warmup != (Warmup{Duration: 2 * time.Second}) ||
		cfg.TestDefaults.Download.MinDuration != (OptionalDuration{Duration: 8 * time.Second, Set: true}) ||
		cfg.TestDefaults.Download.MaxDuration != (OptionalDuration{}) || !cfg.Compat.LibreSpeed.Enabled {
		t.Fatalf("decoded %+v", cfg)
	}
}

func TestInvalidValues(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		file string
		env  string
	}{
		{name: "size in words", file: "limits:\n  max_upload_bytes: 256 megs\n"},
		{name: "size with a space", env: "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=256 MiB"},
		{name: "size with an unknown unit", env: "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=1KB"},
		{name: "size with a lower-case binary unit", env: "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=1kib"},
		{name: "negative size", env: "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=-1"},
		{name: "negative size in the file", file: "test_defaults:\n  data_cap: -1\n"},
		{name: "fractional byte count", env: "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=1.5"},
		{name: "fractional byte count in the file", file: "limits:\n  max_upload_bytes: 1.5\n"},
		{name: "size that is not whole bytes", env: "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=0.0001kB"},
		{name: "unit without a number", env: "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=MiB"},
		{name: "size overflow", env: "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=10000000000GiB"},
		{name: "byte count overflow", env: "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES=9223372036854775808"},
		{name: "empty size", env: "BITGAUGE_LIMITS__MAX_UPLOAD_BYTES="},
		{name: "duration without a unit", env: "BITGAUGE_TEST_DEFAULTS__DOWNLOAD__MIN_DURATION=10"},
		{
			name: "duration in words",
			file: "test_defaults:\n  upload:\n    max_duration: ten seconds\n",
		},
		{name: "warm-up with a capital", env: "BITGAUGE_TEST_DEFAULTS__WARMUP=Auto"},
		{name: "empty warm-up", env: "BITGAUGE_TEST_DEFAULTS__WARMUP="},
		{name: "listen without a colon", env: "BITGAUGE_SERVER__LISTEN=8080"},
		{name: "listen with a named port", env: "BITGAUGE_SERVER__LISTEN=:http"},
		{name: "integer with a fraction", env: "BITGAUGE_LIMITS__MAX_STREAMS_PER_CLIENT=8.5"},
		{
			name: "integer with a fraction in the file",
			file: "limits:\n  max_streams_per_client: 8.5\n",
		},
		{name: "integer in words", file: "limits:\n  max_streams_per_client: eight\n"},
		{name: "boolean in words", env: "BITGAUGE_METRICS__ENABLED=yes"},
		{name: "boolean in words in the file", file: "metrics:\n  enabled: \"on\"\n"},
		{name: "CIDR without a prefix length", env: "BITGAUGE_SERVER__TRUSTED_PROXIES=10.0.0.1"},
		{name: "CIDR out of range", file: "server:\n  trusted_proxies: [10.0.0.0/33]\n"},
		{name: "host name as a CIDR", file: "server:\n  trusted_proxies: [proxy.lan]\n"},
		{
			name: "empty CIDR in a list",
			env:  "BITGAUGE_SERVER__TRUSTED_PROXIES=10.0.0.0/8,,fd00::/8",
		},
		{
			name: "list given as a scalar in the file",
			file: "server:\n  trusted_proxies: 10.0.0.0/8\n",
		},
		{name: "origin that is not a URL", env: "BITGAUGE_SERVER__PUBLIC_URL=http://[::1"},
		{name: "boolean as a digit", env: "BITGAUGE_METRICS__ENABLED=1"},
		{name: "boolean in capitals", env: "BITGAUGE_COMPAT__LIBRESPEED__ENABLED=TRUE"},
		{name: "boolean as a letter", env: "BITGAUGE_COMPAT__LIBRESPEED__ENABLED=t"},
		{name: "NaN percent", env: "BITGAUGE_TEST_DEFAULTS__OVERHEAD_COMPENSATION_PERCENT=NaN"},
		{
			name: "infinite percent",
			env:  "BITGAUGE_TEST_DEFAULTS__OVERHEAD_COMPENSATION_PERCENT=+Inf",
		},
		{
			name: "NaN percent in the file",
			file: "test_defaults:\n  overhead_compensation_percent: .nan\n",
		},
		{
			name: "infinite percent in the file",
			file: "test_defaults:\n  overhead_compensation_percent: .inf\n",
		},
		{name: "infinite integer in the file", file: "limits:\n  tracked_clients: -.inf\n"},
		{
			name: "size of 2^63 bytes in the file",
			file: "limits:\n  max_upload_bytes: 9.223372036854775808e18\n",
		},
		{
			name: "integer above int64 in the file",
			file: "limits:\n  tracked_clients: 18446744073709551615\n",
		},
		{name: "section without a value", file: "server:\n  # listen: \":8080\"\n"},
		{name: "key without a value", file: "server:\n  display_name:\n"},
		{name: "explicit null", file: "log:\n  level: null\n"},
		{name: "null list element", file: "server:\n  trusted_proxies: [~]\n"},
		{name: "null origin in a list", file: "server:\n  cors:\n    allowed_origins: [~]\n"},
		{name: "null phase in a list", file: "test_defaults:\n  phases: [idle, ~]\n"},
		{name: "number for a text key", file: "server:\n  public_url: 5\n"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			path := missingPath(t)
			if tc.file != "" {
				path = writeFile(t, tc.file)
			}

			var environ []string
			if tc.env != "" {
				environ = []string{tc.env}
			}

			_, err := LoadFrom(path, tc.file != "", environ)
			if !errors.Is(err, ErrDecode) {
				t.Fatalf("error = %v, want ErrDecode", err)
			}
		})
	}
}

func TestParseSize(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input string
		want  Size
	}{
		{"0", 0},
		{"1", 1},
		{"1024", 1024},
		{"1KiB", 1024},
		{"256MiB", 268435456},
		{"1GiB", 1073741824},
		{"64GiB", 68719476736},
		{"1kB", 1000},
		{"1MB", 1000000},
		{"1GB", 1000000000},
		{"0.5KiB", 512},
		{"2.5MB", 2500000},
	}

	for _, tc := range tests {
		got, err := ParseSize(tc.input)
		if err != nil || got != tc.want {
			t.Errorf("ParseSize(%q) = %d, %v; want %d", tc.input, got, err, tc.want)
		}
	}

	for _, input := range []string{"", " 1", "1 ", "+1", "1e3", "1_000", "1.KiB", ".5KiB", "1B", "1kb", "0x10"} {
		_, err := ParseSize(input)
		if !errors.Is(err, ErrSize) {
			t.Errorf("ParseSize(%q) error = %v, want ErrSize", input, err)
		}
	}
}
