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
	"net/http"

	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/handlers"
)

// The CORS values of the native group (wire-protocol.md section 8).
var (
	valueVaryOrigin    = []string{"Origin"}
	valueAllowMethods  = []string{"GET, POST, OPTIONS"}
	valueAllowHeaders  = []string{"Content-Type"}
	valueExposeHeaders = []string{"Server-Timing"}
)

// nativeCORS is the CORS step of the native group. By default the API is same-origin and
// sends no CORS headers. A request whose Origin is in server.cors.allowed_origins gets the
// full set, Timing-Allow-Origin included, so that the browser keeps the Resource Timing
// fields the engine reads; its OPTIONS preflight is answered 204 here and never reaches the
// limiter. Every later answer, a 429 included, carries the headers.
func nativeCORS(allowedOrigins []config.Origin) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		if normalized, ok := handlers.NormalizeOrigin(string(origin)); ok {
			allowed[normalized] = true
		}
	}

	return func(next http.Handler) http.Handler {
		if len(allowed) == 0 {
			return next
		}

		return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			origins := request.Header.Values("Origin")
			if len(origins) != 1 {
				next.ServeHTTP(writer, request)

				return
			}

			normalized, ok := handlers.NormalizeOrigin(origins[0])
			if !ok || !allowed[normalized] {
				next.ServeHTTP(writer, request)

				return
			}

			// The browser compares the echoed origin with its own byte for byte.
			echoed := []string{origins[0]}
			header := writer.Header()
			header["Access-Control-Allow-Origin"] = echoed
			header["Vary"] = valueVaryOrigin
			header["Access-Control-Allow-Methods"] = valueAllowMethods
			header["Access-Control-Allow-Headers"] = valueAllowHeaders
			header["Access-Control-Expose-Headers"] = valueExposeHeaders
			header["Timing-Allow-Origin"] = echoed

			if request.Method == http.MethodOptions {
				writer.WriteHeader(http.StatusNoContent)

				return
			}

			next.ServeHTTP(writer, request)
		})
	}
}
