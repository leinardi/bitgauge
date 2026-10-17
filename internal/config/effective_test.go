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
	"log/slog"
	"net/netip"
	"strings"
	"testing"
	"time"
)

func TestEffective(t *testing.T) {
	t.Parallel()

	cfg := Defaults()
	cfg.Server.TrustedProxies = []netip.Prefix{netip.MustParsePrefix("172.20.0.2/32")}
	cfg.Server.Labels = []LabelRule{
		{CIDR: netip.MustParsePrefix("10.8.0.0/24"), Label: "VPN"},
		{CIDR: netip.MustParsePrefix("fd7a:115c:a1e0::/48"), Label: "Tailscale"},
	}
	cfg.TestDefaults.Download.MaxDuration = OptionalDuration{Duration: 30 * time.Second, Set: true}
	cfg.TestDefaults.Warmup = Warmup{Duration: 3 * time.Second}

	for _, format := range []string{"text", "json"} {
		var out bytes.Buffer

		var handler slog.Handler = slog.NewTextHandler(&out, nil)
		if format == "json" {
			handler = slog.NewJSONHandler(&out, nil)
		}

		slog.New(handler).LogAttrs(t.Context(), slog.LevelInfo, "configuration", Effective(&cfg)...)

		line := out.String()
		for _, want := range []string{
			"server.listen", ":8080", "172.20.0.2/32", "30s", "3s", "server.labels",
			"10.8.0.0/24=VPN", "fd7a:115c:a1e0::/48=Tailscale",
			"limits.max_download_bytes", "test_defaults.download.min_duration", "metrics.path",
		} {
			if !strings.Contains(line, want) {
				t.Fatalf("%s line %q lacks %q", format, line, want)
			}
		}
	}

	auto := Defaults()

	var out bytes.Buffer

	slog.New(slog.NewTextHandler(&out, nil)).
		LogAttrs(t.Context(), slog.LevelInfo, "c", Effective(&auto)...)

	if !strings.Contains(out.String(), "test_defaults.warmup=auto") ||
		!strings.Contains(out.String(), "server.labels=[]") {
		t.Fatalf("line %q lacks the automatic warm-up or the empty labels", out.String())
	}
}
