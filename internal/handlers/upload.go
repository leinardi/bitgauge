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
	"net/http"
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
	options := DrainOptions{
		Limit:         maxBytes,
		Lifetime:      lifetime,
		RequireLength: true,
		Transfer:      transfer,
	}

	return func(writer http.ResponseWriter, request *http.Request) {
		entry := grid.Now()
		counter := &arrivals{grid: grid, deadline: entry.Add(lifetime), counts: []int64{}}

		total, drained := DrainBody(writer, request, entry, &options, counter.record)
		if !drained {
			return
		}

		writeTelemetry(writer, epoch, counter, total, entry)
	}
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
	header["Cache-Control"] = NoStore
	header["Content-Type"] = JSONType
	header.Set("Server-Timing", "bg-recv;dur="+strconv.FormatInt(durationMs, decimalBase))

	writer.WriteHeader(http.StatusOK)

	// A failed write means the client is gone; there is nobody left to tell.
	_, _ = writer.Write(body)
}
