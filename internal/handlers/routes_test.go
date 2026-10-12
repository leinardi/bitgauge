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
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/leinardi/bitgauge/internal/buildinfo"
	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/ratelimit"
)

func testDeps() *Deps {
	cfg := config.Defaults()

	epoch := Epoch{ID: "k3V9qW2rT0aY", GridOffset: 1234}

	return &Deps{
		Config: &cfg,
		Buffer: NewBuffer(),
		Grid:   NewGrid(ratelimit.RealClock{}, epoch.GridOffset),
		Build:  buildinfo.Build{Version: "0.1.0", Commit: "a1b2c3d", Date: "2026-09-30T12:00:00Z"},
		Epoch:  epoch,
	}
}

// mounted is the native router as the server mounts it, below a base path.
func mounted(t *testing.T) http.Handler {
	t.Helper()

	root := chi.NewRouter()
	root.Route("/speed", func(base chi.Router) {
		base.Use(clientip.Middleware(clientip.NewDeriver(nil)))
		base.Mount(Prefix, Routes(testDeps()))
	})

	return root
}

func serve(t *testing.T, handler http.Handler, method, path string) *httptest.ResponseRecorder {
	t.Helper()

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequestWithContext(t.Context(), method, path, nil))

	return recorder
}

func TestRoutesServeTheNativeAPI(t *testing.T) {
	t.Parallel()

	// A real server, so the download can set its write deadlines.
	server := httptest.NewServer(mounted(t))
	t.Cleanup(server.Close)

	for _, route := range []struct {
		method, path string
		status       int
	}{
		{http.MethodGet, "/speed/api/v1/ping", http.StatusNoContent},
		{http.MethodHead, "/speed/api/v1/ping", http.StatusNoContent},
		{http.MethodGet, "/speed/api/v1/small", http.StatusOK},
		{http.MethodGet, "/speed/api/v1/download?bytes=10", http.StatusOK},
		{http.MethodGet, "/speed/api/v1/info", http.StatusOK},
		{http.MethodPost, "/speed/api/v1/upload", http.StatusOK},
	} {
		request, err := http.NewRequestWithContext(
			t.Context(),
			route.method,
			server.URL+route.path,
			http.NoBody,
		)
		if err != nil {
			t.Fatal(err)
		}

		response, err := server.Client().Do(request)
		if err != nil {
			t.Fatal(err)
		}

		_, err = io.Copy(io.Discard, response.Body)
		_ = response.Body.Close()

		if err != nil || response.StatusCode != route.status {
			t.Fatalf("%s %s = %d (%v), want %d",
				route.method, route.path, response.StatusCode, err, route.status)
		}
	}
}

func TestRoutesWrongMethodIs405WithAllow(t *testing.T) {
	t.Parallel()

	handler := mounted(t)

	for _, test := range []struct {
		handler      http.Handler
		method, path string
		allow        string
	}{
		{handler, http.MethodPost, "/speed/api/v1/ping", "GET, HEAD"},
		{handler, http.MethodDelete, "/speed/api/v1/ping", "GET, HEAD"},
		{handler, http.MethodHead, "/speed/api/v1/small", "GET"},
		{handler, http.MethodPost, "/speed/api/v1/small", "GET"},
		{handler, http.MethodPost, "/speed/api/v1/download", "GET"},
		{handler, http.MethodGet, "/speed/api/v1/upload", "POST"},
		{handler, http.MethodHead, "/speed/api/v1/info", "GET"},
		// Not mounted: the route path is the request path.
		{Routes(testDeps()), http.MethodPut, "/small", "GET"},
	} {
		recorder := serve(t, test.handler, test.method, test.path)
		assertEnvelope(t, recorder, http.StatusMethodNotAllowed, CodeMethodNotAllowed)

		if got := recorder.Header().Get("Allow"); got != test.allow {
			t.Fatalf("%s %s: Allow = %q, want %q", test.method, test.path, got, test.allow)
		}
	}
}

func TestRoutesUnknownPathIs404Envelope(t *testing.T) {
	t.Parallel()

	handler := mounted(t)

	for _, path := range []string{"/speed/api/v1/", "/speed/api/v1/nope", "/speed/api/v1/ping/extra"} {
		assertEnvelope(
			t,
			serve(t, handler, http.MethodGet, path),
			http.StatusNotFound,
			CodeNotFound,
		)
	}
}
