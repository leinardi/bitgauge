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
	"net/netip"
)

// contextKey is unexported so that only this package can store or read the client IP.
type contextKey struct{}

// client is what Middleware records about a request: its client IP and whether its TCP peer
// is a trusted proxy. One value keeps the middleware at one context allocation.
type client struct {
	addr        netip.Addr
	peerTrusted bool
}

// Middleware derives the client IP once per request and stores it in the request context, so
// that the limiter, GET /api/v1/info and the debug log all use the same value
// (configuration-security.md section 4). It records too whether the TCP peer is a trusted
// proxy, which decides whether a compatibility layer may read forwarding headers
// (PeerTrusted).
func Middleware(deriver *Deriver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			addr, peerTrusted := deriver.derive(request)
			next.ServeHTTP(
				writer,
				request.WithContext(WithClient(request.Context(), addr, peerTrusted)),
			)
		})
	}
}

// WithAddr returns a context carrying addr as the client IP, with an untrusted peer.
func WithAddr(ctx context.Context, addr netip.Addr) context.Context {
	return WithClient(ctx, addr, false)
}

// WithClient returns a context carrying addr as the client IP and whether the TCP peer is a
// trusted proxy.
func WithClient(ctx context.Context, addr netip.Addr, peerTrusted bool) context.Context {
	return context.WithValue(ctx, contextKey{}, client{addr: addr, peerTrusted: peerTrusted})
}

// FromContext returns the client IP stored by Middleware. ok is false when the middleware did
// not run or the peer address could not be parsed.
func FromContext(ctx context.Context) (netip.Addr, bool) {
	stored, found := ctx.Value(contextKey{}).(client)

	return stored.addr, found && stored.addr.IsValid()
}

// PeerTrusted reports whether Middleware found the request's TCP peer inside
// server.trusted_proxies. It is false when the middleware did not run, so a forwarding header is
// believed only when the middleware said so.
func PeerTrusted(ctx context.Context) bool {
	stored, found := ctx.Value(contextKey{}).(client)

	return found && stored.peerTrusted
}
