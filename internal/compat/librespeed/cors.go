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
	"net/http"

	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/handlers"
)

// The CORS values of compatibility.md section 2.2.
var (
	allowAnyOrigin = []string{"*"}
	allowMethods   = []string{"GET, POST"}
	allowHeaders   = []string{"Content-Encoding, Content-Type"}
	varyOrigin     = []string{"Origin"}
)

// cors is the layer's CORS step, before the limiter, so a 429 carries what it sets. A request
// asks for CORS with the exact query value cors=true, as LibreSpeed's multi-server mode sends;
// a preflight counts as asking, because it cannot carry the query reliably. /garbage and
// /empty then answer any origin. /getIP returns the caller's own address, so it answers only an
// Origin listed in server.cors.allowed_origins, echoed with Vary: Origin, and sends nothing to
// any other. The server list sends no CORS headers.
func cors(allowedOrigins []config.Origin) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(allowedOrigins))

	for _, origin := range allowedOrigins {
		if normalized, ok := handlers.NormalizeOrigin(string(origin)); ok {
			allowed[normalized] = true
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			route := routeOf(request)
			if (route == kindGarbage || route == kindEmpty || route == kindGetIP) &&
				(request.Method == http.MethodOptions || corsRequested(request)) {
				setCORS(writer.Header(), request, route, allowed)
			}

			next.ServeHTTP(writer, request)
		})
	}
}

func setCORS(header http.Header, request *http.Request, route kind, allowed map[string]bool) {
	origin := allowAnyOrigin

	if route == kindGetIP {
		origins := request.Header.Values("Origin")
		if len(origins) != 1 {
			return
		}

		normalized, ok := handlers.NormalizeOrigin(origins[0])
		if !ok || !allowed[normalized] {
			return
		}

		// The browser compares the echoed origin with its own byte for byte.
		origin = []string{origins[0]}
		header["Vary"] = varyOrigin
	}

	header["Access-Control-Allow-Origin"] = origin
	header["Access-Control-Allow-Methods"] = allowMethods
	header["Access-Control-Allow-Headers"] = allowHeaders
}

// corsRequested reports whether the first cors parameter is exactly true.
func corsRequested(request *http.Request) bool {
	value, present := queryValue(request, "cors")

	return present && value == "true"
}
