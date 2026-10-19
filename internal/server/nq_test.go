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
	"net/netip"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/internal/config"
)

// nqConfig enables the networkQuality layer under basePath, trusting the given proxies.
func nqConfig(basePath, publicURL string, trusted ...string) *config.Config {
	cfg := metricsConfig(basePath)
	cfg.Compat.NetworkQuality.Enabled = true
	cfg.Server.PublicURL = config.Origin(publicURL)

	for _, prefix := range trusted {
		cfg.Server.TrustedProxies = append(cfg.Server.TrustedProxies, netip.MustParsePrefix(prefix))
	}

	return cfg
}

// nqStack is the whole server with the networkQuality layer enabled under basePath, trusting
// the given proxies.
func nqStack(t *testing.T, basePath, publicURL string, trusted ...string) *stack {
	t.Helper()

	return newStack(t, nqConfig(basePath, publicURL, trusted...), stubSPA(http.NotFoundHandler()))
}

// TestNQFlowsTakeTheFlowLimit: the router wraps /nq/large and /nq/upload in the flow limit,
// compat.networkquality.max_flows_per_client, counted as nq_flows; the config and /nq/small
// stay unlimited, and neither flow route takes a stream slot.
func TestNQFlowsTakeTheFlowLimit(t *testing.T) {
	t.Parallel()

	cfg := nqConfig("/", "https://speed.example.lan")
	cfg.Compat.NetworkQuality.MaxFlowsPerClient = 1
	cfg.Limits.MaxStreamsPerClient = 1
	stack := newStack(t, cfg, stubSPA(http.NotFoundHandler()))

	// One /nq/large flow held open, its body unread, while a native download holds the one
	// stream slot.
	for _, path := range []string{"/nq/large", "/api/v1/download?bytes=268435456"} {
		request, err := http.NewRequestWithContext(t.Context(), http.MethodGet,
			stack.server.URL+path, http.NoBody)
		if err != nil {
			t.Fatal(err)
		}

		response, err := stack.server.Client().Do(request)
		if err != nil || response.StatusCode != http.StatusOK {
			t.Fatalf("GET %s: %v, %v", path, response, err)
		}

		t.Cleanup(func() { _ = response.Body.Close() })
	}

	for _, request := range []struct{ method, path string }{
		{http.MethodGet, "/nq/large"},
		{http.MethodPost, "/nq/upload"},
	} {
		answer, body := stack.fetch(t, request.method, request.path)
		if answer.StatusCode != http.StatusTooManyRequests ||
			answer.Header.Get("Retry-After") != "1" ||
			!strings.Contains(body, `"code":"too_many_streams"`) {
			t.Fatalf("%s %s with the flow taken: %d %v %q", request.method, request.path,
				answer.StatusCode, answer.Header, body)
		}
	}

	for _, path := range []string{"/nq/config", "/.well-known/nq", "/nq/small"} {
		if answer, _ := stack.fetch(t, http.MethodGet, path); answer.StatusCode != http.StatusOK {
			t.Fatalf("GET %s at the limits: %d, want 200", path, answer.StatusCode)
		}
	}

	_, body := stack.fetch(t, http.MethodGet, "/metrics")
	if !strings.Contains(body, `bitgauge_rate_limited_total{limit="nq_flows"} 2`) ||
		!strings.Contains(body, `bitgauge_rate_limited_total{limit="streams"} 0`) {
		t.Fatalf("the refusals were not counted as two nq_flows:\n%s", body)
	}
}

func TestNQOffIsAPlain404(t *testing.T) {
	t.Parallel()

	stack := newStack(t, metricsConfig("/"), stubSPA(http.NotFoundHandler()))

	for _, request := range []struct{ method, path string }{
		{http.MethodGet, "/nq/config"},
		{http.MethodGet, "/.well-known/nq"},
		{http.MethodGet, "/nq/small"},
		{http.MethodGet, "/nq/large"},
		{http.MethodPost, "/nq/upload"},
	} {
		answer, body := stack.fetch(t, request.method, request.path)
		if answer.StatusCode != http.StatusNotFound || strings.Contains(body, `"error"`) ||
			answer.Header.Get("Content-Security-Policy") == "" {
			t.Errorf("%s %s: %d %q, want the SPA group's plain 404", request.method,
				request.path, answer.StatusCode, body)
		}
	}
}

func TestNQRoutes(t *testing.T) {
	t.Parallel()

	stack := nqStack(t, "/speed/", "https://speed.example.lan")

	answer, body := stack.fetch(t, http.MethodGet, "/speed/.well-known/nq")

	var settings struct {
		URLs map[string]string `json:"urls"`
	}

	err := json.Unmarshal([]byte(body), &settings)
	if err != nil || answer.StatusCode != http.StatusOK ||
		settings.URLs["https_upload_url"] != "https://speed.example.lan/speed/nq/upload" ||
		answer.Header.Get("X-Content-Type-Options") != "nosniff" ||
		answer.Header.Get("Content-Security-Policy") != "" {
		t.Fatalf("GET /.well-known/nq: %d %q %v", answer.StatusCode, body, answer.Header)
	}

	answer, body = stack.fetch(t, http.MethodGet, "/speed/nq/small")
	if answer.StatusCode != http.StatusOK || len(body) != 1 {
		t.Fatalf("GET /nq/small: %d %q", answer.StatusCode, body)
	}

	posted := stack.do(t, http.MethodPost, "/speed/nq/upload", "")
	if posted.StatusCode != http.StatusOK || posted.Header.Get("Content-Length") != "0" {
		t.Fatalf("POST /nq/upload: %d %v", posted.StatusCode, posted.Header)
	}

	// No redirect and no route below an exact path; no preflight.
	for _, request := range []struct {
		method, path string
		status       int
	}{
		{http.MethodGet, "/speed/nq/config/", http.StatusNotFound},
		{http.MethodGet, "/speed/nq/", http.StatusNotFound},
		{http.MethodGet, "/speed/nq", http.StatusNotFound},
		{http.MethodOptions, "/speed/nq/config", http.StatusMethodNotAllowed},
		{http.MethodOptions, "/speed/nq/upload", http.StatusMethodNotAllowed},
	} {
		answer, _ = stack.fetch(t, request.method, request.path)
		if answer.StatusCode != request.status || answer.Header.Get("Location") != "" ||
			answer.Header.Get("Access-Control-Allow-Origin") != "" {
			t.Errorf("%s %s: %d %v, want %d", request.method, request.path, answer.StatusCode,
				answer.Header, request.status)
		}
	}

	_, body = stack.fetch(t, http.MethodGet, "/speed/metrics")

	for _, labels := range []string{
		`code="200",group="nq",route="/.well-known/nq"}`,
		`code="200",group="nq",route="/nq/small"}`,
		`code="200",group="nq",route="/nq/upload"}`,
		`code="405",group="nq",route="unmatched"}`,
	} {
		if !containsRequestSeries(body, labels) {
			t.Errorf("no request counter with %s", labels)
		}
	}
}

// TestNQConfigReadsForwardingHeadersOnlyFromATrustedProxy: without public_url the config's
// origin comes from a trusted proxy's X-Forwarded-Proto and -Host, never an untrusted peer's,
// and plain http is 503 public_url_required.
func TestNQConfigReadsForwardingHeadersOnlyFromATrustedProxy(t *testing.T) {
	t.Parallel()

	forwarded := map[string]string{
		"X-Forwarded-Proto": "https",
		"X-Forwarded-Host":  "speed.example.lan",
	}

	for _, test := range []struct {
		trusted []string
		status  int
		want    string
	}{
		{nil, http.StatusServiceUnavailable, `"code":"public_url_required"`},
		{[]string{"10.0.0.0/8"}, http.StatusServiceUnavailable, `"code":"public_url_required"`},
		{[]string{"127.0.0.1/32"}, http.StatusOK, `"https://speed.example.lan/nq/small"`},
	} {
		stack := nqStack(t, "/", "", test.trusted...)

		status, body := stack.fetchWith(t, "/nq/config", forwarded)
		if status != test.status || !strings.Contains(body, test.want) {
			t.Fatalf("trusting %v: %d %q, want %d with %s", test.trusted, status, body,
				test.status, test.want)
		}
	}
}
