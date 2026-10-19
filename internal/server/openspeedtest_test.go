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
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// openSpeedTestStack is the whole server with the OpenSpeedTest layer enabled under basePath.
func openSpeedTestStack(t *testing.T, basePath string) *stack {
	t.Helper()

	cfg := metricsConfig(basePath)
	cfg.Compat.OpenSpeedTest.Enabled = true

	return newStack(t, cfg, stubSPA(http.NotFoundHandler()))
}

// assertOpenSpeedTestHeaders checks the headers every response of the layer carries: the API
// set of its classifier group and the three CORS headers, without the SPA's.
func assertOpenSpeedTestHeaders(t *testing.T, label string, header http.Header) {
	t.Helper()

	for name, want := range map[string]string{
		"Cache-Control":                "no-store",
		"X-Content-Type-Options":       "nosniff",
		"Access-Control-Allow-Origin":  "*",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Content-Security-Policy":      "",
		"Content-Encoding":             "",
	} {
		if got := header.Get(name); got != want {
			t.Errorf("%s: %s = %q, want %q", label, name, got, want)
		}
	}
}

func TestOpenSpeedTestOffIsAPlain404(t *testing.T) {
	t.Parallel()

	stack := newStack(t, metricsConfig("/"), stubSPA(http.NotFoundHandler()))

	for _, request := range []struct{ method, path string }{
		{http.MethodGet, "/downloading"},
		{http.MethodHead, "/downloading"},
		{http.MethodOptions, "/downloading"},
		{http.MethodGet, "/upload"},
		{http.MethodPost, "/upload"},
		{http.MethodOptions, "/upload"},
	} {
		answer, body := stack.fetch(t, request.method, request.path)
		if answer.StatusCode != http.StatusNotFound ||
			answer.Header.Get("Content-Type") == "application/json" ||
			strings.Contains(body, `"error"`) ||
			answer.Header.Get("Access-Control-Allow-Origin") != "" ||
			answer.Header.Get("Content-Security-Policy") == "" {
			t.Errorf("%s %s: %d %v %q, want the SPA group's plain 404", request.method,
				request.path, answer.StatusCode, answer.Header, body)
		}
	}
}

func TestOpenSpeedTestRoutes(t *testing.T) {
	t.Parallel()

	stack := openSpeedTestStack(t, "/speed/")

	answer, body := stack.fetch(t, http.MethodGet, "/speed/downloading?n=0.12345")
	if answer.StatusCode != http.StatusOK || len(body) != 31457280 ||
		answer.Header.Get("Content-Length") != "31457280" ||
		answer.Header.Get("Content-Type") != "application/octet-stream" {
		t.Fatalf("GET /downloading: %d, %d bytes, %v", answer.StatusCode, len(body),
			answer.Header)
	}

	assertOpenSpeedTestHeaders(t, "GET /downloading", answer.Header)

	answer, body = stack.fetch(t, http.MethodHead, "/speed/downloading")
	if answer.StatusCode != http.StatusOK || body != "" ||
		answer.Header.Get("Content-Length") != "31457280" {
		t.Fatalf("HEAD /downloading: %d, %q, %v", answer.StatusCode, body, answer.Header)
	}

	for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodOptions} {
		for _, path := range []string{"/speed/upload?n=7", "/speed/downloading"} {
			if method != http.MethodOptions && path == "/speed/downloading" {
				continue
			}

			answer, body = stack.fetch(t, method, path)
			if answer.StatusCode != http.StatusOK || body != "" ||
				answer.Header.Get("Content-Length") != "0" ||
				answer.Header.Get("Content-Type") != "" {
				t.Fatalf("%s %s: %d, %q, %v; want an empty 200", method, path,
					answer.StatusCode, body, answer.Header)
			}

			assertOpenSpeedTestHeaders(t, method+" "+path, answer.Header)
		}
	}

	posted := stack.do(t, http.MethodPost, "/speed/upload?n=1", "")
	if posted.StatusCode != http.StatusOK || posted.Header.Get("Content-Length") != "0" {
		t.Fatalf("POST /upload: %d, %v", posted.StatusCode, posted.Header)
	}

	assertOpenSpeedTestHeaders(t, "POST /upload", posted.Header)
}

func TestOpenSpeedTestUnlistedMethodIs405(t *testing.T) {
	t.Parallel()

	stack := openSpeedTestStack(t, "/")

	for path, allow := range map[string]string{
		"/downloading": "GET, HEAD, OPTIONS",
		"/upload":      "GET, HEAD, POST, OPTIONS",
	} {
		for _, method := range []string{http.MethodPut, http.MethodDelete, http.MethodPatch} {
			answer, body := stack.fetch(t, method, path)

			var envelope struct {
				Error struct {
					Code string `json:"code"`
				} `json:"error"`
			}

			err := json.Unmarshal([]byte(body), &envelope)
			if err != nil || answer.StatusCode != http.StatusMethodNotAllowed ||
				answer.Header.Get("Allow") != allow ||
				envelope.Error.Code != "method_not_allowed" {
				t.Fatalf("%s %s: %d, Allow %q, %q", method, path, answer.StatusCode,
					answer.Header.Get("Allow"), body)
			}

			assertOpenSpeedTestHeaders(t, method+" "+path, answer.Header)
		}
	}

	// Elsewhere a method a path does not serve stays chi's own 405.
	answer, body := stack.fetch(t, http.MethodPost, "/")
	if answer.StatusCode != http.StatusMethodNotAllowed || answer.Header.Get("Allow") != "GET" ||
		body != "" {
		t.Fatalf("POST /: %d, Allow %q, %q", answer.StatusCode, answer.Header.Get("Allow"), body)
	}
}

// TestOpenSpeedTestCountsAgainstTheLimits: the ping counts against the request rate like the
// throughput routes, and its 429 carries the CORS headers, which are set before the limiter.
func TestOpenSpeedTestCountsAgainstTheLimits(t *testing.T) {
	t.Parallel()

	stack := openSpeedTestStack(t, "/")

	for range testRequestsPerMinute {
		if answer, _ := stack.fetch(
			t,
			http.MethodGet,
			"/upload",
		); answer.StatusCode != http.StatusOK {
			t.Fatalf("ping within the burst: %d", answer.StatusCode)
		}
	}

	for _, path := range []string{"/upload", "/downloading"} {
		answer, body := stack.fetch(t, http.MethodGet, path)
		if answer.StatusCode != http.StatusTooManyRequests ||
			answer.Header.Get("Retry-After") == "" ||
			!strings.Contains(body, `"code":"rate_limited"`) {
			t.Fatalf("GET %s past the burst: %d, %v, %q", path, answer.StatusCode,
				answer.Header, body)
		}

		assertOpenSpeedTestHeaders(t, "429 on "+path, answer.Header)
	}

	// A preflight never reaches the limiter.
	if answer, _ := stack.fetch(
		t,
		http.MethodOptions,
		"/upload",
	); answer.StatusCode != http.StatusOK {
		t.Fatalf("preflight past the burst: %d, want 200", answer.StatusCode)
	}
}

func TestOpenSpeedTestRequestsAreLabeled(t *testing.T) {
	t.Parallel()

	stack := openSpeedTestStack(t, "/speed/")
	stack.fetch(t, http.MethodHead, "/speed/downloading")
	stack.fetch(t, http.MethodGet, "/speed/upload")
	stack.fetch(t, http.MethodPut, "/speed/upload")

	_, body := stack.fetch(t, http.MethodGet, "/speed/metrics")

	for _, labels := range []string{
		`code="200",group="openspeedtest",route="/downloading"}`,
		`code="200",group="openspeedtest",route="/upload"}`,
		`code="405",group="openspeedtest",route="unmatched"}`,
	} {
		if !containsRequestSeries(body, labels) {
			t.Errorf("no request counter with %s", labels)
		}
	}
}
