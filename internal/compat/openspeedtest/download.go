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

import (
	"net/http"
	"strconv"

	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/metrics"
)

// DownloadBytes is the fixed size of every GET /downloading body: 30 MiB.
const DownloadBytes = 30 << 20

// downloadLength is its Content-Length.
var downloadLength = []string{strconv.Itoa(DownloadBytes)}

// Download answers GET and HEAD /downloading with exactly DownloadBytes random bytes from
// buffer, with Content-Length, no-store and no Content-Encoding; HEAD gets the headers only.
// The n cache-buster is ignored.
func Download(buffer *handlers.Buffer, transfer metrics.Transfer) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		header := writer.Header()
		header["Cache-Control"] = handlers.NoStore
		header["Content-Type"] = handlers.OctetStream
		header["Content-Length"] = downloadLength

		writer.WriteHeader(http.StatusOK)

		if request.Method == http.MethodHead {
			return
		}

		// An error is the client going away or stalling; the transfer simply ends there.
		_ = buffer.WriteRandom(writer, DownloadBytes, transfer)
	}
}
