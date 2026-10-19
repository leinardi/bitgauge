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

// Package handlers is the native API under /api/v1 (wire-protocol.md): the error envelope, the
// shared random buffer, the epoch and the handlers, and the router that ties them together.
package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/leinardi/bitgauge/internal/ratelimit"
)

// The envelope codes of wire-protocol.md section 7. The 429 codes belong to the limiter, which
// owns the decision between them; they are repeated here so that every code has one home.
const (
	CodeBadRequest       = "bad_request"
	CodeBytesOutOfRange  = "bytes_out_of_range"
	CodeNotFound         = "not_found"
	CodeMethodNotAllowed = "method_not_allowed"
	CodeRequestTimeout   = "request_timeout"
	CodeLengthRequired   = "length_required"
	CodePayloadTooLarge  = "payload_too_large"
	CodeRateLimited      = ratelimit.CodeRateLimited
	CodeTooManyStreams   = ratelimit.CodeTooManyStreams
	CodeTableFull        = ratelimit.CodeTableFull
	CodeInternal         = "internal"
	// CodePublicURLRequired answers a networkQuality config that cannot build an https origin
	// (compatibility.md section 3.3); never on /api/v1.
	CodePublicURLRequired = "public_url_required"
)

// internalBody is the envelope written when an envelope cannot be encoded, so that even that
// failure answers in the documented shape.
const internalBody = `{"error":{"code":"internal","message":"internal server error"}}`

// The shared header sets, exported for the compatibility layers. Assigning one of these slices
// instead of calling Header().Set keeps the hot handlers free of allocations; net/http only
// reads header values, and no caller may modify them.
var (
	// NoStore is the Cache-Control value of every API and compatibility response.
	NoStore = []string{"no-store"}
	// JSONType is the Content-Type of a JSON body.
	JSONType = []string{"application/json"}
	// OctetStream is the Content-Type of a random-data body.
	OctetStream = []string{"application/octet-stream"}
)

type envelope struct {
	Error envelopeBody `json:"error"`
}

type envelopeBody struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

// ErrorWriter is the envelope writer as a value, for the packages that take it as an
// interface, such as ratelimit.Middleware.
type ErrorWriter struct{}

var _ ratelimit.ErrorWriter = ErrorWriter{}

// WriteError calls the package-level WriteError.
func (ErrorWriter) WriteError(
	writer http.ResponseWriter,
	status int,
	code, message string,
	details map[string]any,
) {
	WriteError(writer, status, code, message, details)
}

// WriteError is the one writer of the error envelope of wire-protocol.md section 7. message is
// English, for logs and debugging; the SPA switches on code. details is optional
// machine-readable context, such as the limit of bytes_out_of_range. Callers never pass request
// bodies or headers into message or details.
func WriteError(
	writer http.ResponseWriter,
	status int,
	code, message string,
	details map[string]any,
) {
	body, err := json.Marshal(envelope{
		Error: envelopeBody{Code: code, Message: message, Details: details},
	})
	if err != nil {
		status, body = http.StatusInternalServerError, []byte(internalBody)
	}

	header := writer.Header()
	header["Content-Type"] = JSONType
	header["Cache-Control"] = NoStore
	header.Del("Content-Length")
	header.Del("Content-Encoding")

	writer.WriteHeader(status)

	// A failed write means the client is gone; there is nobody left to tell.
	_, _ = writer.Write(body)
}
