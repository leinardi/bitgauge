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

package openspeedtest

import (
	"encoding/json"
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
	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/ratelimit"
)

// entry is the handler entry the injected clock reports.
var entry = time.Date(2026, 10, 19, 8, 0, 0, 0, time.UTC)

// deadlineRecorder is an httptest.ResponseRecorder that takes read and write deadlines, as the
// server's writer does, and remembers the last read deadline.
type deadlineRecorder struct {
	*httptest.ResponseRecorder

	readDeadline time.Time
}

func newRecorder() *deadlineRecorder {
	return &deadlineRecorder{ResponseRecorder: httptest.NewRecorder()}
}

func (r *deadlineRecorder) SetReadDeadline(deadline time.Time) error {
	r.readDeadline = deadline

	return nil
}

// SetWriteDeadline accepts the deadline the random writer sets before each write.
func (*deadlineRecorder) SetWriteDeadline(time.Time) error {
	return nil
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

// routes is the layer's router with the injected clock and the given limiter.
func routes(limit func(http.Handler) http.Handler) *chi.Mux {
	return Routes(&Deps{
		Buffer: handlers.NewBuffer(),
		Limit:  limit,
		Now:    func() time.Time { return entry },
	})
}

func serve(
	t *testing.T,
	handler http.Handler,
	method, target string,
	body io.Reader,
	contentLength int64,
) *deadlineRecorder {
	t.Helper()

	request := httptest.NewRequestWithContext(t.Context(), method, target, body)
	request.ContentLength = contentLength
	request = request.WithContext(
		clientip.WithAddr(request.Context(), netip.MustParseAddr("10.0.0.7")))

	recorder := newRecorder()
	handler.ServeHTTP(recorder, request)

	return recorder
}

func assertCORS(t *testing.T, label string, header http.Header) {
	t.Helper()

	for name, want := range map[string]string{
		"Access-Control-Allow-Origin":  "*",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Cache-Control":                "no-store",
	} {
		if got := header.Get(name); got != want {
			t.Fatalf("%s: %s = %q, want %q", label, name, got, want)
		}
	}
}

func assertCode(t *testing.T, label string, recorder *deadlineRecorder, status int, code string) {
	t.Helper()

	var envelope struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}

	err := json.Unmarshal(recorder.Body.Bytes(), &envelope)
	if err != nil || recorder.Code != status || envelope.Error.Code != code {
		t.Fatalf("%s: %d %q, want %d %s", label, recorder.Code, recorder.Body.String(), status,
			code)
	}

	assertCORS(t, label, recorder.Header())
}

func TestDownloadIsExactly30MiB(t *testing.T) {
	t.Parallel()

	download := routes(nil)

	for _, target := range []string{"/downloading", "/downloading?n=0.5", "/downloading?n=abc"} {
		recorder := serve(t, download, http.MethodGet, target, http.NoBody, 0)
		if recorder.Code != http.StatusOK || recorder.Body.Len() != 31457280 ||
			recorder.Header().Get("Content-Length") != "31457280" ||
			recorder.Header().Get("Content-Type") != "application/octet-stream" ||
			recorder.Header().Get("Content-Encoding") != "" {
			t.Fatalf("GET %s: %d, %d bytes, %v", target, recorder.Code, recorder.Body.Len(),
				recorder.Header())
		}

		assertCORS(t, "GET "+target, recorder.Header())
	}

	recorder := serve(t, download, http.MethodHead, "/downloading", http.NoBody, 0)
	if recorder.Code != http.StatusOK || recorder.Body.Len() != 0 ||
		recorder.Header().Get("Content-Length") != "31457280" {
		t.Fatalf("HEAD: %d, %d bytes, %v", recorder.Code, recorder.Body.Len(), recorder.Header())
	}
}

func TestPingIs200NeverA204(t *testing.T) {
	t.Parallel()

	for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodOptions} {
		recorder := serve(t, routes(nil), method, "/upload?n=3", http.NoBody, 0)
		if recorder.Code != http.StatusOK || recorder.Body.Len() != 0 ||
			recorder.Header().Get("Content-Length") != "0" ||
			recorder.Header().Get("Content-Type") != "" {
			t.Fatalf("%s /upload: %d, %q, %v", method, recorder.Code, recorder.Body.String(),
				recorder.Header())
		}

		assertCORS(t, method+" /upload", recorder.Header())
	}
}

func TestUploadDrainsUpToTheCap(t *testing.T) {
	t.Parallel()

	upload := routes(nil)

	for _, test := range []struct {
		name          string
		size          int
		contentLength int64
		status        int
	}{
		{"30 MiB, as the client sends", 30 << 20, 30 << 20, http.StatusOK},
		{"exactly the cap", UploadCap, UploadCap, http.StatusOK},
		{"empty", 0, 0, http.StatusOK},
		{"without a length, under the cap", 1 << 20, -1, http.StatusOK},
		{"without a length, exactly the cap", UploadCap, -1, http.StatusOK},
		{"without a length, past the cap", UploadCap + 1, -1, http.StatusRequestEntityTooLarge},
		{"a lying length", UploadCap + 1, 10, http.StatusRequestEntityTooLarge},
	} {
		body := &countingBody{reader: strings.NewReader(strings.Repeat("x", test.size))}

		recorder := serve(t, upload, http.MethodPost, "/upload?n=1", body, test.contentLength)
		if recorder.Code != test.status {
			t.Fatalf("%s: status %d, want %d", test.name, recorder.Code, test.status)
		}

		assertCORS(t, test.name, recorder.Header())

		if test.status == http.StatusOK {
			if body.read != test.size || recorder.Body.Len() != 0 ||
				recorder.Header().Get("Content-Length") != "0" {
				t.Fatalf("%s: read %d of %d bytes, answered %q", test.name, body.read,
					test.size, recorder.Body.String())
			}

			continue
		}

		// The body stops at the cap, and the connection closes behind the answer.
		if body.read > UploadCap+64<<10 || recorder.Header().Get("Connection") != "close" {
			t.Fatalf("%s: read %d bytes, Connection %q", test.name, body.read,
				recorder.Header().Get("Connection"))
		}
	}
}

func TestUploadRefusesADeclaredLengthOverTheCapUnread(t *testing.T) {
	t.Parallel()

	body := &countingBody{reader: strings.NewReader("x")}

	recorder := serve(t, routes(nil), http.MethodPost, "/upload", body,
		UploadCap+1)
	assertCode(t, "declared over the cap", recorder, http.StatusRequestEntityTooLarge,
		"payload_too_large")

	if body.read != 0 {
		t.Fatalf("read %d bytes of a refused body", body.read)
	}
}

func TestUploadLifetimeIs408(t *testing.T) {
	t.Parallel()

	body := &countingBody{reader: strings.NewReader("abc"), err: os.ErrDeadlineExceeded}

	recorder := serve(t, routes(nil), http.MethodPost, "/upload", body, 1000)
	assertCode(t, "lifetime", recorder, http.StatusRequestTimeout, "request_timeout")

	if !recorder.readDeadline.Equal(entry.Add(120 * time.Second)) {
		t.Fatalf("read deadline %v, want 120 s after entry", recorder.readDeadline)
	}
}

func TestUnlistedMethodIs405(t *testing.T) {
	t.Parallel()

	for path, allow := range map[string]string{
		DownloadPath: "GET, HEAD, OPTIONS",
		UploadPath:   "GET, HEAD, POST, OPTIONS",
	} {
		recorder := serve(t, routes(nil), http.MethodPut, path, http.NoBody, 0)
		assertCode(t, "PUT "+path, recorder, http.StatusMethodNotAllowed, "method_not_allowed")

		if got := recorder.Header().Get("Allow"); got != allow {
			t.Fatalf("PUT %s: Allow %q, want %q", path, got, allow)
		}
	}

	recorder := serve(t, routes(nil), http.MethodPost, DownloadPath, http.NoBody, 0)
	assertCode(t, "POST /downloading", recorder, http.StatusMethodNotAllowed,
		"method_not_allowed")
}

// TestEveryRouteTakesAStreamSlot: both routes, the ping included, count against
// limits.max_streams_per_client, a 429 carries the CORS headers, and a preflight is never
// limited.
func TestEveryRouteTakesAStreamSlot(t *testing.T) {
	t.Parallel()

	limiter := ratelimit.New(ratelimit.Options{
		MaxStreams: 1, RequestsPerMinute: 1200, TrackedClients: 16, MaxFlows: 1,
	}, ratelimit.RealClock{})
	limit := ratelimit.Middleware(limiter, handlers.ErrorWriter{}, slog.New(slog.DiscardHandler),
		nil)
	layer := routes(limit)

	release, err := limiter.AcquireStream(netip.MustParseAddr("10.0.0.7"))
	if err != nil {
		t.Fatal(err)
	}

	for _, request := range []struct{ method, path string }{
		{http.MethodGet, DownloadPath},
		{http.MethodHead, DownloadPath},
		{http.MethodGet, UploadPath},
		{http.MethodHead, UploadPath},
		{http.MethodPost, UploadPath},
	} {
		recorder := serve(t, layer, request.method, request.path,
			strings.NewReader("x"), 1)
		label := request.method + " " + request.path

		if request.method == http.MethodHead {
			if recorder.Code != http.StatusTooManyRequests {
				t.Fatalf("%s: %d, want 429", label, recorder.Code)
			}

			assertCORS(t, label, recorder.Header())

			continue
		}

		assertCode(t, label, recorder, http.StatusTooManyRequests, "too_many_streams")

		if retry, _ := strconv.Atoi(recorder.Header().Get("Retry-After")); retry < 1 {
			t.Fatalf("%s: Retry-After %q", label, recorder.Header().Get("Retry-After"))
		}
	}

	if recorder := serve(t, layer, http.MethodOptions, UploadPath, http.NoBody,
		0); recorder.Code != http.StatusOK {
		t.Fatalf("preflight at the limit: %d, want 200", recorder.Code)
	}

	release()

	if recorder := serve(t, layer, http.MethodGet, UploadPath, http.NoBody,
		0); recorder.Code != http.StatusOK {
		t.Fatalf("ping after the slot was released: %d, want 200", recorder.Code)
	}
}

// TestRouterHoldsExactlyTheRouteTableRows: the router serves the methods of compatibility.md
// section 5 at the two exact paths and nothing else, and its Allow values name the same.
func TestRouterHoldsExactlyTheRouteTableRows(t *testing.T) {
	t.Parallel()

	want := map[string]bool{
		"GET /downloading": true, "HEAD /downloading": true, "OPTIONS /downloading": true,
		"GET /upload": true, "HEAD /upload": true, "POST /upload": true, "OPTIONS /upload": true,
	}
	served := map[string]bool{}

	err := chi.Walk(routes(nil),
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
		if !served[pair] {
			t.Fatalf("the router does not serve %s", pair)
		}

		method, path, _ := strings.Cut(pair, " ")
		if !strings.Contains(allow[path], method) {
			t.Fatalf("Allow %q of %s lacks %s", allow[path], path, method)
		}
	}
}
