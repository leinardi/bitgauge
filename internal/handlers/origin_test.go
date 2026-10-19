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
	"net/netip"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/internal/clientip"
)

func originRequest(t *testing.T, peerTrusted bool, headers map[string]string) *http.Request {
	t.Helper()

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/nq/config", nil)
	request.Host = "speed.lan:8080"

	for name, value := range headers {
		request.Header.Set(name, value)
	}

	return request.WithContext(clientip.WithClient(request.Context(),
		netip.MustParseAddr("172.20.0.2"), peerTrusted))
}

func TestRequestOrigin(t *testing.T) {
	t.Parallel()

	forwarded := map[string]string{
		"X-Forwarded-Proto": "HTTPS, http",
		"X-Forwarded-Host":  " speed.example , internal:9000",
	}

	for _, test := range []struct {
		name        string
		headers     map[string]string
		publicURL   string
		basePath    string
		want        string
		peerTrusted bool
		wantSecure  bool
	}{
		{name: "an untrusted peer's own host", want: "http://speed.lan:8080"},
		{
			name: "an untrusted peer's forwarding headers are ignored", headers: forwarded,
			want: "http://speed.lan:8080",
		},
		{
			name: "a trusted proxy's first values", headers: forwarded, peerTrusted: true,
			want: "https://speed.example", wantSecure: true,
		},
		{
			name: "a trusted proxy without forwarding headers", peerTrusted: true,
			want: "http://speed.lan:8080",
		},
		{
			name: "a scheme neither http nor https", peerTrusted: true,
			headers: map[string]string{"X-Forwarded-Proto": "ftp"},
			want:    "http://speed.lan:8080",
		},
		{
			name: "an invalid forwarded host", peerTrusted: true,
			headers: map[string]string{"X-Forwarded-Host": "evil.example/path"},
			want:    "http://speed.lan:8080",
		},
		{
			name: "the base path without its trailing slash", basePath: "/speed/",
			want: "http://speed.lan:8080/speed",
		},
		{
			name: "public_url wins", headers: forwarded, peerTrusted: true,
			publicURL: "https://speed.example.org/", basePath: "/speed/",
			want: "https://speed.example.org/speed", wantSecure: true,
		},
		{
			name: "an http public_url", publicURL: "http://10.0.0.5:8080",
			want: "http://10.0.0.5:8080",
		},
	} {
		request := originRequest(t, test.peerTrusted, test.headers)

		got, secure := RequestOrigin(request, test.publicURL, test.basePath)
		if got != test.want || secure != test.wantSecure {
			t.Fatalf("%s: RequestOrigin = %q, %v; want %q, %v",
				test.name, got, secure, test.want, test.wantSecure)
		}
	}
}

func TestRequestOriginWithoutTheMiddleware(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/nq/config", nil)
	request.Host = "speed.lan"
	request.Header.Set("X-Forwarded-Proto", "https")
	request.Header.Set("X-Forwarded-Host", "speed.example")

	if got, secure := RequestOrigin(request, "", "/"); got != "http://speed.lan" || secure {
		t.Fatalf("RequestOrigin = %q, %v; forwarding headers read without a trusted peer",
			got, secure)
	}
}

func TestValidHost(t *testing.T) {
	t.Parallel()

	for _, host := range []string{
		"speed.example", "speed.example:8443", "localhost", "10.0.0.5:8080", "a-b.example",
		"host:1", "host:65535", strings.Repeat("a", 63) + ".example",
	} {
		if !ValidHost(host) {
			t.Fatalf("ValidHost(%q) = false, want true", host)
		}
	}

	for _, host := range []string{
		"", "evil.example; script-src *", "a b", "exa_mple.com", "-bad.example", "bad-.example",
		"bad..example", "host:", "host:0", "host:65536", "host:8a", "[::1]", "[::1]:8080",
		"evil.example/path", strings.Repeat("a", 64) + ".example",
	} {
		if ValidHost(host) {
			t.Fatalf("ValidHost(%q) = true, want false", host)
		}
	}
}
