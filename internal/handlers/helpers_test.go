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
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/leinardi/bitgauge/internal/metrics"
)

// errClientGone is the failure of a write or read whose peer went away.
var errClientGone = errors.New("connection reset by peer")

// noTransfer is the transfer of a handler test that does not look at the metrics.
var noTransfer = metrics.Transfer{}

// fakeClock is the injected clock and timer source of the handler tests: the test sets or
// advances it, and timers that come due fire then, each in its own goroutine as with
// time.AfterFunc. Nothing in these tests waits out a window.
type fakeClock struct {
	now    time.Time
	timers []*fakeTimer
	mu     sync.Mutex
}

type fakeTimer struct {
	at   time.Time
	fire func()
	done bool
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.now
}

func (c *fakeClock) Set(now time.Time) {
	c.mu.Lock()

	c.now = now

	var due []func()

	for _, timer := range c.timers {
		if !timer.done && !timer.at.After(now) {
			timer.done = true
			due = append(due, timer.fire)
		}
	}

	c.mu.Unlock()

	for _, fire := range due {
		go fire()
	}
}

func (c *fakeClock) Advance(elapsed time.Duration) {
	c.Set(c.Now().Add(elapsed))
}

func (c *fakeClock) AfterFunc(d time.Duration, fire func()) func() bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	timer := &fakeTimer{at: c.now.Add(d), fire: fire}
	c.timers = append(c.timers, timer)

	return func() bool {
		c.mu.Lock()
		defer c.mu.Unlock()

		stopped := !timer.done
		timer.done = true

		return stopped
	}
}

// pending is the number of timers that have neither fired nor been stopped.
func (c *fakeClock) pending() int {
	c.mu.Lock()
	defer c.mu.Unlock()

	count := 0

	for _, timer := range c.timers {
		if !timer.done {
			count++
		}
	}

	return count
}

// recordingWriter is an http.ResponseWriter that supports write deadlines, as the server's
// does, and records every write and whether a fresh deadline preceded it.
type recordingWriter struct {
	header        http.Header
	body          bytes.Buffer
	writes        []int
	status        int
	readDeadline  time.Time
	deadlineSet   bool
	writesWithout int
	discard       bool
	// failWrites makes every Write fail, as a client gone away does.
	failWrites bool
	// written is set by the first WriteHeader or Write.
	written bool
}

func newRecordingWriter() *recordingWriter {
	return &recordingWriter{header: http.Header{}}
}

func (w *recordingWriter) Header() http.Header { return w.header }

func (w *recordingWriter) WriteHeader(status int) {
	w.status = status
	w.written = true
}

func (w *recordingWriter) SetReadDeadline(deadline time.Time) error {
	w.readDeadline = deadline

	return nil
}

func (w *recordingWriter) Write(data []byte) (int, error) {
	w.written = true

	if !w.deadlineSet {
		w.writesWithout++
	}

	w.deadlineSet = false

	if w.failWrites {
		return 0, errClientGone
	}

	if !w.discard {
		w.writes = append(w.writes, len(data))
		w.body.Write(data)
	}

	return len(data), nil
}

func (w *recordingWriter) SetWriteDeadline(time.Time) error {
	w.deadlineSet = true

	return nil
}

// errorEnvelope is the decoded shape of wire-protocol.md section 7.
type errorEnvelope struct {
	Error struct {
		Details map[string]any `json:"details"`
		Code    string         `json:"code"`
		Message string         `json:"message"`
	} `json:"error"`
}

// assertEnvelope checks a recorded error response: status, the JSON content type, no-store
// and the code.
func assertEnvelope(
	t *testing.T,
	recorder *httptest.ResponseRecorder,
	status int,
	code string,
) errorEnvelope {
	t.Helper()

	if recorder.Code != status {
		t.Fatalf("status = %d, want %d", recorder.Code, status)
	}

	if got := recorder.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}

	if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}

	var decoded errorEnvelope

	err := json.Unmarshal(recorder.Body.Bytes(), &decoded)
	if err != nil {
		t.Fatalf("body %q is not JSON: %v", recorder.Body.String(), err)
	}

	if decoded.Error.Code != code || decoded.Error.Message == "" {
		t.Fatalf("envelope = %+v, want code %q and a message", decoded.Error, code)
	}

	return decoded
}

// scrape is the metrics' text exposition.
func scrape(t *testing.T, meter *metrics.Metrics) string {
	t.Helper()

	recorder := httptest.NewRecorder()
	meter.Handler(slog.New(slog.DiscardHandler)).ServeHTTP(recorder,
		httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/metrics", nil))

	return recorder.Body.String()
}

// sample is the value of the series a line of the exposition starts with, or "" without one.
func sample(exposition, series string) string {
	for line := range strings.SplitSeq(exposition, "\n") {
		if value, found := strings.CutPrefix(line, series+" "); found {
			return value
		}
	}

	return ""
}
