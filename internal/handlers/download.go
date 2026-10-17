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

import (
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/leinardi/bitgauge/internal/metrics"
)

const (
	// bytesParam is the query parameter of GET /api/v1/download.
	bytesParam  = "bytes"
	decimalBase = 10
)

// Download answers GET /api/v1/download?bytes=N with exactly N random bytes from buffer, with
// Content-Length, no-store and no Content-Encoding (wire-protocol.md section 3.1). A missing
// or non-integer N is bad_request; an integer outside 1 to maxBytes is bytes_out_of_range with
// the limit in details. With an unescaped query, a request allocates only the Content-Length
// value and the slice that holds it. transfer counts the body (Buffer.WriteRandom).
func Download(buffer *Buffer, maxBytes int64, transfer metrics.Transfer) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		size, valid, inRange := parseBytes(request.URL.RawQuery, maxBytes)
		if !valid {
			WriteError(
				writer,
				http.StatusBadRequest,
				CodeBadRequest,
				"bytes must be an integer",
				nil,
			)

			return
		}

		if !inRange {
			WriteError(
				writer,
				http.StatusBadRequest,
				CodeBytesOutOfRange,
				fmt.Sprintf("bytes must be between 1 and %d", maxBytes),
				map[string]any{"max": maxBytes},
			)

			return
		}

		header := writer.Header()
		header["Cache-Control"] = noStore
		header["Content-Type"] = octetStream
		header["Content-Length"] = []string{strconv.FormatInt(size, decimalBase)}

		writer.WriteHeader(http.StatusOK)

		// An error is the client going away or stalling; the transfer simply ends there.
		_ = buffer.WriteRandom(writer, size, transfer)
	}
}

// parseBytes finds the first bytes parameter in a raw query the way url.ParseQuery would:
// pairs holding a semicolon or a malformed escape are skipped, and keys and values are
// percent-decoded. A query without escapes, which is what the engine sends, is parsed without
// allocating. valid is false when the parameter is missing or not an optionally signed run of
// decimal digits; inRange is false when that integer is outside 1 to maxBytes, however many
// digits it has.
func parseBytes(rawQuery string, maxBytes int64) (size int64, valid, inRange bool) {
	for rawQuery != "" {
		var pair string

		pair, rawQuery, _ = strings.Cut(rawQuery, "&")
		if strings.Contains(pair, ";") {
			continue
		}

		rawKey, rawValue, _ := strings.Cut(pair, "=")

		key, err := unescapeQuery(rawKey)
		if err != nil || key != bytesParam {
			continue
		}

		value, err := unescapeQuery(rawValue)
		if err != nil {
			continue
		}

		return parseCount(value, maxBytes)
	}

	return 0, false, false
}

// unescapeQuery decodes a query component, allocating only when it holds an escape or a plus.
func unescapeQuery(component string) (string, error) {
	if !strings.ContainsAny(component, "%+") {
		return component, nil
	}

	decoded, err := url.QueryUnescape(component)
	if err != nil {
		return "", fmt.Errorf("decode query component: %w", err)
	}

	return decoded, nil
}

func parseCount(value string, maxBytes int64) (size int64, valid, inRange bool) {
	negative := strings.HasPrefix(value, "-")
	digits := strings.TrimPrefix(value, "-")

	if digits == "" {
		return 0, false, false
	}

	inRange = !negative

	for index := range len(digits) {
		digit := digits[index]
		if digit < '0' || digit > '9' {
			return 0, false, false
		}

		// Stop accumulating once past the limit, so a long run of digits cannot overflow.
		next := int64(digit - '0')
		if inRange && size > (maxBytes-next)/decimalBase {
			inRange = false
		}

		if inRange {
			size = size*decimalBase + next
		}
	}

	return size, true, inRange && size >= 1 && size <= maxBytes
}
