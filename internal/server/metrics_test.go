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
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/leinardi/bitgauge/internal/buildinfo"
	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/metrics"
)

// fetch sends one request with Accept-Encoding: gzip set by hand, which keeps the client from
// decompressing, so Content-Encoding reaches the test as the server sent it.
func (s *stack) fetch(t *testing.T, method, path string) (answer reply, body string) {
	t.Helper()

	request, err := http.NewRequestWithContext(t.Context(), method, s.server.URL+path, http.NoBody)
	if err != nil {
		t.Fatal(err)
	}

	request.Header.Set("Accept-Encoding", "gzip")

	response, err := s.server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}

	read, err := io.ReadAll(response.Body)
	_ = response.Body.Close()

	if err != nil {
		t.Fatal(err)
	}

	return reply{Header: response.Header, StatusCode: response.StatusCode}, string(read)
}

func metricsConfig(basePath string) *config.Config {
	cfg := testConfig()
	cfg.Metrics.Enabled = true
	cfg.Server.BasePath = basePath

	return cfg
}

func TestMetricsEndpointOffIsAPlain404(t *testing.T) {
	t.Parallel()

	stack := newStack(t, testConfig(), stubSPA(http.NotFoundHandler()))

	response, body := stack.fetch(t, http.MethodGet, "/metrics")
	if response.StatusCode != http.StatusNotFound ||
		strings.Contains(response.Header.Get("Content-Type"), "json") ||
		strings.Contains(body, "bitgauge_") {
		t.Fatalf("status %d, Content-Type %q, body %q; want the plain 404",
			response.StatusCode, response.Header.Get("Content-Type"), body)
	}
}

func TestMetricsEndpoint(t *testing.T) {
	t.Parallel()

	for _, basePath := range []string{"/", "/speed/"} {
		stack := newStack(t, metricsConfig(basePath), stubSPA(http.NotFoundHandler()))
		path := strings.TrimSuffix(basePath, "/") + "/metrics"

		response, body := stack.fetch(t, http.MethodGet, path)
		if response.StatusCode != http.StatusOK ||
			!strings.HasPrefix(response.Header.Get("Content-Type"), "text/plain") ||
			!strings.Contains(body, "bitgauge_build_info{") {
			t.Fatalf("%s: status %d, Content-Type %q", path, response.StatusCode,
				response.Header.Get("Content-Type"))
		}

		for name, want := range map[string]string{
			"Cache-Control":          "no-store",
			"X-Content-Type-Options": "nosniff",
			"Content-Encoding":       "",
		} {
			if got := response.Header.Get(name); got != want {
				t.Fatalf("%s: %s = %q, want %q", path, name, got, want)
			}
		}

		for _, method := range []string{http.MethodHead, http.MethodPost, http.MethodDelete} {
			refused, refusedBody := stack.fetch(t, method, path)
			if refused.StatusCode != http.StatusMethodNotAllowed ||
				refused.Header.Get("Allow") != http.MethodGet ||
				strings.Contains(refused.Header.Get("Content-Type"), "json") ||
				strings.Contains(refusedBody, "bitgauge_") {
				t.Fatalf("%s %s: status %d, Allow %q, Content-Type %q; want a plain 405",
					method, path, refused.StatusCode, refused.Header.Get("Allow"),
					refused.Header.Get("Content-Type"))
			}
		}

		if basePath != "/" {
			if got, _ := stack.fetch(t, http.MethodGet, "/metrics"); got.StatusCode !=
				http.StatusNotFound {
				t.Fatalf("/metrics outside the base path = %d, want 404", got.StatusCode)
			}
		}
	}
}

func TestMetricsEndpointIsNotRateLimited(t *testing.T) {
	t.Parallel()

	stack := newStack(t, metricsConfig("/"), nil)

	// Twice the burst of testRequestsPerMinute: the clock never refills, so a limited route
	// would refuse the second half.
	for range 2 * testRequestsPerMinute {
		if got, _ := stack.fetch(t, http.MethodGet, "/metrics"); got.StatusCode != http.StatusOK {
			t.Fatalf("scrape answered %d", got.StatusCode)
		}
	}

	// The scrapes took none of the throughput routes' tokens.
	for range testRequestsPerMinute {
		got, _ := stack.fetch(t, http.MethodGet, "/api/v1/download?bytes=1")
		if got.StatusCode != http.StatusOK {
			t.Fatalf("download after the scrapes answered %d", got.StatusCode)
		}
	}
}

// requestPath is a path the route pattern matches.
func requestPath(pattern string) string {
	path := strings.ReplaceAll(pattern, "{id}", "abc")
	path = strings.ReplaceAll(path, "*", "index-a1.js")

	if path == "/api/v1/download" {
		path += "?bytes=1"
	}

	return path
}

// TestRequestsAreLabeledByOwner sends a request to every mounted route, under a base path and
// without one, and finds it counted under its owner's group and its pattern without the base
// path; paths no route matches count as unmatched, in the classifier's group.
func TestRequestsAreLabeledByOwner(t *testing.T) {
	t.Parallel()

	for _, basePath := range []string{"/", "/speed/"} {
		cfg := metricsConfig(basePath)
		stack := newStack(t, cfg, stubSPA(http.NotFoundHandler()))
		base := strings.TrimSuffix(basePath, "/")
		want := []string{}

		for _, route := range MountedRoutes(cfg) {
			method := http.MethodGet
			if route.Pattern == "/api/v1/upload" {
				method = http.MethodPost
			}

			stack.fetch(t, method, base+requestPath(route.Pattern))
			want = append(want, `group="`+string(route.Group)+`",route="`+route.Pattern+`"}`)
		}

		stack.fetch(t, http.MethodGet, base+"/wp-login.php")
		stack.fetch(t, http.MethodGet, base+"/api/v1/nope")

		want = append(want, `group="spa",route="unmatched"}`, `group="api",route="unmatched"}`)

		_, body := stack.fetch(t, http.MethodGet, base+"/metrics")

		for _, labels := range want {
			if !strings.Contains(body, "bitgauge_http_requests_total{code=") ||
				!containsRequestSeries(body, labels) {
				t.Errorf("base %s: no request counter with %s", basePath, labels)
			}
		}

		if strings.Contains(body, `route="/speed`) || strings.Contains(body, "wp-login") {
			t.Errorf("base %s: a label carries the base path or a scanned path", basePath)
		}
	}
}

func containsRequestSeries(body, labels string) bool {
	for line := range strings.SplitSeq(body, "\n") {
		if strings.HasPrefix(line, "bitgauge_http_requests_total{") &&
			strings.Contains(line, labels) {
			return true
		}
	}

	return false
}

// TestPanickingRequestsAreCounted: a panic recovery answers counts as 500, and an
// http.ErrAbortHandler panic, on which the connection is dropped, as a request without a
// status.
func TestPanickingRequestsAreCounted(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	meter := metrics.New(buildinfo.Info(), nil, MountedRoutes(cfg))
	router := chi.NewRouter()
	router.Get("/api/v1/boom", func(http.ResponseWriter, *http.Request) { panic(errBoom) })
	router.Get("/api/v1/abort", func(http.ResponseWriter, *http.Request) {
		panic(http.ErrAbortHandler)
	})

	handler := Chain(router, clientip.NewDeriver(nil), NewClassifier(cfg), &fakeClock{},
		slog.New(slog.DiscardHandler), NewObserver(cfg, meter))

	if got := get(t, handler, "/api/v1/boom").Code; got != http.StatusInternalServerError {
		t.Fatalf("boom answered %d, want 500", got)
	}

	func() {
		defer func() {
			recovered, _ := recover().(error)
			if !errors.Is(recovered, http.ErrAbortHandler) {
				t.Errorf("abort recovered %v, want http.ErrAbortHandler", recovered)
			}
		}()

		get(t, handler, "/api/v1/abort")
	}()

	recorder := httptest.NewRecorder()
	meter.Handler(slog.New(slog.DiscardHandler)).ServeHTTP(recorder,
		httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/metrics", nil))

	for _, labels := range []string{
		`code="500",group="api",route="unmatched"} 1`,
		`code="other",group="api",route="unmatched"} 1`,
	} {
		if !containsRequestSeries(recorder.Body.String(), labels) {
			t.Errorf("no request counter %s", labels)
		}
	}
}
