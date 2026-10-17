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
