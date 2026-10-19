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
	"io"
	"net/http"
	"net/netip"
	"strings"
	"testing"
)

// libreSpeedStack is the whole server with the LibreSpeed layer enabled under basePath,
// trusting the given proxies.
func libreSpeedStack(t *testing.T, basePath string, trusted ...string) *stack {
	t.Helper()

	cfg := metricsConfig(basePath)
	cfg.Compat.LibreSpeed.Enabled = true

	for _, prefix := range trusted {
		cfg.Server.TrustedProxies = append(cfg.Server.TrustedProxies, netip.MustParsePrefix(prefix))
	}

	return newStack(t, cfg, stubSPA(http.NotFoundHandler()))
}

// fetchWith sends one GET with the given headers and returns the status and body.
func (s *stack) fetchWith(
	t *testing.T,
	path string,
	headers map[string]string,
) (status int, body string) {
	t.Helper()

	request, err := http.NewRequestWithContext(t.Context(), http.MethodGet, s.server.URL+path,
		http.NoBody)
	if err != nil {
		t.Fatal(err)
	}

	for name, value := range headers {
		request.Header.Set(name, value)
	}

	response, err := s.server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}

	defer func() { _ = response.Body.Close() }()

	read, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}

	return response.StatusCode, string(read)
}

func TestLibreSpeedOffIsAPlain404(t *testing.T) {
	t.Parallel()

	stack := newStack(t, metricsConfig("/"), stubSPA(http.NotFoundHandler()))

	for _, path := range []string{
		"/garbage", "/backend/garbage.php", "/empty", "/empty.php", "/getIP", "/backend/getIP",
		"/.well-known/librespeed",
	} {
		answer, body := stack.fetch(t, http.MethodGet, path)
		if answer.StatusCode != http.StatusNotFound || strings.Contains(body, `"error"`) ||
			answer.Header.Get("Content-Security-Policy") == "" {
			t.Errorf("GET %s: %d %q, want the SPA group's plain 404", path, answer.StatusCode,
				body)
		}
	}
}

// TestLibreSpeedResultsRoutesAreNotMounted: BitGauge never stores results, so LibreSpeed's
// results, telemetry and stats routes answer the plain 404 of any unmatched path.
func TestLibreSpeedResultsRoutesAreNotMounted(t *testing.T) {
	t.Parallel()

	stack := libreSpeedStack(t, "/")

	for _, path := range []string{
		"/results", "/results/", "/results/telemetry", "/results/telemetry.php",
		"/backend/results/telemetry.php", "/stats", "/stats.php", "/results/json",
		"/results/json.php", "/results/stats.php", "/backend/stats.php",
	} {
		for _, method := range []string{http.MethodGet, http.MethodPost} {
			answer, body := stack.fetch(t, method, path)
			if answer.StatusCode != http.StatusNotFound || strings.Contains(body, `"error"`) {
				t.Errorf("%s %s: %d %q, want a plain 404", method, path, answer.StatusCode, body)
			}
		}
	}
}

func TestLibreSpeedRoutesTakeTheLayerGroup(t *testing.T) {
	t.Parallel()

	stack := libreSpeedStack(t, "/speed/")

	for _, path := range []string{
		"/speed/garbage?ckSize=1", "/speed/backend/empty.php", "/speed/getIP.php",
		"/speed/.well-known/librespeed",
	} {
		answer, _ := stack.fetch(t, http.MethodGet, path)
		if answer.StatusCode != http.StatusOK ||
			answer.Header.Get("Cache-Control") != "no-store" ||
			answer.Header.Get("X-Content-Type-Options") != "nosniff" ||
			answer.Header.Get("Content-Security-Policy") != "" ||
			answer.Header.Get("Content-Encoding") != "" {
			t.Errorf("GET %s: %d, %v", path, answer.StatusCode, answer.Header)
		}
	}

	// Over HTTP/1.1, /empty asks the client to keep the connection.
	if answer, _ := stack.fetch(t, http.MethodGet, "/speed/empty"); answer.Header.Get(
		"Connection",
	) != "keep-alive" {
		t.Errorf("GET /empty: Connection %q, want keep-alive", answer.Header.Get("Connection"))
	}

	stack.fetch(t, http.MethodPut, "/speed/empty")

	_, body := stack.fetch(t, http.MethodGet, "/speed/metrics")

	for _, labels := range []string{
		`code="200",group="librespeed",route="/garbage"}`,
		`code="200",group="librespeed",route="/backend/empty.php"}`,
		`code="200",group="librespeed",route="/getIP.php"}`,
		`code="200",group="librespeed",route="/.well-known/librespeed"}`,
		`code="405",group="librespeed",route="unmatched"}`,
	} {
		if !containsRequestSeries(body, labels) {
			t.Errorf("no request counter with %s", labels)
		}
	}
}

// TestLibreSpeedReadsForwardingHeadersOnlyFromATrustedProxy: /getIP and the server list
// ignore X-Forwarded-For, -Proto and -Host from an untrusted peer, and believe a trusted one.
func TestLibreSpeedReadsForwardingHeadersOnlyFromATrustedProxy(t *testing.T) {
	t.Parallel()

	forwarded := map[string]string{
		"X-Forwarded-For":   "10.8.0.2",
		"X-Forwarded-Proto": "https",
		"X-Forwarded-Host":  "speed.example.lan",
	}

	for _, test := range []struct {
		trusted         []string
		wantIP, wantURL string
	}{
		{nil, "127.0.0.1 - localhost IPv4 access", "http://127.0.0.1:"},
		{[]string{"10.0.0.0/8"}, "127.0.0.1 - localhost IPv4 access", "http://127.0.0.1:"},
		{[]string{"127.0.0.1/32"}, "10.8.0.2 - private IPv4 access", "https://speed.example.lan/"},
	} {
		stack := libreSpeedStack(t, "/", test.trusted...)

		status, body := stack.fetchWith(t, "/getIP", forwarded)

		var address struct {
			ProcessedString string `json:"processedString"`
		}

		err := json.Unmarshal([]byte(body), &address)
		if err != nil || status != http.StatusOK || address.ProcessedString != test.wantIP {
			t.Fatalf("trusting %v: /getIP %d %q, want %q", test.trusted, status, body,
				test.wantIP)
		}

		status, body = stack.fetchWith(t, "/.well-known/librespeed", forwarded)

		var list []struct {
			Server string `json:"server"`
		}

		err = json.Unmarshal([]byte(body), &list)
		if err != nil || status != http.StatusOK || len(list) != 1 ||
			!strings.HasPrefix(list[0].Server, test.wantURL) {
			t.Fatalf("trusting %v: server list %d %q, want a server from %q", test.trusted,
				status, body, test.wantURL)
		}
	}
}
