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

// Middleware derives the client IP once per request and stores it in the request context, so
// that the limiter, GET /api/v1/info and the debug log all use the same value
// (configuration-security.md section 4).
func Middleware(deriver *Deriver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			addr := deriver.FromRequest(request)
			next.ServeHTTP(writer, request.WithContext(WithAddr(request.Context(), addr)))
		})
	}
}

// WithAddr returns a context carrying addr as the client IP.
func WithAddr(ctx context.Context, addr netip.Addr) context.Context {
	return context.WithValue(ctx, contextKey{}, addr)
}

// FromContext returns the client IP stored by Middleware. ok is false when the middleware did
// not run or the peer address could not be parsed.
func FromContext(ctx context.Context) (netip.Addr, bool) {
	addr, stored := ctx.Value(contextKey{}).(netip.Addr)

	return addr, stored && addr.IsValid()
}
