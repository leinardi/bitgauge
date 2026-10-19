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
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/leinardi/bitgauge/internal/buildinfo"
	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/metrics"
	"github.com/leinardi/bitgauge/internal/ratelimit"
	"github.com/leinardi/bitgauge/web"
)

// testRequestsPerMinute gives a burst of exactly 60 tokens; the fake clock never refills.
const testRequestsPerMinute = 60

// stack is the whole server handler, global chain and router, for a configuration.
type stack struct {
	server *httptest.Server
	native *handlers.Deps
	meter  *metrics.Metrics
}

func newStack(t *testing.T, cfg *config.Config, spa func(chi.Router)) *stack {
	t.Helper()

	clock := &fakeClock{now: time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)}
	log := slog.New(slog.DiscardHandler)
	limiter := ratelimit.New(ratelimit.Options{
		MaxStreams:        cfg.Limits.MaxStreamsPerClient,
		RequestsPerMinute: cfg.Limits.RequestsPerMinute,
		TrackedClients:    cfg.Limits.TrackedClients,
		MaxFlows:          cfg.Compat.NetworkQuality.MaxFlowsPerClient,
	}, clock)
	epoch := handlers.NewEpoch()
	meter := metrics.New(buildinfo.Info(), limiter.Len, MountedRoutes(cfg))
	native := &handlers.Deps{
		Config: cfg,
		Buffer: handlers.NewBuffer(),
		Grid:   handlers.NewGrid(clock, epoch.GridOffset),
		WebSockets: handlers.NewWebSockets(limiter, ratelimit.RealClock{},
			cfg.Server.CORS.AllowedOrigins, handlers.WebSocketIdle, log, meter),
		Build:   buildinfo.Info(),
		Epoch:   epoch,
		Metrics: meter,
	}

	router, problems := NewRouter(cfg, &Groups{
		SPA:     spa,
		Native:  native,
		Limiter: limiter,
		Metrics: meter.Handler(log),
		Log:     log,
	})
	if problems != nil {
		t.Fatalf("route problems %v", problems)
	}

	server := httptest.NewServer(Chain(router, clientip.NewDeriver(nil), NewClassifier(cfg, nil),
		clock, log, NewObserver(cfg, meter)))
	t.Cleanup(server.Close)

	return &stack{server: server, native: native, meter: meter}
}

// reply is a response whose body has been read and closed.
type reply struct {
	Header     http.Header
	StatusCode int
}

func (s *stack) do(t *testing.T, method, path, origin string) reply {
	t.Helper()

	var body io.Reader
	if method == http.MethodPost {
		body = strings.NewReader("abc")
	}

	request, err := http.NewRequestWithContext(t.Context(), method, s.server.URL+path, body)
	if err != nil {
		t.Fatal(err)
	}

	if origin != "" {
		request.Header.Set("Origin", origin)
	}

	response, err := s.server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}

	_, _ = io.Copy(io.Discard, response.Body)
	_ = response.Body.Close()

	return reply{Header: response.Header, StatusCode: response.StatusCode}
}

func testConfig() *config.Config {
	cfg := config.Defaults()
	cfg.Limits.RequestsPerMinute = testRequestsPerMinute

	return &cfg
}

func TestCORSOffByDefault(t *testing.T) {
	t.Parallel()

	stack := newStack(t, testConfig(), nil)

	response := stack.do(t, http.MethodGet, "/api/v1/ping", "https://speed.example")
	for _, name := range []string{
		"Access-Control-Allow-Origin", "Vary", "Access-Control-Allow-Methods",
		"Access-Control-Allow-Headers", "Access-Control-Expose-Headers", "Timing-Allow-Origin",
	} {
		if value := response.Header.Get(name); value != "" {
			t.Fatalf("%s = %q without allowed origins", name, value)
		}
	}

	// Without allowed origins there is no preflight to answer.
	if got := stack.do(
		t,
		http.MethodOptions,
		"/api/v1/download",
		"https://speed.example",
	); got.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("OPTIONS = %d, want 405", got.StatusCode)
	}
}

func TestCORSForAnAllowedOrigin(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	cfg.Server.CORS.AllowedOrigins = []config.Origin{"https://speed.example"}
	stack := newStack(t, cfg, nil)

	want := map[string]string{
		"Access-Control-Allow-Origin":   "https://speed.example",
		"Vary":                          "Origin",
		"Access-Control-Allow-Methods":  "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers":  "Content-Type",
		"Access-Control-Expose-Headers": "Server-Timing",
		"Timing-Allow-Origin":           "https://speed.example",
	}

	for _, method := range []string{http.MethodGet, http.MethodOptions} {
		response := stack.do(t, method, "/api/v1/info", "https://speed.example")

		wantStatus := http.StatusOK
		if method == http.MethodOptions {
			wantStatus = http.StatusNoContent
		}

		if response.StatusCode != wantStatus {
			t.Fatalf("%s: status %d, want %d", method, response.StatusCode, wantStatus)
		}

		for name, value := range want {
			if got := response.Header.Get(name); got != value {
				t.Fatalf("%s: %s = %q, want %q", method, name, got, value)
			}
		}
	}

	if got := stack.do(
		t,
		http.MethodGet,
		"/api/v1/info",
		"https://other.example",
	).Header.Get(
		"Access-Control-Allow-Origin",
	); got != "" {
		t.Fatalf("a foreign origin got Access-Control-Allow-Origin %q", got)
	}
}

func TestOnlyDownloadAndUploadAreLimited(t *testing.T) {
	t.Parallel()

	const origin = "https://speed.example"

	cfg := testConfig()
	cfg.Server.CORS.AllowedOrigins = []config.Origin{origin}
	stack := newStack(t, cfg, nil)

	// More than the whole burst of the routes that are never counted, preflights included.
	for range testRequestsPerMinute + 1 {
		for _, route := range []struct{ method, path string }{
			{http.MethodGet, "/api/v1/ping"},
			{http.MethodGet, "/api/v1/small"},
			{http.MethodGet, "/api/v1/info"},
			{http.MethodOptions, "/api/v1/download"},
			{http.MethodOptions, "/api/v1/upload"},
		} {
			if got := stack.do(
				t,
				route.method,
				route.path,
				origin,
			).StatusCode; got >= http.StatusBadRequest {
				t.Fatalf("%s %s = %d", route.method, route.path, got)
			}
		}
	}

	// The burst is still whole for the throughput routes.
	for index := range testRequestsPerMinute {
		path, method := "/api/v1/download?bytes=1", http.MethodGet
		if index%2 == 1 {
			path, method = "/api/v1/upload", http.MethodPost
		}

		if got := stack.do(t, method, path, origin).StatusCode; got != http.StatusOK {
			t.Fatalf("throughput request %d = %d, want 200", index+1, got)
		}
	}

	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/api/v1/download?bytes=1"},
		{http.MethodPost, "/api/v1/upload"},
	} {
		response := stack.do(t, route.method, route.path, origin)
		if response.StatusCode != http.StatusTooManyRequests ||
			response.Header.Get("Retry-After") == "" ||
			response.Header.Get("Access-Control-Allow-Origin") != origin {
			t.Fatalf("%s %s: status %d, headers %v; want 429 with Retry-After and CORS",
				route.method, route.path, response.StatusCode, response.Header)
		}
	}

	if got := stack.do(
		t,
		http.MethodGet,
		"/api/v1/ping",
		origin,
	).StatusCode; got != http.StatusNoContent {
		t.Fatalf("ping after the burst = %d", got)
	}
}

func TestRouterBasePathAndNotFound(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	cfg.Server.BasePath = "/speed"

	spa := http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(writer, "spa")
	})
	stack := newStack(t, cfg, stubSPA(spa))

	for _, test := range []struct {
		path        string
		status      int
		contentType string
	}{
		{"/speed/api/v1/ping", http.StatusNoContent, ""},
		{"/speed/api/v1/nope", http.StatusNotFound, "application/json"},
		{"/speed/nope", http.StatusNotFound, "text/plain; charset=utf-8"},
		{"/api/v1/ping", http.StatusNotFound, "text/plain; charset=utf-8"},
		{"/nope", http.StatusNotFound, "text/plain; charset=utf-8"},
		{"/speed/", http.StatusOK, "text/plain; charset=utf-8"},
		{"/speed/result/0b6f", http.StatusOK, "text/plain; charset=utf-8"},
		{"/speed/history", http.StatusOK, "text/plain; charset=utf-8"},
		{"/speed/assets/index-abc.js", http.StatusOK, "text/plain; charset=utf-8"},
	} {
		response := stack.do(t, http.MethodGet, test.path, "")
		if response.StatusCode != test.status ||
			response.Header.Get("Content-Type") != test.contentType {
			t.Fatalf(
				"%s: status %d, Content-Type %q; want %d and %q",
				test.path,
				response.StatusCode,
				response.Header.Get("Content-Type"),
				test.status,
				test.contentType,
			)
		}
	}
}

// stubSPA registers handler on every SPA route, as web.SPA.Routes registers its own handlers.
func stubSPA(handler http.Handler) func(chi.Router) {
	return func(router chi.Router) {
		for _, pattern := range spaRoutes() {
			router.Method(http.MethodGet, pattern, handler)
		}
	}
}

// TestRouterServesTheRenderedSPA mounts the real SPA handler on a scratch dist: each fixed
// route answers the rendered index.html with the SPA's security headers and no-cache.
func TestRouterServesTheRenderedSPA(t *testing.T) {
	t.Parallel()

	files := fstest.MapFS{
		"index.html": {Data: []byte(`<meta name="bitgauge-base-path" content="/" />` +
			`<script type="module" src="./assets/index-a1.js"></script>`)},
		"assets/index-a1.js": {Data: []byte("export {}")},
	}
	for name := range web.RootAssets {
		files[name] = &fstest.MapFile{Data: []byte(name)}
	}

	spa, err := web.RenderFS(files, "/speed")
	if err != nil {
		t.Fatal(err)
	}

	cfg := testConfig()
	cfg.Server.BasePath = "/speed"
	stack := newStack(t, cfg, spa.Routes)

	for _, path := range []string{"/speed/", "/speed/result/0b6f", "/speed/history", "/speed/settings", "/speed/about"} {
		response := stack.do(t, http.MethodGet, path, "")
		if response.StatusCode != http.StatusOK ||
			response.Header.Get("Cache-Control") != "no-cache" ||
			!strings.HasPrefix(
				response.Header.Get("Content-Security-Policy"),
				"default-src 'none'",
			) ||
			response.Header.Get("Cross-Origin-Embedder-Policy") != "require-corp" {
			t.Errorf("%s: %d %v", path, response.StatusCode, response.Header)
		}
	}

	asset := stack.do(t, http.MethodGet, "/speed/assets/index-a1.js", "")
	if asset.StatusCode != http.StatusOK ||
		asset.Header.Get("Cache-Control") != "public, max-age=31536000, immutable" {
		t.Errorf("asset: %d %v", asset.StatusCode, asset.Header)
	}

	for _, path := range []string{"/speed/unknown", "/unknown", "/favicon.svg"} {
		if got := stack.do(t, http.MethodGet, path, "").StatusCode; got != http.StatusNotFound {
			t.Errorf("%s: %d, want 404", path, got)
		}
	}
}

func TestRouterWithoutSPA(t *testing.T) {
	t.Parallel()

	stack := newStack(t, testConfig(), nil)

	if got := stack.do(t, http.MethodGet, "/", "").StatusCode; got != http.StatusNotFound {
		t.Fatalf("/ without the SPA = %d, want 404", got)
	}
}

func TestRouterServesOnlyTheRouteTable(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	stack := newStack(t, cfg, stubSPA(http.NotFoundHandler()))

	router, problems := NewRouter(cfg, &Groups{
		SPA:     stubSPA(http.NotFoundHandler()),
		Native:  stack.native,
		Limiter: ratelimit.New(ratelimit.Options{}, &fakeClock{}),
		Log:     slog.New(slog.DiscardHandler),
	})
	if problems != nil {
		t.Fatalf("route problems %v", problems)
	}

	table := map[string]bool{}

	for _, route := range RouteTable() {
		for _, method := range route.Methods {
			table[method+" "+route.Pattern] = true
		}
	}

	served := 0

	err := chi.Walk(
		router,
		func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
			route = strings.TrimSuffix(strings.ReplaceAll(route, "/*/", "/"), "/")
			if route == "" {
				route = "/"
			}

			if !table[method+" "+route] {
				t.Errorf("the router serves %s %s, which the route table lacks", method, route)
			}

			served++

			return nil
		},
	)
	if err != nil {
		t.Fatal(err)
	}

	// The SPA's patterns and the native API's seven method and path pairs.
	if served != len(spaRoutes())+7 {
		t.Fatalf("the router serves %d routes, want %d", served, len(spaRoutes())+7)
	}
}

func TestCheckRoutes(t *testing.T) {
	t.Parallel()

	for path, collides := range map[string]bool{
		"/metrics":                false,
		"/stats":                  false,
		"/resultx":                false,
		"/result":                 false,
		"/assets":                 false,
		"/favicon.svgx":           false,
		"/favicon.svg":            true,
		"/site.webmanifest":       true,
		"/":                       true,
		"/history":                true,
		"/result/abc":             true,
		"/assets/index.js":        true,
		"/api/v1":                 true,
		"/api/v1/info":            true,
		"/api/v1/anything":        true,
		"/upload":                 true,
		"/backend/getIP.php":      true,
		"/.well-known/nq":         true,
		"/nq/large":               true,
		"/.well-known/librespeed": true,
	} {
		cfg := config.Defaults()
		cfg.Metrics.Path = path

		problems := CheckRoutes(&cfg)
		if (len(problems) > 0) != collides {
			t.Fatalf("metrics.path %q: problems %v, want collision %v", path, problems, collides)
		}

		if collides && problems[0].Key != "metrics.path" {
			t.Fatalf("problem key %q, want metrics.path", problems[0].Key)
		}
	}
}

func TestNewRouterRunsTheCollisionCheck(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	cfg.Metrics.Path = "/upload"

	router, problems := NewRouter(cfg, &Groups{})
	if router != nil || len(problems) != 1 || problems[0].Key != "metrics.path" {
		t.Fatalf("router %v, problems %v; want no router and the metrics.path problem",
			router, problems)
	}
}
