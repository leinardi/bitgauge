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

import "net/http"

// The CORS values of every response on the layer's routes (compatibility.md section 1.2): the
// OpenSpeedTest UI is usually served from another origin than the server it tests. They are set
// before the limiter, so a 429 is readable cross-origin too.
var (
	allowOrigin  = []string{"*"}
	allowMethods = []string{"GET, POST, OPTIONS"}
	allowHeaders = []string{"Content-Type"}
)

// cors sets the CORS headers on every response of the layer's router.
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		header := writer.Header()
		header["Access-Control-Allow-Origin"] = allowOrigin
		header["Access-Control-Allow-Methods"] = allowMethods
		header["Access-Control-Allow-Headers"] = allowHeaders

		next.ServeHTTP(writer, request)
	})
}
