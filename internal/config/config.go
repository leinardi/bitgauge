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

// Package config loads BitGauge's configuration (configuration.md): defaults, then the optional
// YAML file, then BITGAUGE_ environment variables, each overriding only the keys it sets
// (configuration-security.md section 1). It only reads: nothing here writes a file, and the
// configuration is loaded once at startup.
package config

import "net/netip"

// DefaultPath is the configuration file read when --config is not given. A missing file at this
// path is not an error (configuration.md section 1).
const DefaultPath = "/etc/bitgauge/config.yaml"

// The defaults of configuration.md section 1. They are the only place these numbers live in Go.
const (
	defaultPort                      = 8080
	defaultBasePath                  = "/"
	defaultDisplayName               = "BitGauge"
	defaultMaxDownloadBytes          = 256 * MiB
	defaultMaxUploadBytes            = 256 * MiB
	defaultMaxStreamsPerClient       = 8
	defaultRequestsPerMinute         = 1200
	defaultTrackedClients            = 4096
	defaultPreset                    = "standard"
	defaultStreamsMode               = ""
	defaultStreamsFixed              = 3
	defaultStreamsMax                = 6
	defaultUnits                     = "bits"
	defaultNQMaxUploadBytes          = 1 * GiB
	defaultNQMaxFlowsPerClient       = 32
	defaultLogFormat                 = "text"
	defaultLogLevel                  = "info"
	defaultMetricsPath               = "/metrics"
	defaultPhaseIdle                 = "idle"
	defaultPhaseDownload             = "download"
	defaultPhaseUpload               = "upload"
	defaultOverheadCompensation      = 0
	defaultDataCap              Size = 0
)

// Config is the whole configuration. Its koanf tags are the key paths of configuration.md
// section 1; a key in the file or the environment that matches no field is an error.
type Config struct {
	Server       Server       `koanf:"server"`
	Limits       Limits       `koanf:"limits"`
	TestDefaults TestDefaults `koanf:"test_defaults"`
	Compat       Compat       `koanf:"compat"`
	Log          Log          `koanf:"log"`
	Metrics      Metrics      `koanf:"metrics"`
}

// Server holds the server.* keys (configuration.md section 2.1).
type Server struct {
	// omitnested keeps the struct provider from flattening Listen into its fields, so the
	// default stays one value at the key server.listen.
	Listen         Listen         `koanf:"listen,omitnested"`
	BasePath       string         `koanf:"base_path"`
	DisplayName    string         `koanf:"display_name"`
	PublicURL      Origin         `koanf:"public_url"`
	TrustedProxies []netip.Prefix `koanf:"trusted_proxies"`
	Labels         []LabelRule    `koanf:"labels"`
	CORS           CORS           `koanf:"cors"`
}

// LabelRule is one server.labels entry: client addresses in CIDR get Label as their suggested
// context label (wire-protocol.md section 5).
type LabelRule struct {
	CIDR  netip.Prefix `koanf:"cidr"`
	Label string       `koanf:"label"`
}

// CORS holds the server.cors.* keys.
type CORS struct {
	AllowedOrigins []Origin `koanf:"allowed_origins"`
}

// Limits holds the limits.* keys (configuration.md section 2.2).
type Limits struct {
	MaxDownloadBytes    Size `koanf:"max_download_bytes"`
	MaxUploadBytes      Size `koanf:"max_upload_bytes"`
	MaxStreamsPerClient int  `koanf:"max_streams_per_client"`
	RequestsPerMinute   int  `koanf:"requests_per_minute"`
	TrackedClients      int  `koanf:"tracked_clients"`
}

// TestDefaults holds the test_defaults.* keys (configuration.md section 2.3), exposed to the
// browser through GET /api/v1/info.
type TestDefaults struct {
	Preset                      string        `koanf:"preset"`
	Phases                      []string      `koanf:"phases"`
	Streams                     Streams       `koanf:"streams"`
	Download                    DurationRange `koanf:"download"`
	Upload                      DurationRange `koanf:"upload"`
	DataCap                     Size          `koanf:"data_cap"`
	Units                       string        `koanf:"units"`
	Warmup                      Warmup        `koanf:"warmup,omitnested"`
	PingCount                   int           `koanf:"ping_count"`
	OverheadCompensationPercent float64       `koanf:"overhead_compensation_percent"`
}

// Streams holds the test_defaults.streams.* keys.
type Streams struct {
	// Mode is auto, fixed or single; empty means the preset's mode (PresetValues.StreamsMode).
	Mode  string `koanf:"mode"`
	Fixed int    `koanf:"fixed"`
	Max   int    `koanf:"max"`
}

// DurationRange holds a direction's min_duration and max_duration; an unset bound means the
// preset's value.
type DurationRange struct {
	MinDuration OptionalDuration `koanf:"min_duration,omitnested"`
	MaxDuration OptionalDuration `koanf:"max_duration,omitnested"`
}

// Compat holds the compat.* keys (configuration.md section 2.4).
type Compat struct {
	OpenSpeedTest  Toggle         `koanf:"openspeedtest"`
	LibreSpeed     Toggle         `koanf:"librespeed"`
	NetworkQuality NetworkQuality `koanf:"networkquality"`
}

// Toggle is a compatibility layer with no setting beyond its switch.
type Toggle struct {
	Enabled bool `koanf:"enabled"`
}

// NetworkQuality holds the compat.networkquality.* keys.
type NetworkQuality struct {
	Enabled           bool `koanf:"enabled"`
	MaxUploadBytes    Size `koanf:"max_upload_bytes"`
	MaxFlowsPerClient int  `koanf:"max_flows_per_client"`
}

// Log holds the log.* keys (configuration.md section 2.5).
type Log struct {
	Format string `koanf:"format"`
	Level  string `koanf:"level"`
}

// Metrics holds the metrics.* keys (configuration.md section 2.6).
type Metrics struct {
	Enabled bool   `koanf:"enabled"`
	Path    string `koanf:"path"`
}

// Defaults returns the configuration a deployment gets with no file and no environment: every
// key at the value configuration.md section 1 shows.
func Defaults() Config {
	return Config{
		Server: Server{
			Listen:         Listen{Port: defaultPort},
			BasePath:       defaultBasePath,
			DisplayName:    defaultDisplayName,
			TrustedProxies: []netip.Prefix{},
			Labels:         []LabelRule{},
			CORS:           CORS{AllowedOrigins: []Origin{}},
		},
		Limits: Limits{
			MaxDownloadBytes:    defaultMaxDownloadBytes,
			MaxUploadBytes:      defaultMaxUploadBytes,
			MaxStreamsPerClient: defaultMaxStreamsPerClient,
			RequestsPerMinute:   defaultRequestsPerMinute,
			TrackedClients:      defaultTrackedClients,
		},
		TestDefaults: TestDefaults{
			Preset: defaultPreset,
			Phases: []string{
				defaultPhaseIdle,
				defaultPhaseDownload,
				defaultPhaseUpload,
			},
			Streams: Streams{
				Mode:  defaultStreamsMode,
				Fixed: defaultStreamsFixed,
				Max:   defaultStreamsMax,
			},
			DataCap:                     defaultDataCap,
			Units:                       defaultUnits,
			Warmup:                      Warmup{Auto: true},
			OverheadCompensationPercent: defaultOverheadCompensation,
		},
		Compat: Compat{
			NetworkQuality: NetworkQuality{
				MaxUploadBytes:    defaultNQMaxUploadBytes,
				MaxFlowsPerClient: defaultNQMaxFlowsPerClient,
			},
		},
		Log:     Log{Format: defaultLogFormat, Level: defaultLogLevel},
		Metrics: Metrics{Path: defaultMetricsPath},
	}
}
