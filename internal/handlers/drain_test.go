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
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

var errStop = errors.New("stop")

func drainRequest(t *testing.T, body string) *http.Request {
	t.Helper()

	return httptest.NewRequestWithContext(
		t.Context(), http.MethodPost, "/", strings.NewReader(body))
}

func TestDrainCountsEveryRead(t *testing.T) {
	t.Parallel()

	body := strings.Repeat("x", 3*drainBufferSize+10)

	var reads []int

	total, err := Drain(
		httptest.NewRecorder(),
		drainRequest(t, body),
		1<<30,
		noTransfer,
		func(read int) error {
			reads = append(reads, read)

			return nil
		},
	)
	if err != nil || total != int64(len(body)) {
		t.Fatalf("total %d, %v; want %d", total, err, len(body))
	}

	sum := 0

	for _, read := range reads {
		if read <= 0 || read > drainBufferSize {
			t.Fatalf("a read of %d bytes, want 1 to %d", read, drainBufferSize)
		}

		sum += read
	}

	if sum != len(body) {
		t.Fatalf("callbacks counted %d bytes, want %d", sum, len(body))
	}
}

func TestDrainStopsOnCallbackError(t *testing.T) {
	t.Parallel()

	calls := 0

	_, err := Drain(httptest.NewRecorder(), drainRequest(t, strings.Repeat("x", 3*drainBufferSize)),
		1<<30, noTransfer, func(int) error {
			calls++

			return errStop
		})
	if !errors.Is(err, errStop) || calls != 1 {
		t.Fatalf("err %v after %d calls, want errStop after one", err, calls)
	}
}

func TestDrainCutsAtTheCap(t *testing.T) {
	t.Parallel()

	total, err := Drain(httptest.NewRecorder(), drainRequest(t, strings.Repeat("x", 1000)), 600,
		noTransfer, func(int) error { return nil })

	if _, overCap := errors.AsType[*http.MaxBytesError](err); !overCap || total > 600 {
		t.Fatalf("total %d, err %v; want at most 600 bytes and a MaxBytesError", total, err)
	}
}

// chunkedRequest is a request whose body declares no length, as a chunked one does.
func chunkedRequest(t *testing.T, body string) *http.Request {
	t.Helper()

	request := drainRequest(t, body)
	request.ContentLength = -1

	return request
}

func TestDrainBodyReadsALengthlessBodyUpToTheCap(t *testing.T) {
	t.Parallel()

	options := &DrainOptions{Limit: 1000, Lifetime: time.Minute, Transfer: noTransfer}
	writer := newRecordingWriter()

	total, drained := DrainBody(writer, chunkedRequest(t, strings.Repeat("x", 1000)),
		time.Now(), options, nil)
	if !drained || total != 1000 || writer.written {
		t.Fatalf("total %d, drained %v, written %v; want the whole body and no answer",
			total, drained, writer.written)
	}

	writer = newRecordingWriter()

	_, drained = DrainBody(writer, chunkedRequest(t, strings.Repeat("x", 1001)),
		time.Now(), options, nil)
	if drained || writer.status != http.StatusRequestEntityTooLarge ||
		writer.header.Get("Connection") != "close" {
		t.Fatalf("drained %v, status %d, Connection %q; want 413 and close",
			drained, writer.status, writer.header.Get("Connection"))
	}
}

func TestDrainBodyRequiresALengthOnlyWhenAsked(t *testing.T) {
	t.Parallel()

	writer := newRecordingWriter()
	options := &DrainOptions{
		Limit: 1000, Lifetime: time.Minute, RequireLength: true, Transfer: noTransfer,
	}

	_, drained := DrainBody(writer, chunkedRequest(t, "x"), time.Now(), options, nil)
	if drained || writer.status != http.StatusLengthRequired {
		t.Fatalf("drained %v, status %d; want 411", drained, writer.status)
	}
}

func TestDrainBodyRefusesADeclaredLengthOverTheCap(t *testing.T) {
	t.Parallel()

	writer := newRecordingWriter()
	request := drainRequest(t, strings.Repeat("x", 1001))
	entry := time.Date(2026, 10, 19, 8, 0, 0, 0, time.UTC)

	_, drained := DrainBody(writer, request, entry,
		&DrainOptions{Limit: 1000, Lifetime: time.Minute, Transfer: noTransfer}, nil)
	if drained || writer.status != http.StatusRequestEntityTooLarge ||
		!writer.readDeadline.IsZero() {
		t.Fatalf("drained %v, status %d, read deadline %v; want 413 before any deadline",
			drained, writer.status, writer.readDeadline)
	}

	writer = newRecordingWriter()

	_, drained = DrainBody(writer, drainRequest(t, "x"), entry,
		&DrainOptions{Limit: 1000, Lifetime: time.Minute, Transfer: noTransfer}, nil)
	if !drained || !writer.readDeadline.Equal(entry.Add(time.Minute)) {
		t.Fatalf("drained %v, read deadline %v; want entry plus the lifetime",
			drained, writer.readDeadline)
	}
}
