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
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPing(t *testing.T) {
	t.Parallel()

	for _, method := range []string{http.MethodGet, http.MethodHead} {
		recorder := httptest.NewRecorder()
		Ping(recorder, httptest.NewRequestWithContext(t.Context(), method, "/api/v1/ping", nil))

		if recorder.Code != http.StatusNoContent || recorder.Body.Len() != 0 {
			t.Fatalf("%s: status %d with %d body bytes, want 204 and no body",
				method, recorder.Code, recorder.Body.Len())
		}

		if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
			t.Fatalf("%s: Cache-Control = %q, want no-store", method, got)
		}
	}
}

func TestSmall(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	Small(
		recorder,
		httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/v1/small", nil),
	)

	if recorder.Code != http.StatusOK || recorder.Body.Len() != 1 {
		t.Fatalf("status %d with %d body bytes, want 200 and one byte",
			recorder.Code, recorder.Body.Len())
	}

	for name, want := range map[string]string{
		"Cache-Control":  "no-store",
		"Content-Length": "1",
		"Content-Type":   "application/octet-stream",
	} {
		if got := recorder.Header().Get(name); got != want {
			t.Fatalf("%s = %q, want %q", name, got, want)
		}
	}
}

func TestProbesAllocateNothing(t *testing.T) {
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/v1/small", nil)
	writer := newRecordingWriter()
	writer.discard = true

	for name, handler := range map[string]http.HandlerFunc{"ping": Ping, "small": Small} {
		allocs := testing.AllocsPerRun(100, func() {
			handler(writer, request)
		})

		if allocs != 0 {
			t.Fatalf("%s allocates %v times per request, want 0", name, allocs)
		}
	}
}
