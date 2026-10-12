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
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

// mounted is the native router as the server mounts it, below a base path.
func mounted(t *testing.T) http.Handler {
	t.Helper()

	root := chi.NewRouter()
	root.Route("/speed", func(base chi.Router) {
		base.Mount(Prefix, Routes(&Deps{Buffer: NewBuffer(), Epoch: NewEpoch()}))
	})

	return root
}

func serve(t *testing.T, handler http.Handler, method, path string) *httptest.ResponseRecorder {
	t.Helper()

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequestWithContext(t.Context(), method, path, nil))

	return recorder
}

func TestRoutesServeTheProbes(t *testing.T) {
	t.Parallel()

	handler := mounted(t)

	for _, route := range []struct {
		method, path string
		status       int
	}{
		{http.MethodGet, "/speed/api/v1/ping", http.StatusNoContent},
		{http.MethodHead, "/speed/api/v1/ping", http.StatusNoContent},
		{http.MethodGet, "/speed/api/v1/small", http.StatusOK},
	} {
		if got := serve(t, handler, route.method, route.path).Code; got != route.status {
			t.Fatalf("%s %s = %d, want %d", route.method, route.path, got, route.status)
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
		// Not mounted: the route path is the request path.
		{Routes(&Deps{}), http.MethodPut, "/small", "GET"},
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
