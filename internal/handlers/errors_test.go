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
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteErrorShape(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	recorder.Header().Set("Content-Length", "42")
	recorder.Header().Set("Content-Encoding", "gzip")

	WriteError(
		recorder,
		http.StatusBadRequest,
		CodeBytesOutOfRange,
		"bytes must be between 1 and 268435456",
		map[string]any{"max": 268435456},
	)

	decoded := assertEnvelope(t, recorder, http.StatusBadRequest, CodeBytesOutOfRange)

	if decoded.Error.Message != "bytes must be between 1 and 268435456" {
		t.Fatalf("message = %q", decoded.Error.Message)
	}

	if maxBytes, ok := decoded.Error.Details["max"].(float64); !ok || maxBytes != 268435456 {
		t.Fatalf("details = %v, want max 268435456", decoded.Error.Details)
	}

	if recorder.Header().Get("Content-Length") != "" ||
		recorder.Header().Get("Content-Encoding") != "" {
		t.Fatalf("stale body headers survived: %v", recorder.Header())
	}

	// Exactly one top-level key, and the body keys of section 7 in its order.
	want := `{"error":{"code":"bytes_out_of_range","message":"bytes must be between 1 and 268435456",` +
		`"details":{"max":268435456}}}`
	if recorder.Body.String() != want {
		t.Fatalf("body = %s, want %s", recorder.Body.String(), want)
	}
}

func TestWriteErrorOmitsEmptyDetails(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	WriteError(recorder, http.StatusNotFound, CodeNotFound, "not found", nil)

	assertEnvelope(t, recorder, http.StatusNotFound, CodeNotFound)

	var raw map[string]map[string]json.RawMessage

	err := json.Unmarshal(recorder.Body.Bytes(), &raw)
	if err != nil {
		t.Fatal(err)
	}

	if _, present := raw["error"]["details"]; present {
		t.Fatalf("body = %s, want no details", recorder.Body.String())
	}
}

func TestWriteErrorUnencodableDetailsAre500(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	WriteError(
		recorder,
		http.StatusBadRequest,
		CodeBadRequest,
		"bad request",
		map[string]any{"broken": make(chan int)},
	)

	assertEnvelope(t, recorder, http.StatusInternalServerError, CodeInternal)
}

func TestErrorWriterDelegates(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	ErrorWriter{}.WriteError(
		recorder,
		http.StatusTooManyRequests,
		CodeTooManyStreams,
		"too many concurrent streams",
		nil,
	)

	assertEnvelope(t, recorder, http.StatusTooManyRequests, CodeTooManyStreams)
}
