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

package librespeed

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"strconv"
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

// goneRecorder fails every body write, as a client gone away does, so a large body is never
// produced; its headers are recorded.
type goneRecorder struct {
	*testRecorder
}

func (goneRecorder) Write([]byte) (int, error) {
	return 0, errClientGone
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
	cfg.Compat.LibreSpeed.Enabled = true
	cfg.Limits.MaxDownloadBytes = 8 * config.MiB
	cfg.Limits.MaxUploadBytes = 1 * config.MiB
	cfg.Server.DisplayName = "BitGauge home"
	cfg.Server.CORS.AllowedOrigins = []config.Origin{"https://ui.example.lan"}

	return &cfg
}

// layer is the layer's router for cfg, with the injected clock and limit.
func layer(cfg *config.Config, limit func(http.Handler) http.Handler) *chi.Mux {
	return Routes(&Deps{
		Config: cfg,
		Buffer: handlers.NewBuffer(),
		Limit:  limit,
		Now:    func() time.Time { return entry },
	})
}

// request is a request from client, with the address the clientip middleware would have
// recorded; contentLength -1 is a body without a length.
type request struct {
	body          io.Reader
	headers       map[string]string
	method        string
	target        string
	client        string
	contentLength int64
	protoMajor    int
	peerTrusted   bool
}

func serve(t *testing.T, handler http.Handler, req *request) *testRecorder {
	t.Helper()

	recorder := newRecorder()
	serveTo(t, handler, req, recorder)

	return recorder
}

// serveTo serves req to handler, answering into writer.
func serveTo(t *testing.T, handler http.Handler, req *request, writer http.ResponseWriter) {
	t.Helper()

	body := req.body
	if body == nil {
		body = http.NoBody
	}

	built := httptest.NewRequestWithContext(t.Context(), req.method, req.target, body)
	built.ContentLength = req.contentLength
	built.Host = "speed.lan:8080"

	if req.protoMajor == 2 {
		built.ProtoMajor, built.ProtoMinor = 2, 0
	}

	for name, value := range req.headers {
		built.Header.Set(name, value)
	}

	client := req.client
	if client == "" {
		client = "10.0.0.7"
	}

	built = built.WithContext(clientip.WithClient(built.Context(), netip.MustParseAddr(client),
		req.peerTrusted))

	handler.ServeHTTP(writer, built)
}

func get(t *testing.T, handler http.Handler, target string) *testRecorder {
	t.Helper()

	return serve(t, handler, &request{method: http.MethodGet, target: target})
}

func assertCode(t *testing.T, label string, recorder *testRecorder, status int, code string) {
	t.Helper()

	var envelope struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}

	err := json.Unmarshal(recorder.Body.Bytes(), &envelope)
	if err != nil || recorder.Code != status || envelope.Error.Code != code ||
		recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("%s: %d %q, want %d %s", label, recorder.Code, recorder.Body.String(), status,
			code)
	}
}

// corsOf is the four CORS headers a response carries, empty when absent.
func corsOf(header http.Header) [4]string {
	return [4]string{
		header.Get("Access-Control-Allow-Origin"),
		header.Get("Access-Control-Allow-Methods"),
		header.Get("Access-Control-Allow-Headers"),
		header.Get("Vary"),
	}
}

var (
	anyOrigin = [4]string{"*", "GET, POST", "Content-Encoding, Content-Type", ""}
	noCORS    = [4]string{}
)

func spellingsOf(name string) []string {
	return []string{
		"/" + name,
		"/backend/" + name,
		"/" + name + ".php",
		"/backend/" + name + ".php",
	}
}

func TestEveryRouteAnswersInFourSpellings(t *testing.T) {
	t.Parallel()

	router := layer(testConfig(), nil)

	for _, name := range []string{"garbage", "empty", "getIP"} {
		for _, path := range spellingsOf(name) {
			if recorder := get(t, router, path); recorder.Code != http.StatusOK {
				t.Fatalf("GET %s: %d", path, recorder.Code)
			}
		}
	}

	for _, path := range spellingsOf("empty") {
		recorder := serve(t, router, &request{
			method: http.MethodPost, target: path,
			body: strings.NewReader("abc"), contentLength: 3,
		})
		if recorder.Code != http.StatusOK {
			t.Fatalf("POST %s: %d", path, recorder.Code)
		}
	}
}

func TestGarbageChunks(t *testing.T) {
	t.Parallel()

	router := layer(testConfig(), nil)

	for target, chunks := range map[string]int{
		"/garbage":                          4,
		"/garbage?ckSize=1":                 1,
		"/garbage?ckSize=007":               7,
		"/garbage?ckSize=8":                 8,
		"/garbage?ckSize=9":                 8,
		"/garbage?ckSize=1024":              8,
		"/garbage?ckSize=99999999999999999": 8,
		"/garbage?ckSize=2&ckSize=abc":      2,
		"/garbage?ckSize=3&cors=true":       3,
	} {
		recorder := get(t, router, target)

		header := recorder.Header()
		if recorder.Code != http.StatusOK || recorder.Body.Len() != chunks<<20 ||
			header.Get("Content-Length") != strconv.Itoa(chunks<<20) ||
			header.Get("Content-Type") != "application/octet-stream" ||
			header.Get("Cache-Control") != "no-store" || header.Get("Content-Encoding") != "" {
			t.Fatalf("GET %s: %d, %d bytes, %v; want %d chunks", target, recorder.Code,
				recorder.Body.Len(), header, chunks)
		}
	}
}

func TestGarbageRefusesAnInvalidCkSize(t *testing.T) {
	t.Parallel()

	router := layer(testConfig(), nil)

	for _, value := range []string{"0", "00", "-1", "1.5", "abc", "", "+3", "%203", "3x", "1e3"} {
		assertCode(t, "ckSize="+value, get(t, router, "/garbage?ckSize="+value),
			http.StatusBadRequest, "bad_request")
	}
}

// TestGarbageCapFollowsTheDownloadLimit: the clamp is min(1024, floor(max_download_bytes /
// 1 MiB)); the body is never produced, only its declared length read.
func TestGarbageCapFollowsTheDownloadLimit(t *testing.T) {
	t.Parallel()

	for download, chunks := range map[config.Size]int{
		config.MiB:              1,
		config.MiB + config.KiB: 1,
		256 * config.MiB:        256,
		4 * config.GiB:          1024,
	} {
		cfg := testConfig()
		cfg.Limits.MaxDownloadBytes = download

		recorder := newRecorder()
		serveTo(t, layer(cfg, nil), &request{
			method: http.MethodGet,
			target: "/garbage?ckSize=5000",
		}, goneRecorder{recorder})

		if got := recorder.Header().Get("Content-Length"); got != strconv.Itoa(chunks<<20) {
			t.Fatalf("max_download_bytes %d: Content-Length %s, want %d chunks", download, got,
				chunks)
		}
	}
}

func TestEmptyDrainsAndKeepsTheConnection(t *testing.T) {
	t.Parallel()

	router := layer(testConfig(), nil)

	for _, test := range []struct {
		name          string
		method        string
		size          int
		contentLength int64
		protoMajor    int
		keepAlive     string
	}{
		{"a GET ping", http.MethodGet, 0, 0, 1, "keep-alive"},
		{"a POST upload", http.MethodPost, 64 << 10, 64 << 10, 1, "keep-alive"},
		{"exactly the cap", http.MethodPost, 1 << 20, 1 << 20, 1, "keep-alive"},
		{"without a length, under the cap", http.MethodPost, 5000, -1, 1, "keep-alive"},
		{"over HTTP/2", http.MethodPost, 10, 10, 2, ""},
	} {
		body := &countingBody{reader: strings.NewReader(strings.Repeat("x", test.size))}

		recorder := serve(t, router, &request{
			method: test.method, target: "/empty?r=0.4",
			body: body, contentLength: test.contentLength, protoMajor: test.protoMajor,
		})
		if recorder.Code != http.StatusOK || body.read != test.size ||
			recorder.Body.Len() != 0 || recorder.Header().Get("Content-Length") != "0" ||
			recorder.Header().Get("Content-Type") != "" ||
			recorder.Header().Get("Cache-Control") != "no-store" ||
			recorder.Header().Get("Connection") != test.keepAlive {
			t.Fatalf("%s: %d, read %d of %d, %v", test.name, recorder.Code, body.read,
				test.size, recorder.Header())
		}
	}
}

func TestEmptyCapAndLifetime(t *testing.T) {
	t.Parallel()

	router := layer(testConfig(), nil)

	for _, test := range []struct {
		name          string
		size          int
		contentLength int64
	}{
		{"without a length, past the cap", 1<<20 + 1, -1},
		{"a lying length", 1<<20 + 1, 10},
	} {
		body := &countingBody{reader: strings.NewReader(strings.Repeat("x", test.size))}

		recorder := serve(t, router, &request{
			method: http.MethodPost, target: "/empty",
			body: body, contentLength: test.contentLength,
		})
		assertCode(t, test.name, recorder, http.StatusRequestEntityTooLarge, "payload_too_large")

		if body.read > 1<<20+64<<10 || recorder.Header().Get("Connection") != "close" {
			t.Fatalf("%s: read %d bytes, Connection %q", test.name, body.read,
				recorder.Header().Get("Connection"))
		}
	}

	body := &countingBody{reader: strings.NewReader("x")}

	recorder := serve(t, router, &request{
		method: http.MethodPost, target: "/empty", body: body,
		contentLength: 1<<20 + 1,
	})
	assertCode(t, "declared over the cap", recorder, http.StatusRequestEntityTooLarge,
		"payload_too_large")

	if body.read != 0 {
		t.Fatalf("read %d bytes of a refused body", body.read)
	}

	body = &countingBody{reader: strings.NewReader("abc"), err: os.ErrDeadlineExceeded}

	recorder = serve(t, router, &request{
		method: http.MethodPost, target: "/empty", body: body,
		contentLength: 1000,
	})
	assertCode(t, "lifetime", recorder, http.StatusRequestTimeout, "request_timeout")

	if !recorder.readDeadline.Equal(entry.Add(120 * time.Second)) {
		t.Fatalf("read deadline %v, want 120 s after entry", recorder.readDeadline)
	}
}

func TestGetIPClassifiesTheAddress(t *testing.T) {
	t.Parallel()

	router := layer(testConfig(), nil)

	for client, want := range map[string]string{
		"::1":                 "::1 - localhost IPv6 access",
		"fe80::1":             "fe80::1 - link-local IPv6 access",
		"fd00::5":             "fd00::5 - ULA IPv6 access",
		"fd7a:115c:a1e0::17":  "fd7a:115c:a1e0::17 - ULA IPv6 access",
		"127.0.0.1":           "127.0.0.1 - localhost IPv4 access",
		"10.8.0.2":            "10.8.0.2 - private IPv4 access",
		"172.16.0.9":          "172.16.0.9 - private IPv4 access",
		"192.168.1.42":        "192.168.1.42 - private IPv4 access",
		"169.254.10.1":        "169.254.10.1 - link-local IPv4 access",
		"100.64.0.1":          "100.64.0.1 - CGNAT IPv4 access",
		"::ffff:192.168.1.42": "192.168.1.42 - private IPv4 access",
		"203.0.113.9":         "203.0.113.9",
		"2001:db8::9":         "2001:db8::9",
	} {
		for _, target := range []string{"/getIP", "/backend/getIP.php?isp=true&distance=km"} {
			recorder := serve(t, router,
				&request{method: http.MethodGet, target: target, client: client})

			var body map[string]any

			err := json.Unmarshal(recorder.Body.Bytes(), &body)
			if err != nil || recorder.Code != http.StatusOK || len(body) != 2 ||
				body["processedString"] != want ||
				recorder.Header().Get("Content-Type") != "application/json" ||
				recorder.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("%s from %s: %d %q, want %q", target, client, recorder.Code,
					recorder.Body.String(), want)
			}

			if isp, isObject := body["rawIspInfo"].(map[string]any); !isObject || len(isp) != 0 {
				t.Fatalf("%s from %s: rawIspInfo %v, want {}", target, client, body["rawIspInfo"])
			}
		}
	}
}

func TestGetIPWithoutTheMiddlewareIs500(t *testing.T) {
	t.Parallel()

	recorder := newRecorder()
	GetIP(recorder, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/getIP", nil))
	assertCode(t, "no derived address", recorder, http.StatusInternalServerError, "internal")
}

func TestCORSOnlyWithCorsTrue(t *testing.T) {
	t.Parallel()

	router := layer(testConfig(), nil)
	listed := map[string]string{"Origin": "https://ui.example.lan"}
	unlisted := map[string]string{"Origin": "https://evil.example"}
	echoed := [4]string{
		"https://ui.example.lan", "GET, POST", "Content-Encoding, Content-Type",
		"Origin",
	}

	for _, test := range []struct {
		headers map[string]string
		method  string
		target  string
		want    [4]string
	}{
		{unlisted, http.MethodGet, "/garbage?cors=true", anyOrigin},
		{nil, http.MethodGet, "/backend/empty.php?cors=true", anyOrigin},
		{nil, http.MethodPost, "/empty?cors=true", anyOrigin},
		{nil, http.MethodGet, "/garbage", noCORS},
		{nil, http.MethodGet, "/garbage?cors=1", noCORS},
		{nil, http.MethodGet, "/empty?cors=TRUE", noCORS},
		{nil, http.MethodGet, "/empty?cors=", noCORS},
		// A preflight cannot carry the query reliably, so it is always answered.
		{nil, http.MethodOptions, "/garbage", anyOrigin},
		{unlisted, http.MethodOptions, "/backend/empty", anyOrigin},
		// /getIP is never *: only a listed origin, echoed, with Vary.
		{listed, http.MethodGet, "/getIP?cors=true", echoed},
		{listed, http.MethodGet, "/getIP", noCORS},
		{listed, http.MethodGet, "/getIP?cors=1", noCORS},
		{unlisted, http.MethodGet, "/getIP?cors=true", noCORS},
		{nil, http.MethodGet, "/getIP?cors=true", noCORS},
		{listed, http.MethodOptions, "/getIP.php", echoed},
		{unlisted, http.MethodOptions, "/getIP", noCORS},
		// The server list sends none.
		{listed, http.MethodGet, "/.well-known/librespeed?cors=true", noCORS},
	} {
		recorder := serve(t, router,
			&request{method: test.method, target: test.target, headers: test.headers})
		label := test.method + " " + test.target

		if recorder.Code != http.StatusOK {
			t.Fatalf("%s: %d, want 200", label, recorder.Code)
		}

		if got := corsOf(recorder.Header()); got != test.want {
			t.Fatalf("%s with %v: CORS %q, want %q", label, test.headers, got, test.want)
		}

		if test.method == http.MethodOptions && (recorder.Body.Len() != 0 ||
			recorder.Header().Get("Content-Length") != "0") {
			t.Fatalf("%s: a preflight with a body", label)
		}
	}
}

func TestUnlistedMethodIs405(t *testing.T) {
	t.Parallel()

	router := layer(testConfig(), nil)

	for _, test := range []struct{ method, path, allow string }{
		{http.MethodHead, "/garbage", "GET, OPTIONS"},
		{http.MethodPost, "/backend/garbage.php", "GET, OPTIONS"},
		{http.MethodPut, "/empty.php", "GET, POST, OPTIONS"},
		{http.MethodHead, "/backend/empty", "GET, POST, OPTIONS"},
		{http.MethodPost, "/getIP", "GET, OPTIONS"},
		{http.MethodOptions, "/.well-known/librespeed", "GET"},
		{http.MethodPost, "/.well-known/librespeed", "GET"},
	} {
		recorder := serve(t, router, &request{method: test.method, target: test.path})
		label := test.method + " " + test.path

		if test.method == http.MethodHead {
			if recorder.Code != http.StatusMethodNotAllowed {
				t.Fatalf("%s: %d, want 405", label, recorder.Code)
			}
		} else {
			assertCode(t, label, recorder, http.StatusMethodNotAllowed, "method_not_allowed")
		}

		if got := recorder.Header().Get("Allow"); got != test.allow {
			t.Fatalf("%s: Allow %q, want %q", label, got, test.allow)
		}
	}
}

func TestServerList(t *testing.T) {
	t.Parallel()

	forwarded := map[string]string{
		"X-Forwarded-Proto": "https",
		"X-Forwarded-Host":  "speed.example.lan, internal",
	}

	for _, test := range []struct {
		headers     map[string]string
		publicURL   config.Origin
		basePath    string
		want        string
		peerTrusted bool
	}{
		{nil, "", "/", "http://speed.lan:8080/", false},
		{forwarded, "", "/", "http://speed.lan:8080/", false},
		{forwarded, "", "/speed/", "https://speed.example.lan/speed/", true},
		{map[string]string{"X-Forwarded-Host": "bad host"}, "", "/", "http://speed.lan:8080/", true},
		{forwarded, "https://speed.example.org", "/speed/", "https://speed.example.org/speed/", true},
	} {
		cfg := testConfig()
		cfg.Server.PublicURL = test.publicURL
		cfg.Server.BasePath = test.basePath

		recorder := serve(t, layer(cfg, nil), &request{
			method: http.MethodGet,
			target: WellKnownPath, headers: test.headers, peerTrusted: test.peerTrusted,
		})

		var list []map[string]any

		err := json.Unmarshal(recorder.Body.Bytes(), &list)
		if err != nil || recorder.Code != http.StatusOK || len(list) != 1 ||
			recorder.Header().Get("Content-Type") != "application/json" ||
			recorder.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("%+v: %d %q", test, recorder.Code, recorder.Body.String())
		}

		want := map[string]any{
			"id": 1.0, "name": "BitGauge home", "server": test.want, "dlURL": "garbage",
			"ulURL": "empty", "pingURL": "empty", "getIpURL": "getIP",
		}
		for key, value := range want {
			if list[0][key] != value {
				t.Fatalf("%+v: %s = %v, want %v", test, key, list[0][key], value)
			}
		}

		if len(list[0]) != len(want) {
			t.Fatalf("%+v: entry %v has other keys", test, list[0])
		}
	}
}

// TestThroughputRoutesTakeAStreamSlot: /garbage and /empty count against
// limits.max_streams_per_client, a 429 carries the CORS headers cors=true asked for, and
// /getIP, the server list and preflights are never limited.
func TestThroughputRoutesTakeAStreamSlot(t *testing.T) {
	t.Parallel()

	limiter := ratelimit.New(ratelimit.Options{
		MaxStreams: 1, RequestsPerMinute: 1200, TrackedClients: 16, MaxFlows: 1,
	}, ratelimit.RealClock{})
	limit := ratelimit.Middleware(limiter, handlers.ErrorWriter{}, slog.New(slog.DiscardHandler),
		nil)
	router := layer(testConfig(), limit)

	release, err := limiter.AcquireStream(netip.MustParseAddr("10.0.0.7"))
	if err != nil {
		t.Fatal(err)
	}
	defer release()

	for _, test := range []struct{ method, target string }{
		{http.MethodGet, "/garbage?cors=true"},
		{http.MethodGet, "/backend/empty.php?cors=true"},
		{http.MethodPost, "/empty?cors=true"},
	} {
		recorder := serve(t, router, &request{method: test.method, target: test.target})
		assertCode(t, test.target, recorder, http.StatusTooManyRequests, "too_many_streams")

		if got := corsOf(recorder.Header()); got != anyOrigin {
			t.Fatalf("%s: 429 with CORS %q", test.target, got)
		}
	}

	for _, test := range []struct{ method, target string }{
		{http.MethodGet, "/getIP"},
		{http.MethodGet, WellKnownPath},
		{http.MethodOptions, "/garbage"},
		{http.MethodOptions, "/empty"},
	} {
		recorder := serve(t, router, &request{method: test.method, target: test.target})
		if recorder.Code != http.StatusOK {
			t.Fatalf("%s %s at the limit: %d, want 200", test.method, test.target,
				recorder.Code)
		}
	}
}

// TestRouterHoldsExactlyTheRouteTableRows: the router serves the methods of compatibility.md
// section 5 at the layer's exact paths and nothing else, and its Allow values name the same.
func TestRouterHoldsExactlyTheRouteTableRows(t *testing.T) {
	t.Parallel()

	want := map[string]bool{"GET " + WellKnownPath: true}

	for name, methods := range map[string][]string{
		"garbage": {http.MethodGet, http.MethodOptions},
		"empty":   {http.MethodGet, http.MethodPost, http.MethodOptions},
		"getIP":   {http.MethodGet, http.MethodOptions},
	} {
		for _, path := range spellingsOf(name) {
			for _, method := range methods {
				want[method+" "+path] = true
			}
		}
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

	if len(served) != len(want) || len(want) != 29 {
		t.Fatalf("the router serves %d pairs, want %d of 29", len(served), len(want))
	}

	for pair := range want {
		if !served[pair] {
			t.Fatalf("the router does not serve %s", pair)
		}

		method, path, _ := strings.Cut(pair, " ")
		if !strings.Contains(allow[spellings[path]], method) {
			t.Fatalf("Allow %q of %s lacks %s", allow[spellings[path]], path, method)
		}
	}
}
