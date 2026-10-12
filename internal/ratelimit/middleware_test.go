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
	"bytes"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"

	"github.com/leinardi/bitgauge/internal/clientip"
)

var errUnexpected = errors.New("unexpected failure")

// recordingWriter stands in for the handlers' envelope writer.
type recordingWriter struct {
	status int
	code   string
}

func (w *recordingWriter) WriteError(
	writer http.ResponseWriter,
	status int,
	code, message string,
	_ map[string]any,
) {
	w.status, w.code = status, code
	writer.WriteHeader(status)
	_, _ = io.WriteString(writer, message)
}

// forbiddenBody fails the test if the limiter reads a refused request's body.
type forbiddenBody struct {
	t *testing.T
}

func (b forbiddenBody) Read([]byte) (int, error) {
	b.t.Error("the body of a refused request was read")

	return 0, io.EOF
}

func limitedRequest(t *testing.T, client string, protoMajor int, body io.Reader) *http.Request {
	t.Helper()

	request := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/upload", body)
	request.ProtoMajor = protoMajor
	request.ProtoMinor = 0

	if protoMajor == 1 {
		request.ProtoMinor = 1
	}

	return request.WithContext(clientip.WithAddr(request.Context(), netip.MustParseAddr(client)))
}

func TestMiddlewareRefusesWith429BeforeReadingTheBody(t *testing.T) {
	t.Parallel()

	for _, protoMajor := range []int{1, 2} {
		limiter := New(
			Options{MaxStreams: 1, RequestsPerMinute: 1200, TrackedClients: 16, MaxFlows: 1},
			newFakeClock(),
		)
		envelope := &recordingWriter{}

		blocked := make(chan struct{})
		inHandler := make(chan struct{})

		handler := Middleware(
			limiter,
			envelope,
			slog.New(slog.DiscardHandler),
		)(
			http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				close(inHandler)
				<-blocked
				writer.WriteHeader(http.StatusOK)
			}),
		)

		done := make(chan struct{})

		go func() {
			defer close(done)

			handler.ServeHTTP(
				httptest.NewRecorder(),
				limitedRequest(t, "10.0.0.1", protoMajor, strings.NewReader("x")),
			)
		}()

		<-inHandler

		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, limitedRequest(t, "10.0.0.1", protoMajor, forbiddenBody{t: t}))

		if recorder.Code != http.StatusTooManyRequests || envelope.code != CodeTooManyStreams {
			t.Fatalf(
				"HTTP/%d: status %d code %q, want 429 too_many_streams",
				protoMajor,
				recorder.Code,
				envelope.code,
			)
		}

		if recorder.Header().Get("Retry-After") != "1" {
			t.Fatalf(
				"HTTP/%d: Retry-After = %q, want 1",
				protoMajor,
				recorder.Header().Get("Retry-After"),
			)
		}

		wantConnection := ""
		if protoMajor == 1 {
			wantConnection = "close"
		}

		if got := recorder.Header().Get("Connection"); got != wantConnection {
			t.Fatalf("HTTP/%d: Connection = %q, want %q", protoMajor, got, wantConnection)
		}

		close(blocked)
		<-done

		// The finished request released its slot.
		recorder = httptest.NewRecorder()
		handler2 := Middleware(
			limiter,
			envelope,
			slog.New(slog.DiscardHandler),
		)(
			http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				writer.WriteHeader(http.StatusNoContent)
			}),
		)
		handler2.ServeHTTP(
			recorder,
			limitedRequest(t, "10.0.0.1", protoMajor, strings.NewReader("x")),
		)

		if recorder.Code != http.StatusNoContent {
			t.Fatalf(
				"HTTP/%d: slot not released after the request ended: %d",
				protoMajor,
				recorder.Code,
			)
		}
	}
}

func TestMiddlewareReleasesOnPanic(t *testing.T) {
	t.Parallel()

	limiter := New(
		Options{MaxStreams: 1, RequestsPerMinute: 1200, TrackedClients: 16, MaxFlows: 1},
		newFakeClock(),
	)
	envelope := &recordingWriter{}

	panicking := Middleware(
		limiter,
		envelope,
		slog.New(slog.DiscardHandler),
	)(
		http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			panic(http.ErrAbortHandler)
		}),
	)

	func() {
		defer func() { _ = recover() }()

		panicking.ServeHTTP(
			httptest.NewRecorder(),
			limitedRequest(t, "10.0.0.1", 1, strings.NewReader("x")),
		)
	}()

	release, err := limiter.AcquireStream(netip.MustParseAddr("10.0.0.1"))
	if err != nil {
		t.Fatalf("the aborted request kept its slot: %v", err)
	}

	release()
}

func TestRefuseLogsEveryTableFull(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer

	log := slog.New(slog.NewTextHandler(&logs, nil))
	envelope := &recordingWriter{}

	for range 2 {
		recorder := httptest.NewRecorder()
		Refuse(
			recorder,
			limitedRequest(t, "10.0.0.9", 1, nil),
			&LimitError{err: ErrTableFull, RetryAfter: 1, Code: CodeTableFull},
			envelope,
			log,
		)

		if recorder.Code != http.StatusTooManyRequests || envelope.code != CodeTableFull {
			t.Fatalf("status %d code %q, want 429 table_full", recorder.Code, envelope.code)
		}
	}

	// A refusal of another kind is not logged.
	Refuse(
		httptest.NewRecorder(),
		limitedRequest(t, "10.0.0.9", 1, nil),
		&LimitError{err: ErrStreams, RetryAfter: 1, Code: CodeTooManyStreams},
		envelope,
		log,
	)

	if strings.Count(logs.String(), "level=WARN") != 2 {
		t.Fatalf("logs = %q, want one warn line per table_full refusal", logs.String())
	}

	if strings.Contains(logs.String(), "10.0.0.9") {
		t.Fatal("the warn line names a client IP")
	}
}

func TestRefuseOtherErrorsAre500(t *testing.T) {
	t.Parallel()

	envelope := &recordingWriter{}
	recorder := httptest.NewRecorder()
	Refuse(
		recorder,
		limitedRequest(t, "10.0.0.1", 1, nil),
		errUnexpected,
		envelope,
		slog.New(slog.DiscardHandler),
	)

	if recorder.Code != http.StatusInternalServerError ||
		recorder.Header().Get("Retry-After") != "" {
		t.Fatalf(
			"status %d, Retry-After %q; want 500 without Retry-After",
			recorder.Code,
			recorder.Header().Get("Retry-After"),
		)
	}
}

func TestRealClockMovesForward(t *testing.T) {
	t.Parallel()

	var clock RealClock

	first := clock.Now()
	if clock.Now().Before(first) {
		t.Fatal("RealClock went backwards")
	}
}
