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

// Ping answers GET and HEAD /api/v1/ping with 204, no body and no-store: the HTTP fallback for
// idle and loaded latency (wire-protocol.md section 3.3). It allocates nothing.
func Ping(writer http.ResponseWriter, _ *http.Request) {
	writer.Header()["Cache-Control"] = NoStore
	writer.WriteHeader(http.StatusNoContent)
}
