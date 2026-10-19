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

package ratelimit

import (
	"errors"
	"log/slog"
	"net/http"
	"net/netip"
	"strconv"

	"github.com/leinardi/bitgauge/internal/clientip"
)

// ErrorWriter writes the error envelope of wire-protocol.md section 7. The handlers package
// owns the envelope and provides the implementation, so the limiter does not shape responses
// of its own.
type ErrorWriter interface {
	WriteError(writer http.ResponseWriter, status int, code, message string, details map[string]any)
}

// Refusals counts refused acquisitions by their limit; internal/metrics provides it. A nil
// Refusals counts nothing.
type Refusals interface {
	Refused(err error)
}

// Middleware limits the throughput group (native download and upload): each request takes a
// stream slot and a token for the derived client IP and gives the slot back when it ends. A
// refused request is answered 429 with Retry-After before its body is read, and on HTTP/1.1 the
// connection is closed after the response, so the unread body never has to be drained
// (wire-protocol.md section 9).
func Middleware(
	limiter *Limiter,
	errorWriter ErrorWriter,
	log *slog.Logger,
	refusals Refusals,
) func(http.Handler) http.Handler {
	return limit(limiter.AcquireStream, errorWriter, log, refusals)
}

// FlowMiddleware limits networkQuality's flows, /nq/large and /nq/upload: each request takes a
// flow slot of compat.networkquality.max_flows_per_client for the derived client IP, not a
// native stream slot, and gives it back when it ends. A refusal is answered as Middleware's
// (compatibility.md section 3.1).
func FlowMiddleware(
	limiter *Limiter,
	errorWriter ErrorWriter,
	log *slog.Logger,
	refusals Refusals,
) func(http.Handler) http.Handler {
	return limit(limiter.AcquireFlow, errorWriter, log, refusals)
}

// limit wraps a handler in one acquisition per request, refused with Refuse.
func limit(
	acquire func(addr netip.Addr) (func(), error),
	errorWriter ErrorWriter,
	log *slog.Logger,
	refusals Refusals,
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			// Without the clientip middleware the zero address is the key: every such request
			// then shares one budget, which limits too much rather than too little.
			addr, _ := clientip.FromContext(request.Context())

			release, err := acquire(addr)
			if err != nil {
				Refuse(writer, request, err, errorWriter, log, refusals)

				return
			}

			defer release()

			next.ServeHTTP(writer, request)
		})
	}
}

// Refuse answers a refused acquisition with 429, its Retry-After and its envelope code, and
// counts it in refusals. Other errors are not limits and are answered 500. It is shared with
// the routes that acquire a WebSocket or a flow themselves.
func Refuse(
	writer http.ResponseWriter,
	request *http.Request,
	err error,
	errorWriter ErrorWriter,
	log *slog.Logger,
	refusals Refusals,
) {
	limitErr, isLimit := errors.AsType[*LimitError](err)
	if !isLimit {
		errorWriter.WriteError(
			writer,
			http.StatusInternalServerError,
			"internal",
			"internal error",
			nil,
		)

		return
	}

	if refusals != nil {
		refusals.Refused(limitErr)
	}

	if errors.Is(limitErr, ErrTableFull) {
		// Every refusal is logged (configuration-security.md section 5); the line names no
		// client, since client IPs are logged at debug only.
		log.Warn(
			"rate-limit table full: every tracked client has active work; refusing a new client",
		)
	}

	if request.ProtoMajor == 1 {
		writer.Header().Set("Connection", "close")
	}

	writer.Header().Set("Retry-After", strconv.Itoa(limitErr.RetryAfter))
	errorWriter.WriteError(writer, http.StatusTooManyRequests, limitErr.Code, limitErr.Error(), nil)
}
