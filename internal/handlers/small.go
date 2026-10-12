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

import "net/http"

// smallBody is the constant one-byte body of GET /api/v1/small.
var smallBody = []byte{'0'}

// smallLength is its Content-Length.
var smallLength = []string{"1"}

// Small answers GET /api/v1/small with a one-byte body: the HTTP responsiveness probe target
// and the path B capability check (wire-protocol.md section 3.3). It allocates nothing.
func Small(writer http.ResponseWriter, _ *http.Request) {
	header := writer.Header()
	header["Cache-Control"] = noStore
	header["Content-Type"] = octetStream
	header["Content-Length"] = smallLength

	writer.WriteHeader(http.StatusOK)

	// A failed write means the client is gone; the probe has nobody left to answer.
	_, _ = writer.Write(smallBody)
}
