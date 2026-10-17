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
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/leinardi/bitgauge/internal/metrics"
)

// maxBuckets is the most cells one upload can span: the 1200 cells of its lifetime, plus one
// when it starts mid-cell (wire-protocol.md section 4).
const maxBuckets = int64(UploadLifetime/cellDuration) + 1

// errLifetime stops the drain of a body still arriving when its lifetime ends.
var errLifetime = errors.New("upload lifetime exceeded")

// telemetry is the upload response of wire-protocol.md section 4: exactly these seven keys.
type telemetry struct {
	Epoch       string  `json:"epoch"`
	BucketMs    int     `json:"bucketMs"`
	FirstBucket int64   `json:"firstBucket"`
	Buckets     []int64 `json:"buckets"`
	Bytes       int64   `json:"bytes"`
	StartMs     int64   `json:"startMs"`
	DurationMs  int64   `json:"durationMs"`
}

// arrivals counts one body's reads into the cells of the grid in which they returned. It lives
// only for the request.
type arrivals struct {
	grid      *Grid
	deadline  time.Time
	first     time.Time
	last      time.Time
	counts    []int64
	firstCell int64
	started   bool
}

// record counts read bytes into the cell of the instant the read returned. A read returning at
// or after the deadline is refused, which also keeps the counts within maxBuckets.
func (a *arrivals) record(read int) error {
	now := a.grid.Now()
	if !now.Before(a.deadline) {
		return errLifetime
	}

	cell := a.grid.Cell(now)
	if !a.started {
		a.started, a.first, a.firstCell = true, now, cell
	}

	a.last = now

	index := cell - a.firstCell
	if index >= maxBuckets {
		return errLifetime
	}

	for int64(len(a.counts)) <= index {
		a.counts = append(a.counts, 0)
	}

	a.counts[index] += int64(read)

	return nil
}

// Upload answers POST /api/v1/upload (wire-protocol.md section 3.2): it drains the whole body
// before responding, counting each read into the grid cell in which it returned, and answers
// with the telemetry and Server-Timing. A missing Content-Length is 411 and one above maxBytes
// is 413, both without reading. The body must arrive within lifetime of handler entry, enforced
// by a read deadline and by the grid's clock; otherwise the answer is 408 with no telemetry.
// lifetime is UploadLifetime outside tests. transfer counts the drain, a body cut at its
// lifetime as a timeout, and a client gone mid-body as an abort.
func Upload(
	grid *Grid,
	epoch Epoch,
	maxBytes int64,
	lifetime time.Duration,
	transfer metrics.Transfer,
) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		entry := grid.Now()

		if !declaresLength(request) {
			refuseBody(writer, request, http.StatusLengthRequired, CodeLengthRequired,
				"Content-Length is required")

			return
		}

		if request.ContentLength > maxBytes {
			refuseBody(writer, request, http.StatusRequestEntityTooLarge, CodePayloadTooLarge,
				fmt.Sprintf("the body must be at most %d bytes", maxBytes))

			return
		}

		counter := &arrivals{grid: grid, deadline: entry.Add(lifetime), counts: []int64{}}

		err := http.NewResponseController(writer).SetReadDeadline(counter.deadline)
		if err != nil {
			// Without the deadline a stalled body would hold the handler forever.
			refuseBody(writer, request, http.StatusInternalServerError, CodeInternal,
				"internal server error")

			return
		}

		total, err := Drain(writer, request, maxBytes, transfer, counter.record)
		if err != nil {
			answerDrainError(writer, request, err, maxBytes, transfer)

			return
		}

		writeTelemetry(writer, epoch, counter, total, entry)
	}
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

// writeTelemetry answers a drained body. An empty body has no first byte: its timeline point
// is the handler's entry and its bucket list is empty.
func writeTelemetry(
	writer http.ResponseWriter,
	epoch Epoch,
	counter *arrivals,
	total int64,
	entry time.Time,
) {
	start, durationMs := entry, int64(0)
	if counter.started {
		start, durationMs = counter.first, counter.last.Sub(counter.first).Milliseconds()
	}

	startMs := counter.grid.Ms(start)

	body, err := json.Marshal(telemetry{
		Epoch:       epoch.ID,
		BucketMs:    BucketMs,
		FirstBucket: counter.grid.Cell(start),
		Buckets:     counter.counts,
		Bytes:       total,
		StartMs:     startMs,
		DurationMs:  durationMs,
	})
	if err != nil {
		WriteError(writer, http.StatusInternalServerError, CodeInternal, "encode telemetry", nil)

		return
	}

	header := writer.Header()
	header["Cache-Control"] = noStore
	header["Content-Type"] = jsonType
	header.Set("Server-Timing", "bg-recv;dur="+strconv.FormatInt(durationMs, decimalBase))

	writer.WriteHeader(http.StatusOK)

	// A failed write means the client is gone; there is nobody left to tell.
	_, _ = writer.Write(body)
}
