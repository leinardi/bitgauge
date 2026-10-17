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
	"net/netip"
	"time"

	"github.com/leinardi/bitgauge/internal/buildinfo"
	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/config"
)

const (
	// UploadLifetime is the longest an upload body is read (wire-protocol.md section 3.2).
	UploadLifetime = 120 * time.Second
	// BucketMs is the server grid's cell length in milliseconds; there is no coarsening.
	BucketMs = 100
	// warmupAuto is the info value of an automatic warm-up.
	warmupAuto = "auto"
)

type info struct {
	Server   infoServer   `json:"server"`
	Client   infoClient   `json:"client"`
	Limits   infoLimits   `json:"limits"`
	Defaults infoDefaults `json:"defaults"`
	Compat   infoCompat   `json:"compat"`
}

type infoServer struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildDate string `json:"buildDate"`
	Epoch     string `json:"epoch"`
	BasePath  string `json:"basePath"`
}

type infoClient struct {
	IP             string  `json:"ip"`
	IPVersion      int     `json:"ipVersion"`
	AddressClass   string  `json:"addressClass"`
	SuggestedLabel *string `json:"suggestedLabel"`
}

type infoLimits struct {
	MaxDownloadBytes    int64 `json:"maxDownloadBytes"`
	MaxUploadBytes      int64 `json:"maxUploadBytes"`
	MaxStreamsPerClient int   `json:"maxStreamsPerClient"`
	UploadLifetimeMs    int64 `json:"uploadLifetimeMs"`
	BucketMs            int   `json:"bucketMs"`
}

type infoDefaults struct {
	Preset   string        `json:"preset"`
	Phases   []string      `json:"phases"`
	Streams  infoStreams   `json:"streams"`
	Download infoDurations `json:"download"`
	Upload   infoDurations `json:"upload"`
	// DataCapBytes is null without a cap.
	DataCapBytes *int64 `json:"dataCapBytes"`
	Units        string `json:"units"`
	// Warmup is "auto" or the fixed warm-up in whole milliseconds.
	Warmup                      any     `json:"warmup"`
	PingCount                   int     `json:"pingCount"`
	OverheadCompensationPercent float64 `json:"overheadCompensationPercent"`
}

type infoStreams struct {
	Mode  string `json:"mode"`
	Fixed int    `json:"fixed"`
	Max   int    `json:"max"`
}

// infoDurations is a resolved duration range; a bound is null only when neither the
// configuration nor the preset has one.
type infoDurations struct {
	MinMs *int64 `json:"minMs"`
	MaxMs *int64 `json:"maxMs"`
}

type infoCompat struct {
	OpenSpeedTest  bool `json:"openspeedtest"`
	LibreSpeed     bool `json:"librespeed"`
	NetworkQuality bool `json:"networkquality"`
}

// Info answers GET /api/v1/info with the response of wire-protocol.md section 5, built per
// request from the configuration, the build information, the epoch and the client IP derived
// by the clientip middleware; nothing is cached per client.
func Info(
	cfg *config.Config,
	build buildinfo.Build,
	epoch Epoch,
	labeler *clientip.Labeler,
) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		addr, derived := clientip.FromContext(request.Context())
		if !derived {
			// The router always runs the clientip middleware first; this is a wiring bug.
			WriteError(
				writer,
				http.StatusInternalServerError,
				CodeInternal,
				"client address unavailable",
				nil,
			)

			return
		}

		body, err := json.Marshal(info{
			Server: infoServer{
				Name:      cfg.Server.DisplayName,
				Version:   build.Version,
				Commit:    build.Commit,
				BuildDate: build.Date,
				Epoch:     epoch.ID,
				BasePath:  cfg.Server.BasePath,
			},
			Client:   newInfoClient(addr, labeler),
			Limits:   newInfoLimits(&cfg.Limits),
			Defaults: newInfoDefaults(&cfg.TestDefaults),
			// No compatibility layer ships in this release: configuration validation rejects
			// enabling one (configuration.md section 4).
			Compat: infoCompat{},
		})
		if err != nil {
			WriteError(writer, http.StatusInternalServerError, CodeInternal, "encode info", nil)

			return
		}

		header := writer.Header()
		header["Cache-Control"] = noStore
		header["Content-Type"] = jsonType

		writer.WriteHeader(http.StatusOK)

		// A failed write means the client is gone; there is nobody left to tell.
		_, _ = writer.Write(body)
	}
}

// newInfoClient describes the client: its suggested label is labeler's, from server.labels and
// then the address class.
func newInfoClient(addr netip.Addr, labeler *clientip.Labeler) infoClient {
	client := infoClient{
		IP:           addr.String(),
		IPVersion:    clientip.Version(addr),
		AddressClass: string(clientip.AddressClass(addr)),
	}

	if label := labeler.Suggest(addr); label != clientip.LabelNone {
		value := string(label)
		client.SuggestedLabel = &value
	}

	return client
}

func newInfoLimits(limits *config.Limits) infoLimits {
	return infoLimits{
		MaxDownloadBytes:    int64(limits.MaxDownloadBytes),
		MaxUploadBytes:      int64(limits.MaxUploadBytes),
		MaxStreamsPerClient: limits.MaxStreamsPerClient,
		UploadLifetimeMs:    UploadLifetime.Milliseconds(),
		BucketMs:            BucketMs,
	}
}

// newInfoDefaults resolves the test defaults: an empty duration bound becomes the preset's
// value and ping_count 0 the preset's idle ping count (wire-protocol.md section 5).
func newInfoDefaults(defaults *config.TestDefaults) infoDefaults {
	preset, known := config.Preset(defaults.Preset)

	resolved := infoDefaults{
		Preset: defaults.Preset,
		Phases: defaults.Phases,
		Streams: infoStreams{
			Mode:  defaults.Streams.Mode,
			Fixed: defaults.Streams.Fixed,
			Max:   defaults.Streams.Max,
		},
		Download:                    resolveDurations(defaults.Download, preset.Download, known),
		Upload:                      resolveDurations(defaults.Upload, preset.Upload, known),
		Units:                       defaults.Units,
		Warmup:                      warmupAuto,
		PingCount:                   defaults.PingCount,
		OverheadCompensationPercent: defaults.OverheadCompensationPercent,
	}

	if defaults.DataCap != 0 {
		dataCap := int64(defaults.DataCap)
		resolved.DataCapBytes = &dataCap
	}

	if !defaults.Warmup.Auto {
		resolved.Warmup = defaults.Warmup.Duration.Milliseconds()
	}

	if resolved.PingCount == 0 && known {
		resolved.PingCount = preset.PingCount
	}

	return resolved
}

func resolveDurations(
	bounds config.DurationRange,
	preset [2]time.Duration,
	known bool,
) infoDurations {
	return infoDurations{
		MinMs: resolveBound(bounds.MinDuration, preset[0], known),
		MaxMs: resolveBound(bounds.MaxDuration, preset[1], known),
	}
}

func resolveBound(bound config.OptionalDuration, preset time.Duration, known bool) *int64 {
	var milliseconds int64

	switch {
	case bound.Set:
		milliseconds = bound.Duration.Milliseconds()
	case known:
		milliseconds = preset.Milliseconds()
	default:
		return nil
	}

	return &milliseconds
}
