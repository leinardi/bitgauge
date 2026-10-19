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

package nq

import (
	"net/http"
	"strconv"
	"time"

	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/metrics"
)

// LargeBytes is the declared size of every GET /nq/large body: 8 GiB, which clients close
// early. limits.max_download_bytes does not bound it.
const LargeBytes = 8 << 30

// largeLength is its Content-Length.
var largeLength = []string{strconv.FormatInt(LargeBytes, 10)}

// zeroLength is the Content-Length of an empty 200.
var zeroLength = []string{"0"}

// Large answers GET /nq/large with LargeBytes random bytes from buffer, with Content-Length,
// no-store and no Content-Encoding, written until the client closes it.
func Large(buffer *handlers.Buffer, transfer metrics.Transfer) http.HandlerFunc {
	return func(writer http.ResponseWriter, _ *http.Request) {
		header := writer.Header()
		header["Cache-Control"] = handlers.NoStore
		header["Content-Type"] = handlers.OctetStream
		header["Content-Length"] = largeLength

		writer.WriteHeader(http.StatusOK)

		// An error is the client closing the flow, which is how it ends.
		_ = buffer.WriteRandom(writer, LargeBytes, transfer)
	}
}

// Upload answers POST /nq/upload: it drains the body, up to maxUploadBytes whether or not it
// declares its length, within the native upload's lifetime from handler entry on now, and then
// answers 200 with an empty body. A declared length over the cap is answered 413 unread, a
// streamed body is read to the cap and then answered 413 with the connection closed, and one
// that outlives the lifetime gets 408 (handlers.DrainBody).
func Upload(
	now func() time.Time,
	maxUploadBytes int64,
	transfer metrics.Transfer,
) http.HandlerFunc {
	options := handlers.DrainOptions{
		Limit:    maxUploadBytes,
		Lifetime: handlers.UploadLifetime,
		Transfer: transfer,
	}

	return func(writer http.ResponseWriter, request *http.Request) {
		_, drained := handlers.DrainBody(writer, request, now(), &options, nil)
		if !drained {
			return
		}

		header := writer.Header()
		header["Cache-Control"] = handlers.NoStore
		header["Content-Length"] = zeroLength

		writer.WriteHeader(http.StatusOK)
	}
}
