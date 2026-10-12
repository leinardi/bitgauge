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

package server

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/config"
)

func TestNewServerSettings(t *testing.T) {
	t.Parallel()

	cfg := config.Defaults()
	server := New(&cfg, slog.New(slog.DiscardHandler), &Deps{
		Handler: http.NotFoundHandler(),
		Deriver: clientip.NewDeriver(nil),
		Clock:   &fakeClock{},
	})

	if server.Addr != ":8080" || server.Handler == nil || server.ErrorLog == nil {
		t.Fatalf("Addr %q, handler %v, error log %v", server.Addr, server.Handler, server.ErrorLog)
	}

	if server.ReadHeaderTimeout != 10*time.Second || server.IdleTimeout != 120*time.Second ||
		server.MaxHeaderBytes != 16*1024 {
		t.Fatalf("timeouts %v, %v, header cap %d", server.ReadHeaderTimeout, server.IdleTimeout,
			server.MaxHeaderBytes)
	}

	// No global timeout: throughput routes set their own deadlines.
	if server.ReadTimeout != 0 || server.WriteTimeout != 0 {
		t.Fatalf("global timeouts %v and %v, want none", server.ReadTimeout, server.WriteTimeout)
	}
}

func TestClassifier(t *testing.T) {
	t.Parallel()

	cfg := config.Defaults()
	cfg.Server.BasePath = "/speed"
	cfg.Metrics.Enabled = true

	classify := NewClassifier(&cfg)

	for path, want := range map[string]Group{
		"/speed/api/v1":          GroupAPI,
		"/speed/api/v1/":         GroupAPI,
		"/speed/api/v1/info":     GroupAPI,
		"/speed/metrics":         GroupAPI,
		"/speed/":                GroupSPA,
		"/speed/api/v1x":         GroupSPA,
		"/speed/assets/index.js": GroupSPA,
		"/api/v1/info":           GroupSPA,
		"/metrics":               GroupSPA,
		"/speed/metrics/x":       GroupSPA,
	} {
		request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil)
		if got := classify(request); got != want {
			t.Fatalf("%s: group %d, want %d", path, got, want)
		}
	}

	cfg.Metrics.Enabled = false

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/speed/metrics", nil)
	if NewClassifier(&cfg)(request) != GroupSPA {
		t.Fatal("/metrics is in the API group while metrics are off")
	}
}
