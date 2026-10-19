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
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/leinardi/bitgauge/internal/metrics"
)

// drainBufferSize is the size of each pooled read buffer (backend.md section 2.2).
const drainBufferSize = 64 << 10

// drainBuffers holds the read buffers shared by every route that drains a body, so a request
// allocates none of its own.
var drainBuffers = sync.Pool{
	New: func() any {
		buffer := make([]byte, drainBufferSize)

		return &buffer
	},
}

// Drain reads request's body to its end and discards it, reading at most limit bytes through
// http.MaxBytesReader, so a body longer than its declared length, or one without a length, is
// cut at the cap. After every read that returned bytes, onRead is called with their count;
// an error from it stops the drain and is returned. The result is the number of bytes read
// and the first error other than the body's end; a body over limit gives an error matching
// *http.MaxBytesError. transfer counts the drain as in progress and the bytes read; telling an
// abort from the other errors is the caller's.
func Drain(
	writer http.ResponseWriter,
	request *http.Request,
	limit int64,
	transfer metrics.Transfer,
	onRead func(read int) error,
) (int64, error) {
	pooled, _ := drainBuffers.Get().(*[]byte)
	defer drainBuffers.Put(pooled)

	transfer.Start()
	defer transfer.Done()

	buffer := *pooled
	body := http.MaxBytesReader(writer, request.Body, limit)

	var total int64

	for {
		read, err := body.Read(buffer)
		if read > 0 {
			total += int64(read)
			transfer.Add(read)

			callbackErr := onRead(read)
			if callbackErr != nil {
				return total, callbackErr
			}
		}

		if errors.Is(err, io.EOF) {
			return total, nil
		}

		if err != nil {
			return total, fmt.Errorf("drain the body: %w", err)
		}
	}
}

// DrainOptions are the rules of one route that drains a body (backend.md section 2.2).
type DrainOptions struct {
	// Transfer counts the drain, a body cut at its lifetime as a timeout, and a client gone
	// mid-body as an abort.
	Transfer metrics.Transfer
	// Limit is the route's cap: a declared Content-Length above it is answered 413 without
	// reading, and a body that runs past it is cut there and answered 413.
	Limit int64
	// Lifetime is how long after handler entry the body may take to arrive; 408 after it.
	Lifetime time.Duration
	// RequireLength answers a body without Content-Length 411, which only the native upload
	// does; the other routes read such a body up to Limit (compatibility.md section 6).
	RequireLength bool
}

// DrainBody is the one drainer of every route that reads a body: it checks the declared length,
// sets the read deadline of entry plus options.Lifetime, and reads the body to its end through
// Drain, calling onRead after every read that returned bytes. It returns the bytes read and
// whether the body was drained. When it was not, the answer has been written: 411, 413, 408 or
// 500 with the error envelope, the connection closed on HTTP/1.x; and a client that went away
// mid-body ends the handler with http.ErrAbortHandler.
func DrainBody(
	writer http.ResponseWriter,
	request *http.Request,
	entry time.Time,
	options *DrainOptions,
	onRead func(read int) error,
) (int64, bool) {
	if options.RequireLength && !declaresLength(request) {
		refuseBody(writer, request, http.StatusLengthRequired, CodeLengthRequired,
			"Content-Length is required")

		return 0, false
	}

	if request.ContentLength > options.Limit {
		refuseBody(writer, request, http.StatusRequestEntityTooLarge, CodePayloadTooLarge,
			fmt.Sprintf("the body must be at most %d bytes", options.Limit))

		return 0, false
	}

	err := http.NewResponseController(writer).SetReadDeadline(entry.Add(options.Lifetime))
	if err != nil {
		// Without the deadline a stalled body would hold the handler forever.
		refuseBody(writer, request, http.StatusInternalServerError, CodeInternal,
			"internal server error")

		return 0, false
	}

	if onRead == nil {
		onRead = ignoreRead
	}

	total, err := Drain(writer, request, options.Limit, options.Transfer, onRead)
	if err != nil {
		answerDrainError(writer, request, err, options.Limit, options.Transfer)

		return total, false
	}

	return total, true
}

// ignoreRead is the onRead of a route that does not count its reads.
func ignoreRead(int) error {
	return nil
}

// declaresLength reports whether the request declared its body's length. net/http reports a
// chunked body as -1, but a request without any length header, which it treats as bodiless,
// as 0: only the header tells that 0 apart from a declared Content-Length: 0.
func declaresLength(request *http.Request) bool {
	if request.ContentLength > 0 {
		return true
	}

	return request.ContentLength == 0 && len(request.Header.Values("Content-Length")) > 0
}

// answerDrainError answers a drain that did not reach the body's end: 408 when the lifetime
// ran out and 413 when the body outgrew the cap. Any other error is a client that went away
// mid-body, such as a short body or a reset stream: nobody is left to read an answer, and
// returning normally would let net/http send an empty 200, so the handler panics with
// http.ErrAbortHandler, on which net/http closes the connection (or resets the HTTP/2 stream)
// without logging. The recovery middleware must let that panic through.
func answerDrainError(
	writer http.ResponseWriter,
	request *http.Request,
	err error,
	maxBytes int64,
	transfer metrics.Transfer,
) {
	_, overCap := errors.AsType[*http.MaxBytesError](err)

	switch {
	case errors.Is(err, errLifetime) || errors.Is(err, os.ErrDeadlineExceeded):
		transfer.Timeout()
		refuseBody(writer, request, http.StatusRequestTimeout, CodeRequestTimeout,
			"the body did not arrive within the upload lifetime")
	case overCap:
		refuseBody(writer, request, http.StatusRequestEntityTooLarge, CodePayloadTooLarge,
			fmt.Sprintf("the body must be at most %d bytes", maxBytes))
	default:
		transfer.Abort()
		panic(http.ErrAbortHandler)
	}
}

// refuseBody answers with the error envelope without reading the rest of the body, and on
// HTTP/1.x closes the connection afterwards so the unread rest never has to be drained.
func refuseBody(
	writer http.ResponseWriter,
	request *http.Request,
	status int,
	code, message string,
) {
	if request.ProtoMajor == 1 {
		writer.Header().Set("Connection", "close")
	}

	WriteError(writer, status, code, message, nil)
}
