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

package nq

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/ratelimit"
)

// entry is the handler entry the injected clock reports.
var entry = time.Date(2026, 10, 19, 8, 0, 0, 0, time.UTC)

var errClientGone = errors.New("connection reset by peer")

// testRecorder is an httptest.ResponseRecorder that takes read and write deadlines, as the
// server's writer does, and remembers the last read deadline.
type testRecorder struct {
	*httptest.ResponseRecorder

	readDeadline time.Time
	// writeLimit makes body writes fail once that many bytes were written, as a client that
	// closes the flow early does; 0 never fails.
	writeLimit int
}

func newRecorder() *testRecorder {
	return &testRecorder{ResponseRecorder: httptest.NewRecorder()}
}

func (r *testRecorder) SetReadDeadline(deadline time.Time) error {
	r.readDeadline = deadline

	return nil
}

func (*testRecorder) SetWriteDeadline(time.Time) error {
	return nil
}

func (r *testRecorder) Write(data []byte) (int, error) {
	if r.writeLimit > 0 && r.Body.Len()+len(data) > r.writeLimit {
		return 0, errClientGone
	}

	written, _ := r.Body.Write(data)

	return written, nil
}

// countingBody counts the bytes read from its strings.Reader, and fails with err instead of
// io.EOF at its end when err is set.
type countingBody struct {
	reader io.Reader
	err    error
	read   int
}

func (b *countingBody) Read(buffer []byte) (int, error) {
	read, err := b.reader.Read(buffer)
	b.read += read

	// A strings.Reader fails only at its end.
	if err == nil {
		return read, nil
	}

	if b.err != nil {
		return read, b.err
	}

	return read, io.EOF
}

func testConfig() *config.Config {
	cfg := config.Defaults()
	cfg.Compat.NetworkQuality.Enabled = true
	cfg.Compat.NetworkQuality.MaxUploadBytes = 1 * config.MiB
	cfg.Server.PublicURL = "https://speed.example.lan"

	return &cfg
}

// layer is the layer's router for cfg, with the injected clock and flow limit.
func layer(cfg *config.Config, flowLimit func(http.Handler) http.Handler) *chi.Mux {
	return Routes(&Deps{
		Config:    cfg,
		Buffer:    handlers.NewBuffer(),
		FlowLimit: flowLimit,
		Now:       func() time.Time { return entry },
	})
}

// request is a request from 10.0.0.7; contentLength -1 is a body without a length.
type request struct {
	body          io.Reader
	headers       map[string]string
	method        string
	target        string
	contentLength int64
	peerTrusted   bool
}

func serve(t *testing.T, handler http.Handler, req *request, recorder *testRecorder) {
	t.Helper()

	body := req.body
	if body == nil {
		body = http.NoBody
	}

	built := httptest.NewRequestWithContext(t.Context(), req.method, req.target, body)
	built.ContentLength = req.contentLength
	built.Host = "speed.lan:8080"

	for name, value := range req.headers {
		built.Header.Set(name, value)
	}

	built = built.WithContext(clientip.WithClient(built.Context(),
		netip.MustParseAddr("10.0.0.7"), req.peerTrusted))

	handler.ServeHTTP(recorder, built)
}

func do(t *testing.T, handler http.Handler, req *request) *testRecorder {
	t.Helper()

	recorder := newRecorder()
	serve(t, handler, req, recorder)

	return recorder
}

func assertCode(t *testing.T, label string, recorder *testRecorder, status int, code string) {
	t.Helper()

	var envelope struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}

	err := json.Unmarshal(recorder.Body.Bytes(), &envelope)
	if err != nil || recorder.Code != status || envelope.Error.Code != code ||
		recorder.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("%s: %d %q, want %d %s", label, recorder.Code, recorder.Body.String(), status,
			code)
	}
}

// assertNoCORS fails on any CORS header: the layer's clients are native tools.
func assertNoCORS(t *testing.T, label string, header http.Header) {
	t.Helper()

	for name := range header {
		if strings.HasPrefix(name, "Access-Control-") || name == "Vary" {
			t.Fatalf("%s: CORS header %s", label, name)
		}
	}
}

func TestConfigServesBothKeySets(t *testing.T) {
	t.Parallel()

	forwarded := map[string]string{
		"X-Forwarded-Proto": "https, http",
		"X-Forwarded-Host":  "nq.example.lan",
	}

	for _, test := range []struct {
		headers     map[string]string
		publicURL   config.Origin
		basePath    string
		origin      string
		peerTrusted bool
	}{
		{nil, "https://speed.example.lan", "/", "https://speed.example.lan", false},
		{
			forwarded, "https://speed.example.lan/", "/speed/", "https://speed.example.lan/speed",
			true,
		},
		{forwarded, "", "/", "https://nq.example.lan", true},
		{
			map[string]string{"X-Forwarded-Proto": "https"},
			"", "/speed", "https://speed.lan:8080/speed",
			true,
		},
	} {
		cfg := testConfig()
		cfg.Server.PublicURL = test.publicURL
		cfg.Server.BasePath = test.basePath

		for _, path := range []string{ConfigPath, WellKnownPath} {
			recorder := do(t, layer(cfg, nil), &request{
				method: http.MethodGet, target: path,
				headers: test.headers, peerTrusted: test.peerTrusted,
			})

			var body struct {
				URLs    map[string]string `json:"urls"`
				Version int               `json:"version"`
			}

			err := json.Unmarshal(recorder.Body.Bytes(), &body)
			if err != nil || recorder.Code != http.StatusOK || body.Version != 1 ||
				recorder.Header().Get("Content-Type") != "application/json" ||
				recorder.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("%s %+v: %d %q", path, test, recorder.Code, recorder.Body.String())
			}

			assertNoCORS(t, path, recorder.Header())

			want := map[string]string{
				"small_https_download_url": test.origin + "/nq/small",
				"large_https_download_url": test.origin + "/nq/large",
				"https_upload_url":         test.origin + "/nq/upload",
				"small_download_url":       test.origin + "/nq/small",
				"large_download_url":       test.origin + "/nq/large",
				"upload_url":               test.origin + "/nq/upload",
			}
			if len(body.URLs) != len(want) {
				t.Fatalf("%s %+v: urls %v, want %v", path, test, body.URLs, want)
			}

			for key, value := range want {
				if body.URLs[key] != value {
					t.Fatalf("%s %+v: %s = %q, want %q", path, test, key, body.URLs[key], value)
				}
			}
		}
	}
}

// TestConfigWithoutAnHTTPSOriginIs503: no https public_url, an untrusted peer's forwarding
// headers, or a trusted proxy forwarding http or no scheme leave no https origin to build.
func TestConfigWithoutAnHTTPSOriginIs503(t *testing.T) {
	t.Parallel()

	https := map[string]string{"X-Forwarded-Proto": "https", "X-Forwarded-Host": "nq.example.lan"}

	for _, test := range []struct {
		headers     map[string]string
		publicURL   config.Origin
		peerTrusted bool
	}{
		{nil, "http://speed.lan", false},
		{https, "http://speed.lan", true},
		{nil, "", false},
		{https, "", false},
		{nil, "", true},
		{map[string]string{"X-Forwarded-Proto": "http"}, "", true},
		{map[string]string{"X-Forwarded-Proto": "ftp"}, "", true},
	} {
		cfg := testConfig()
		cfg.Server.PublicURL = test.publicURL

		for _, path := range []string{ConfigPath, WellKnownPath} {
			recorder := do(t, layer(cfg, nil), &request{
				method: http.MethodGet, target: path,
				headers: test.headers, peerTrusted: test.peerTrusted,
			})
			assertCode(t, path, recorder, http.StatusServiceUnavailable, "public_url_required")

			if !strings.Contains(recorder.Body.String(), "server.public_url") ||
				strings.Contains(recorder.Body.String(), "nq.example.lan") {
				t.Fatalf("%s %+v: %q", path, test, recorder.Body.String())
			}
		}
	}
}

func TestSmallIsTheNativeObject(t *testing.T) {
	t.Parallel()

	recorder := do(t, layer(testConfig(), nil), &request{
		method: http.MethodGet,
		target: SmallPath,
	})
	native := newRecorder()
	handlers.Small(native, httptest.NewRequestWithContext(t.Context(), http.MethodGet,
		"/api/v1/small", nil))

	if recorder.Code != http.StatusOK || recorder.Body.String() != native.Body.String() ||
		recorder.Header().Get("Content-Length") != "1" ||
		recorder.Header().Get("Content-Type") != native.Header().Get("Content-Type") {
		t.Fatalf("/nq/small: %d %q %v, want the native object", recorder.Code,
			recorder.Body.String(), recorder.Header())
	}
}

func TestLargeDeclares8GiBAndEndsOnClose(t *testing.T) {
	t.Parallel()

	recorder := newRecorder()
	recorder.writeLimit = 3 << 20

	serve(t, layer(testConfig(), nil), &request{method: http.MethodGet, target: LargePath},
		recorder)

	header := recorder.Header()
	if recorder.Code != http.StatusOK || header.Get("Content-Length") != "8589934592" ||
		header.Get("Content-Type") != "application/octet-stream" ||
		header.Get("Cache-Control") != "no-store" || header.Get("Content-Encoding") != "" ||
		recorder.Body.Len() == 0 || recorder.Body.Len() > 3<<20 {
		t.Fatalf("/nq/large: %d, %d bytes, %v", recorder.Code, recorder.Body.Len(), header)
	}

	assertNoCORS(t, LargePath, header)
}

func TestUploadDrainsUpToItsOwnCap(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	// limits.max_upload_bytes is not the cap of /nq/upload.
	cfg.Limits.MaxUploadBytes = 64 * config.KiB
	router := layer(cfg, nil)

	for _, test := range []struct {
		name          string
		size          int
		contentLength int64
	}{
		{"a declared length", 512 << 10, 512 << 10},
		{"exactly the cap", 1 << 20, 1 << 20},
		{"streamed, under the cap", 700 << 10, -1},
		{"empty", 0, 0},
	} {
		body := &countingBody{reader: strings.NewReader(strings.Repeat("x", test.size))}

		recorder := do(t, router, &request{
			method: http.MethodPost, target: UploadPath,
			body: body, contentLength: test.contentLength,
		})
		if recorder.Code != http.StatusOK || body.read != test.size ||
			recorder.Body.Len() != 0 || recorder.Header().Get("Content-Length") != "0" ||
			recorder.Header().Get("Content-Type") != "" ||
			recorder.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("%s: %d, read %d of %d, %v", test.name, recorder.Code, body.read,
				test.size, recorder.Header())
		}
	}
}

func TestUploadOverTheCap(t *testing.T) {
	t.Parallel()

	router := layer(testConfig(), nil)

	// Declared over the cap: 413 without reading.
	body := &countingBody{reader: strings.NewReader("x")}

	recorder := do(t, router, &request{
		method: http.MethodPost, target: UploadPath, body: body,
		contentLength: 1<<20 + 1,
	})
	assertCode(t, "declared over the cap", recorder, http.StatusRequestEntityTooLarge,
		"payload_too_large")

	if body.read != 0 || recorder.Header().Get("Connection") != "close" {
		t.Fatalf("declared over the cap: read %d bytes, Connection %q", body.read,
			recorder.Header().Get("Connection"))
	}

	// Streamed, or lying about its length: read to the cap, then 413 and close.
	for name, contentLength := range map[string]int64{"streamed": -1, "lying": 10} {
		body = &countingBody{reader: strings.NewReader(strings.Repeat("x", 2<<20))}

		recorder = do(t, router, &request{
			method: http.MethodPost, target: UploadPath,
			body: body, contentLength: contentLength,
		})
		assertCode(t, name, recorder, http.StatusRequestEntityTooLarge, "payload_too_large")

		if body.read < 1<<20 || body.read > 1<<20+64<<10 ||
			recorder.Header().Get("Connection") != "close" {
			t.Fatalf("%s: read %d bytes, Connection %q", name, body.read,
				recorder.Header().Get("Connection"))
		}
	}

	// The lifetime.
	body = &countingBody{reader: strings.NewReader("abc"), err: os.ErrDeadlineExceeded}

	recorder = do(t, router, &request{
		method: http.MethodPost, target: UploadPath, body: body,
		contentLength: 1000,
	})
	assertCode(t, "lifetime", recorder, http.StatusRequestTimeout, "request_timeout")

	if !recorder.readDeadline.Equal(entry.Add(120 * time.Second)) {
		t.Fatalf("read deadline %v, want 120 s after entry", recorder.readDeadline)
	}
}

func TestUnlistedMethodIs405(t *testing.T) {
	t.Parallel()

	router := layer(testConfig(), nil)

	for _, test := range []struct{ method, path, allow string }{
		{http.MethodOptions, ConfigPath, "GET"},
		{http.MethodOptions, WellKnownPath, "GET"},
		{http.MethodOptions, SmallPath, "GET"},
		{http.MethodOptions, LargePath, "GET"},
		{http.MethodOptions, UploadPath, "POST"},
		{http.MethodPost, ConfigPath, "GET"},
		{http.MethodPost, LargePath, "GET"},
		{http.MethodGet, UploadPath, "POST"},
		{http.MethodPut, UploadPath, "POST"},
	} {
		recorder := do(t, router, &request{
			method: test.method, target: test.path,
			headers: map[string]string{
				"Origin":                        "https://ui.example.lan",
				"Access-Control-Request-Method": "GET",
			},
		})
		label := test.method + " " + test.path

		assertCode(t, label, recorder, http.StatusMethodNotAllowed, "method_not_allowed")
		assertNoCORS(t, label, recorder.Header())

		if got := recorder.Header().Get("Allow"); got != test.allow {
			t.Fatalf("%s: Allow %q, want %q", label, got, test.allow)
		}
	}

	if recorder := do(
		t,
		router,
		&request{method: http.MethodHead, target: SmallPath},
	); recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("HEAD /nq/small: %d, want 405", recorder.Code)
	}
}

// TestFlowsCountAgainstTheFlowLimitOnly: /nq/large and /nq/upload take a flow slot, not a
// stream slot, and a refusal is 429 with Retry-After; the config and /nq/small are never
// limited.
func TestFlowsCountAgainstTheFlowLimitOnly(t *testing.T) {
	t.Parallel()

	limiter := ratelimit.New(ratelimit.Options{
		MaxStreams: 1, RequestsPerMinute: 1200, TrackedClients: 16, MaxFlows: 1,
	}, ratelimit.RealClock{})
	flowLimit := ratelimit.FlowMiddleware(limiter, handlers.ErrorWriter{},
		slog.New(slog.DiscardHandler), nil)
	router := layer(testConfig(), flowLimit)
	client := netip.MustParseAddr("10.0.0.7")

	// Every stream slot is taken: the flows do not use them.
	releaseStream, err := limiter.AcquireStream(client)
	if err != nil {
		t.Fatal(err)
	}
	defer releaseStream()

	recorder := do(t, router, &request{
		method: http.MethodPost, target: UploadPath,
		body: strings.NewReader("abc"), contentLength: 3,
	})
	if recorder.Code != http.StatusOK {
		t.Fatalf("an upload flow with the streams taken: %d, want 200", recorder.Code)
	}

	releaseFlow, err := limiter.AcquireFlow(client)
	if err != nil {
		t.Fatal(err)
	}
	defer releaseFlow()

	for _, test := range []struct{ method, path string }{
		{http.MethodGet, LargePath},
		{http.MethodPost, UploadPath},
	} {
		recorder = do(t, router, &request{
			method: test.method, target: test.path,
			body: strings.NewReader("abc"), contentLength: 3,
		})
		assertCode(t, test.path, recorder, http.StatusTooManyRequests, "too_many_streams")

		if recorder.Header().Get("Retry-After") != "1" {
			t.Fatalf("%s: Retry-After %q", test.path, recorder.Header().Get("Retry-After"))
		}

		assertNoCORS(t, test.path, recorder.Header())
	}

	for _, path := range []string{ConfigPath, WellKnownPath, SmallPath} {
		if recorder = do(
			t,
			router,
			&request{method: http.MethodGet, target: path},
		); recorder.Code != http.StatusOK {
			t.Fatalf("%s at the limits: %d, want 200", path, recorder.Code)
		}
	}
}

// TestRouterHoldsExactlyTheRouteTableRows: the router serves the methods of compatibility.md
// section 5 at the layer's exact paths and nothing else, and its Allow values name the same.
func TestRouterHoldsExactlyTheRouteTableRows(t *testing.T) {
	t.Parallel()

	want := map[string]bool{
		"GET /nq/config": true, "GET /.well-known/nq": true, "GET /nq/small": true,
		"GET /nq/large": true, "POST /nq/upload": true,
	}
	served := map[string]bool{}

	err := chi.Walk(layer(testConfig(), nil),
		func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
			served[method+" "+route] = true

			return nil
		})
	if err != nil {
		t.Fatal(err)
	}

	if len(served) != len(want) {
		t.Fatalf("the router serves %v, want %v", served, want)
	}

	for pair := range want {
		method, path, _ := strings.Cut(pair, " ")
		if !served[pair] || allow[path] != method {
			t.Fatalf("%s: served %v, Allow %q", pair, served[pair], allow[path])
		}
	}
}
