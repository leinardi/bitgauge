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
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/leinardi/bitgauge/internal/buildinfo"
	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/metrics"
)

// testLayers are two enabled layers' exact paths; OpenSpeedTest stands for a disabled layer.
var testLayers = map[Group][]string{
	GroupLibreSpeed: {"/garbage", "/backend/garbage.php"},
	GroupNQ:         {"/nq/config"},
}

func TestClassifierPutsEnabledLayerPathsInTheirGroup(t *testing.T) {
	t.Parallel()

	cfg := metricsConfig("/speed/")
	classify := NewClassifier(cfg, testLayers)

	for path, want := range map[string]Group{
		"/speed/garbage":             GroupLibreSpeed,
		"/speed/backend/garbage.php": GroupLibreSpeed,
		"/speed/nq/config":           GroupNQ,
		"/speed/api/v1/info":         GroupAPI,
		"/speed/metrics":             GroupAPI,
		// Exact paths only, below base_path only, and a disabled layer's stay unmatched.
		"/speed/garbage/x":   GroupSPA,
		"/speed/nq/config/":  GroupSPA,
		"/garbage":           GroupSPA,
		"/speed/downloading": GroupSPA,
	} {
		request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil)
		if got := classify(request); got != want {
			t.Fatalf("%s: group %d, want %d", path, got, want)
		}
	}
}

func TestLayerGroupsTakeTheAPIRules(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	// The meter knows a route of each layer, as it will once the layers mount theirs.
	meter := metrics.New(buildinfo.Info(), nil, append(MountedRoutes(cfg),
		metrics.Route{Pattern: "/garbage", Group: metrics.GroupLibreSpeed},
		metrics.Route{Pattern: "/nq/config", Group: metrics.GroupNQ}))
	router := chi.NewRouter()
	router.Get("/nq/config", func(http.ResponseWriter, *http.Request) { panic(errBoom) })

	handler := Chain(router, clientip.NewDeriver(nil), NewClassifier(cfg, testLayers),
		&fakeClock{}, slog.New(slog.DiscardHandler), NewObserver(cfg, meter))

	// A recovered panic is the error envelope, with the API header set.
	recorder := get(t, handler, "/nq/config")
	if recorder.Code != http.StatusInternalServerError ||
		recorder.Header().Get("Content-Type") != "application/json" ||
		recorder.Header().Get("Cache-Control") != "no-store" ||
		recorder.Header().Get("X-Content-Type-Options") != "nosniff" ||
		recorder.Header().Get("Content-Security-Policy") != "" {
		t.Fatalf("status %d, headers %v; want the envelope with the API headers",
			recorder.Code, recorder.Header())
	}

	// A layer path no route matched counts as that layer's unmatched route.
	get(t, handler, "/garbage")

	scraped := httptest.NewRecorder()
	meter.Handler(slog.New(slog.DiscardHandler)).ServeHTTP(scraped,
		httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/metrics", nil))

	for _, labels := range []string{
		`code="500",group="nq",route="unmatched"} 1`,
		`code="404",group="librespeed",route="unmatched"} 1`,
	} {
		if !strings.Contains(scraped.Body.String(), labels) {
			t.Fatalf("no request counter with %s in\n%s", labels, scraped.Body.String())
		}
	}
}

func TestLayerGroupsGetTheAPIHeaders(t *testing.T) {
	t.Parallel()

	for _, group := range []Group{GroupOpenSpeedTest, GroupLibreSpeed, GroupNQ} {
		header := http.Header{}
		setHeaders(header, group, "speed.example")

		if len(header) != 2 || header.Get("X-Content-Type-Options") != "nosniff" ||
			header.Get("Cache-Control") != "no-store" {
			t.Fatalf("group %d: headers %v, want nosniff and no-store only", group, header)
		}
	}
}
