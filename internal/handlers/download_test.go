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
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

const testMaxBytes = 5000

func download(t *testing.T, query string) *httptest.ResponseRecorder {
	t.Helper()

	recorder := httptest.NewRecorder()
	Download(newBuffer(1000, time.Second), testMaxBytes)(
		recorder,
		httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/v1/download?"+query, nil),
	)

	return recorder
}

func TestDownloadWritesExactlyN(t *testing.T) {
	t.Parallel()

	buffer := newBuffer(1000, time.Second)
	handler := Download(buffer, testMaxBytes)

	for _, test := range []struct {
		query string
		size  int
	}{
		{"bytes=1", 1},
		{"bytes=2500", 2500},
		{"bytes=5000", testMaxBytes},
		{"bytes=0007", 7},
		{"other=1&bytes=12", 12},
		{"bytes=9&bytes=abc", 9},
		// Percent-decoded like url.ParseQuery; malformed pairs are skipped.
		{"bytes=%35", 5},
		{"byt%65s=8", 8},
		{"bytes=%zz&bytes=3", 3},
		{"bytes=1;x&bytes=4", 4},
	} {
		writer := newRecordingWriter()
		handler(writer, httptest.NewRequestWithContext(
			t.Context(), http.MethodGet, "/api/v1/download?"+test.query, nil))

		if writer.status != http.StatusOK || writer.body.Len() != test.size {
			t.Fatalf("%s: status %d with %d bytes, want 200 and %d",
				test.query, writer.status, writer.body.Len(), test.size)
		}

		for name, want := range map[string]string{
			"Content-Length": strconv.Itoa(test.size),
			"Cache-Control":  "no-store",
			"Content-Type":   "application/octet-stream",
		} {
			if got := writer.header.Get(name); got != want {
				t.Fatalf("%s: %s = %q, want %q", test.query, name, got, want)
			}
		}

		if _, present := writer.header["Content-Encoding"]; present {
			t.Fatalf("%s: a Content-Encoding header was set", test.query)
		}
	}
}

func TestDownloadBadRequests(t *testing.T) {
	t.Parallel()

	for _, query := range []string{
		"", "other=5", "bytes", "bytes=", "bytes=abc", "bytes=1.5", "bytes=+5", "bytes=0x10",
		"bytes=1e3", "bytes=-", "bytes=%205", "bytes=%2B5", "bytes=%zz", "bytes=4;x",
	} {
		decoded := assertEnvelope(t, download(t, query), http.StatusBadRequest, CodeBadRequest)
		if decoded.Error.Details != nil {
			t.Fatalf("%q: details %v, want none", query, decoded.Error.Details)
		}
	}
}

func TestDownloadOutOfRange(t *testing.T) {
	t.Parallel()

	for _, query := range []string{
		"bytes=0", "bytes=-0", "bytes=-5", "bytes=5001",
		"bytes=99999999999999999999999999999999",
	} {
		decoded := assertEnvelope(
			t,
			download(t, query),
			http.StatusBadRequest,
			CodeBytesOutOfRange,
		)

		if maxBytes, ok := decoded.Error.Details["max"].(float64); !ok || maxBytes != testMaxBytes {
			t.Fatalf("%q: details %v, want max %d", query, decoded.Error.Details, testMaxBytes)
		}

		if decoded.Error.Message != "bytes must be between 1 and 5000" {
			t.Fatalf("%q: message %q", query, decoded.Error.Message)
		}
	}
}

func TestDownloadAllocatesOnlyTheContentLength(t *testing.T) {
	// The formatted Content-Length is a string and its one-element slice (backend.md section
	// 2.1); the body is cut from the shared buffer without allocating.
	const contentLengthAllocs = 2

	handler := Download(NewBuffer(), 1<<30)
	request := httptest.NewRequestWithContext(
		t.Context(), http.MethodGet, "/api/v1/download?bytes=10000000", nil)
	writer := newRecordingWriter()
	writer.discard = true

	allocs := testing.AllocsPerRun(20, func() {
		handler(writer, request)
	})

	if allocs > contentLengthAllocs {
		t.Fatalf("download allocates %v times per request, want at most %d",
			allocs, contentLengthAllocs)
	}
}

func TestDownloadOverHTTP(t *testing.T) {
	t.Parallel()

	const size = 3*BufferSize + 17

	server := httptest.NewServer(Download(NewBuffer(), 1<<30))
	t.Cleanup(server.Close)

	request, err := http.NewRequestWithContext(
		t.Context(),
		http.MethodGet,
		server.URL+"/api/v1/download?bytes="+strconv.Itoa(size),
		http.NoBody,
	)
	if err != nil {
		t.Fatal(err)
	}

	// Ask for compression explicitly: the server must not apply any.
	request.Header.Set("Accept-Encoding", "gzip")

	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = response.Body.Close() })

	received, err := io.Copy(io.Discard, response.Body)
	if err != nil {
		t.Fatal(err)
	}

	if response.StatusCode != http.StatusOK || response.ContentLength != size || received != size {
		t.Fatalf("status %d, Content-Length %d, %d bytes; want 200 and %d",
			response.StatusCode, response.ContentLength, received, size)
	}

	if encoding := response.Header.Get("Content-Encoding"); encoding != "" {
		t.Fatalf("Content-Encoding = %q, want none", encoding)
	}
}
