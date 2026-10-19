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
	"strconv"

	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/metrics"
)

const (
	// chunkBytes is the size of one ckSize chunk: 1 MiB, as LibreSpeed's Go server sends it.
	chunkBytes = 1 << 20
	// defaultChunks is the ckSize of a request without one.
	defaultChunks = 4
	// maxChunks is LibreSpeed's own clamp.
	maxChunks = 1024
	decimal   = 10
)

// Garbage answers GET /garbage?ckSize=N with N chunks of 1 MiB of random data from buffer,
// with Content-Length, no-store and no Content-Encoding (compatibility.md section 2.1). N is 4
// when absent and clamped silently to min(1024, floor(maxDownloadBytes / 1 MiB)); a value that
// is not a positive decimal integer answers 400 bad_request.
func Garbage(
	buffer *handlers.Buffer,
	maxDownloadBytes int64,
	transfer metrics.Transfer,
) http.HandlerFunc {
	limit := min(maxChunks, maxDownloadBytes/chunkBytes)

	return func(writer http.ResponseWriter, request *http.Request) {
		chunks := int64(defaultChunks)

		if value, present := queryValue(request, "ckSize"); present {
			parsed, valid := parseChunks(value, limit)
			if !valid {
				handlers.WriteError(writer, http.StatusBadRequest, handlers.CodeBadRequest,
					"ckSize must be a positive integer", nil)

				return
			}

			chunks = parsed
		}

		size := min(chunks, limit) * chunkBytes

		header := writer.Header()
		header["Cache-Control"] = handlers.NoStore
		header["Content-Type"] = handlers.OctetStream
		header["Content-Length"] = []string{strconv.FormatInt(size, decimal)}

		writer.WriteHeader(http.StatusOK)

		// An error is the client going away or stalling; the transfer simply ends there.
		_ = buffer.WriteRandom(writer, size, transfer)
	}
}

// parseChunks parses a positive decimal integer of any length, saturating at limit so a long
// run of digits cannot overflow. valid is false for anything else: empty, a sign, a point, a
// letter, or zero.
func parseChunks(value string, limit int64) (int64, bool) {
	if value == "" {
		return 0, false
	}

	var chunks int64

	for index := range len(value) {
		digit := value[index]
		if digit < '0' || digit > '9' {
			return 0, false
		}

		if chunks <= limit {
			chunks = chunks*decimal + int64(digit-'0')
		}
	}

	if chunks == 0 {
		return 0, false
	}

	return min(chunks, limit), true
}
