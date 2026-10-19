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

package clientip

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
)

func prefixes(cidrs ...string) []netip.Prefix {
	parsed := make([]netip.Prefix, 0, len(cidrs))
	for _, cidr := range cidrs {
		parsed = append(parsed, netip.MustParsePrefix(cidr))
	}

	return parsed
}

// TestDerive follows the algorithm of configuration-security.md section 4 step by step.
func TestDerive(t *testing.T) {
	t.Parallel()

	proxy := prefixes("172.20.0.2/32")
	chain := prefixes("172.20.0.0/24", "fd00::/64")

	tests := []struct {
		name    string
		trusted []netip.Prefix
		peer    string
		headers map[string][]string
		want    string
	}{
		{
			name: "no trusted proxies ignores every header",
			peer: "172.20.0.2:41000",
			headers: map[string][]string{
				"X-Forwarded-For": {"203.0.113.9"},
				"X-Real-IP":       {"203.0.113.10"},
			},
			want: "172.20.0.2",
		},
		{
			name:    "an untrusted peer's header is ignored",
			trusted: proxy,
			peer:    "198.51.100.7:41000",
			headers: map[string][]string{"X-Forwarded-For": {"203.0.113.9"}},
			want:    "198.51.100.7",
		},
		{
			name:    "trusted peer without the header is the client",
			trusted: proxy,
			peer:    "172.20.0.2:41000",
			want:    "172.20.0.2",
		},
		{
			name:    "trusted peer with a clean chain",
			trusted: proxy,
			peer:    "172.20.0.2:41000",
			headers: map[string][]string{"X-Forwarded-For": {"203.0.113.9"}},
			want:    "203.0.113.9",
		},
		{
			name:    "spoofed left-hand entries are never used",
			trusted: proxy,
			peer:    "172.20.0.2:41000",
			headers: map[string][]string{"X-Forwarded-For": {"1.2.3.4, 5.6.7.8, 203.0.113.9"}},
			want:    "203.0.113.9",
		},
		{
			name:    "trusted hops are skipped from the right",
			trusted: chain,
			peer:    "172.20.0.2:41000",
			headers: map[string][]string{
				"X-Forwarded-For": {"9.9.9.9, 203.0.113.9, 172.20.0.5, fd00::7"},
			},
			want: "203.0.113.9",
		},
		{
			name:    "an all-trusted chain returns the leftmost entry",
			trusted: chain,
			peer:    "172.20.0.2:41000",
			headers: map[string][]string{"X-Forwarded-For": {"172.20.0.9, 172.20.0.5"}},
			want:    "172.20.0.9",
		},
		{
			name:    "a malformed entry falls back to the peer",
			trusted: chain,
			peer:    "172.20.0.2:41000",
			headers: map[string][]string{"X-Forwarded-For": {"203.0.113.9, not-an-ip, 172.20.0.5"}},
			want:    "172.20.0.2",
		},
		{
			name:    "an entry with a port is malformed",
			trusted: proxy,
			peer:    "172.20.0.2:41000",
			headers: map[string][]string{"X-Forwarded-For": {"203.0.113.9:5555"}},
			want:    "172.20.0.2",
		},
		{
			name:    "an empty entry is malformed",
			trusted: proxy,
			peer:    "172.20.0.2:41000",
			headers: map[string][]string{"X-Forwarded-For": {"203.0.113.9,"}},
			want:    "172.20.0.2",
		},
		{
			name:    "an empty header is malformed",
			trusted: proxy,
			peer:    "172.20.0.2:41000",
			headers: map[string][]string{"X-Forwarded-For": {""}},
			want:    "172.20.0.2",
		},
		{
			name:    "several header lines are joined in order",
			trusted: chain,
			peer:    "172.20.0.2:41000",
			headers: map[string][]string{"X-Forwarded-For": {"1.2.3.4, 203.0.113.9", "172.20.0.5"}},
			want:    "203.0.113.9",
		},
		{
			name:    "the right-most line counts first",
			trusted: proxy,
			peer:    "172.20.0.2:41000",
			headers: map[string][]string{"X-Forwarded-For": {"203.0.113.9", "198.51.100.1"}},
			want:    "198.51.100.1",
		},
		{
			name:    "X-Real-IP, Client-IP, CF-Connecting-IP and Forwarded are ignored",
			trusted: proxy,
			peer:    "172.20.0.2:41000",
			headers: map[string][]string{
				"X-Real-IP":          {"203.0.113.1"},
				"Client-IP":          {"203.0.113.2"},
				"CF-Connecting-IP":   {"203.0.113.3"},
				"CF-Connecting-IPv6": {"2001:db8::3"},
				"Forwarded":          {"for=203.0.113.4"},
			},
			want: "172.20.0.2",
		},
		{
			name: "an IPv4-mapped peer is IPv4",
			peer: "[::ffff:10.0.0.1]:41000",
			want: "10.0.0.1",
		},
		{
			name:    "an IPv4-mapped peer is matched against IPv4 trusted ranges",
			trusted: prefixes("10.0.0.1/32"),
			peer:    "[::ffff:10.0.0.1]:41000",
			headers: map[string][]string{"X-Forwarded-For": {"203.0.113.9"}},
			want:    "203.0.113.9",
		},
		{
			name:    "an IPv4-mapped entry is IPv4",
			trusted: proxy,
			peer:    "172.20.0.2:41000",
			headers: map[string][]string{"X-Forwarded-For": {"::ffff:10.0.0.1"}},
			want:    "10.0.0.1",
		},
		{
			name:    "an IPv4-mapped entry inside a trusted range is skipped",
			trusted: chain,
			peer:    "172.20.0.2:41000",
			headers: map[string][]string{"X-Forwarded-For": {"203.0.113.9, ::ffff:172.20.0.5"}},
			want:    "203.0.113.9",
		},
		{
			name: "a zoned peer loses its zone",
			peer: "[fe80::1%eth0]:41000",
			want: "fe80::1",
		},
		{
			name:    "a zoned entry loses its zone",
			trusted: proxy,
			peer:    "172.20.0.2:41000",
			headers: map[string][]string{"X-Forwarded-For": {"fe80::1%eth0"}},
			want:    "fe80::1",
		},
		{
			name:    "an IPv6 peer",
			trusted: chain,
			peer:    "[fd00::2]:41000",
			headers: map[string][]string{"X-Forwarded-For": {"2001:db8::9"}},
			want:    "2001:db8::9",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			request := httptest.NewRequestWithContext(
				t.Context(),
				http.MethodGet,
				"/api/v1/info",
				http.NoBody,
			)
			request.RemoteAddr = tc.peer

			for name, values := range tc.headers {
				for _, value := range values {
					request.Header.Add(name, value)
				}
			}

			got := NewDeriver(tc.trusted).FromRequest(request)
			if got != netip.MustParseAddr(tc.want) {
				t.Fatalf("FromRequest = %v, want %s", got, tc.want)
			}
		})
	}
}

func TestDeriveUnparsablePeer(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", http.NoBody)
	request.RemoteAddr = "@"
	request.Header.Set("X-Forwarded-For", "203.0.113.9")

	got := NewDeriver(prefixes("0.0.0.0/0")).FromRequest(request)
	if got.IsValid() {
		t.Fatalf("FromRequest = %v, want the zero address", got)
	}
}

func TestDeriverCopiesTheTrustedRanges(t *testing.T) {
	t.Parallel()

	trusted := prefixes("172.20.0.2/32")
	deriver := NewDeriver(trusted)
	trusted[0] = netip.MustParsePrefix("0.0.0.0/0")

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", http.NoBody)
	request.RemoteAddr = "198.51.100.7:1"
	request.Header.Set("X-Forwarded-For", "203.0.113.9")

	if got := deriver.FromRequest(request); got != netip.MustParseAddr("198.51.100.7") {
		t.Fatalf("FromRequest = %v; a later change to the caller's slice must not widen trust", got)
	}
}

func TestMiddlewareStoresTheDerivedAddress(t *testing.T) {
	t.Parallel()

	var (
		got    netip.Addr
		stored bool
	)

	handler := Middleware(
		NewDeriver(prefixes("172.20.0.2/32")),
	)(
		http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
			got, stored = FromContext(request.Context())
		}),
	)

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", http.NoBody)
	request.RemoteAddr = "172.20.0.2:41000"
	request.Header.Set("X-Forwarded-For", "203.0.113.9")
	handler.ServeHTTP(httptest.NewRecorder(), request)

	if !stored || got != netip.MustParseAddr("203.0.113.9") {
		t.Fatalf("FromContext = %v, %v; want 203.0.113.9, true", got, stored)
	}
}

func TestFromContextWithoutTheMiddleware(t *testing.T) {
	t.Parallel()

	_, stored := FromContext(context.Background())
	if stored {
		t.Fatal("FromContext reported an address no middleware stored")
	}

	_, stored = FromContext(WithAddr(context.Background(), netip.Addr{}))
	if stored {
		t.Fatal("FromContext reported the zero address as stored")
	}
}

func TestMiddlewareRecordsWhetherThePeerIsTrusted(t *testing.T) {
	t.Parallel()

	var trusted bool

	handler := Middleware(
		NewDeriver(prefixes("172.20.0.2/32")),
	)(
		http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
			trusted = PeerTrusted(request.Context())
		}),
	)

	for peer, want := range map[string]bool{
		"172.20.0.2:41000":      true,
		"172.20.0.3:41000":      false,
		"[::ffff:172.20.0.2]:1": true,
		"not an address":        false,
	} {
		request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", http.NoBody)
		request.RemoteAddr = peer
		handler.ServeHTTP(httptest.NewRecorder(), request)

		if trusted != want {
			t.Fatalf("peer %q: PeerTrusted = %v, want %v", peer, trusted, want)
		}
	}

	if PeerTrusted(context.Background()) {
		t.Fatal("PeerTrusted without the middleware, want false")
	}

	if PeerTrusted(WithAddr(context.Background(), netip.MustParseAddr("172.20.0.2"))) {
		t.Fatal("PeerTrusted after WithAddr, want false")
	}
}
