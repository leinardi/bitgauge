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
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/leinardi/bitgauge/internal/ratelimit"
)

const (
	// testOffset is K for the upload tests: the grid's origin sits at 123450000 ms, so an entry
	// 6700 ms later is the start of cell 1234567, as in the worked example of section 4.
	testOffset   = 1234500
	exampleEntry = 6700 * time.Millisecond
	testMaxBody  = 1 << 20
)

// fakeClock is the injected clock of the upload tests; the scripted body moves it.
type fakeClock struct {
	now time.Time
	mu  sync.Mutex
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.now
}

func (c *fakeClock) Set(now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.now = now
}

// arrival is one scripted read: it begins at began and returns size bytes at at, both measured
// from the handler's entry. A zero began means the read returns at the instant it begins.
type arrival struct {
	err       error
	began, at time.Duration
	size      int
}

// scriptedBody is an upload body whose reads return at known instants on the fake clock.
type scriptedBody struct {
	clock      *fakeClock
	beforeRead func()
	entry      time.Time
	arrivals   []arrival
	reads      int
}

func (b *scriptedBody) Read(buffer []byte) (int, error) {
	if b.beforeRead != nil {
		b.beforeRead()
	}

	if b.reads == len(b.arrivals) {
		return 0, io.EOF
	}

	next := b.arrivals[b.reads]
	b.reads++

	if next.began != 0 {
		b.clock.Set(b.entry.Add(next.began))
	}

	b.clock.Set(b.entry.Add(next.at))

	return min(next.size, len(buffer)), next.err
}

// uploadRun is one upload against a fake clock: the handler is entered at entry after the
// grid's origin.
type uploadRun struct {
	clock  *fakeClock
	grid   *Grid
	body   *scriptedBody
	writer *recordingWriter
	origin time.Time
	// withoutLengthHeader sends the request without a Content-Length header, as net/http
	// presents a request that declared no length and no chunking.
	withoutLengthHeader bool
}

func newUploadRun(entry time.Duration, arrivals ...arrival) *uploadRun {
	origin := time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)
	clock := &fakeClock{now: origin}
	grid := NewGrid(clock, testOffset)
	clock.Set(origin.Add(entry))

	return &uploadRun{
		clock:  clock,
		grid:   grid,
		origin: origin,
		writer: newRecordingWriter(),
		body:   &scriptedBody{clock: clock, entry: origin.Add(entry), arrivals: arrivals},
	}
}

func (r *uploadRun) serve(t *testing.T, contentLength int64) {
	t.Helper()

	request := httptest.NewRequestWithContext(
		t.Context(),
		http.MethodPost,
		"/api/v1/upload",
		r.body,
	)
	request.ContentLength = contentLength

	if contentLength >= 0 && !r.withoutLengthHeader {
		request.Header.Set("Content-Length", strconv.FormatInt(contentLength, 10))
	}

	Upload(r.grid, Epoch{ID: "k3V9qW2rT0aY", GridOffset: testOffset}, testMaxBody, UploadLifetime)(
		r.writer, request)
}

// telemetryOf checks a successful upload's status, headers and keys and decodes its body.
func telemetryOf(t *testing.T, writer *recordingWriter) telemetry {
	t.Helper()

	if writer.status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %s", writer.status, writer.body.String())
	}

	var keys map[string]json.RawMessage

	err := json.Unmarshal(writer.body.Bytes(), &keys)
	if err != nil || len(keys) != 7 {
		t.Fatalf(
			"body %s: want exactly the seven keys of section 4 (%v)",
			writer.body.String(),
			err,
		)
	}

	var decoded telemetry

	err = json.Unmarshal(writer.body.Bytes(), &decoded)
	if err != nil {
		t.Fatal(err)
	}

	if got, want := writer.header.Get(
		"Server-Timing",
	), "bg-recv;dur="+strconv.FormatInt(
		decoded.DurationMs,
		10,
	); got != want {
		t.Fatalf("Server-Timing = %q, want %q", got, want)
	}

	if writer.header.Get("Cache-Control") != "no-store" ||
		writer.header.Get("Content-Type") != "application/json" {
		t.Fatalf("headers = %v, want no-store JSON", writer.header)
	}

	var sum int64
	for _, count := range decoded.Buckets {
		sum += count
	}

	if decoded.BucketMs != 100 || sum != decoded.Bytes ||
		decoded.FirstBucket != decoded.StartMs/100 || len(decoded.Buckets) > 1201 {
		t.Fatalf("telemetry %+v breaks an invariant of section 4", decoded)
	}

	return decoded
}

func TestUploadWorkedExample(t *testing.T) {
	t.Parallel()

	// 120 KiB at a steady 120 KiB/s: the first byte is read 50 ms into cell 1234567, one read
	// lands in the middle of each of the nine full cells, and the last byte is read 50 ms into
	// cell 1234577.
	arrivals := make([]arrival, 0, 11)
	arrivals = append(arrivals, arrival{at: 50 * time.Millisecond, size: 6144})

	for cell := range 9 {
		arrivals = append(arrivals, arrival{
			at:   time.Duration(150+100*cell) * time.Millisecond,
			size: 12288,
		})
	}

	arrivals = append(arrivals, arrival{at: 1050 * time.Millisecond, size: 6144})

	run := newUploadRun(exampleEntry, arrivals...)
	run.serve(t, 122880)
	telemetryOf(t, run.writer)

	want := `{"epoch":"k3V9qW2rT0aY","bucketMs":100,"firstBucket":1234567,` +
		`"buckets":[6144,12288,12288,12288,12288,12288,12288,12288,12288,12288,6144],` +
		`"bytes":122880,"startMs":123456750,"durationMs":1000}`
	if run.writer.body.String() != want {
		t.Fatalf("telemetry = %s\nwant        %s", run.writer.body.String(), want)
	}
}

func TestUploadTelemetry(t *testing.T) {
	t.Parallel()

	run := newUploadRun(exampleEntry,
		arrival{at: 20 * time.Millisecond, size: 100},
		arrival{at: 99 * time.Millisecond, size: 200},
		// Begins in the first cell and returns in the second: it counts where it returned.
		arrival{began: 99 * time.Millisecond, at: 100 * time.Millisecond, size: 300},
		// The third cell has no read and stays zero.
		arrival{at: 350 * time.Millisecond, size: 400},
	)
	run.serve(t, 1000)

	got := telemetryOf(t, run.writer)
	want := telemetry{
		Epoch:       "k3V9qW2rT0aY",
		BucketMs:    100,
		FirstBucket: 1234567,
		Buckets:     []int64{300, 300, 0, 400},
		Bytes:       1000,
		StartMs:     123456720,
		DurationMs:  330,
	}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("telemetry = %+v, want %+v", got, want)
	}
}

func TestUploadAtMost1201Buckets(t *testing.T) {
	t.Parallel()

	// Entered mid-cell, a body whose last read returns just inside the lifetime spans the
	// 1200 cells of the lifetime plus the partial one it started in.
	entry := exampleEntry + 50*time.Millisecond
	run := newUploadRun(entry,
		arrival{at: 0, size: 1},
		arrival{at: UploadLifetime - time.Millisecond, size: 1},
	)
	run.serve(t, 2)

	got := telemetryOf(t, run.writer)
	if len(got.Buckets) != 1201 || got.Buckets[0] != 1 || got.Buckets[1200] != 1 {
		t.Fatalf("%d buckets, want 1201 with a byte at each end", len(got.Buckets))
	}
}

func TestUploadLifetimeIs408WithoutTelemetry(t *testing.T) {
	t.Parallel()

	run := newUploadRun(exampleEntry,
		arrival{at: time.Second, size: 10},
		arrival{at: UploadLifetime, size: 10},
		arrival{at: UploadLifetime + time.Second, size: 10},
	)
	run.serve(t, 30)

	if run.writer.status != http.StatusRequestTimeout ||
		!strings.Contains(run.writer.body.String(), `"code":"request_timeout"`) {
		t.Fatalf(
			"status %d body %s, want the 408 envelope",
			run.writer.status,
			run.writer.body.String(),
		)
	}

	if strings.Contains(run.writer.body.String(), "buckets") ||
		run.writer.header.Get("Server-Timing") != "" {
		t.Fatal("a 408 carried telemetry")
	}

	if run.writer.header.Get("Connection") != "close" || run.body.reads != 2 {
		t.Fatalf("Connection %q after %d reads, want close after the read past the lifetime",
			run.writer.header.Get("Connection"), run.body.reads)
	}
}

func TestUploadSetsTheReadDeadlineAtEntry(t *testing.T) {
	t.Parallel()

	run := newUploadRun(exampleEntry, arrival{at: time.Second, size: 10})
	entry := run.clock.Now()
	run.body.beforeRead = func() {
		if !run.writer.readDeadline.Equal(entry.Add(UploadLifetime)) {
			t.Errorf("read deadline %v before a read, want entry + 120 s", run.writer.readDeadline)
		}
	}
	run.serve(t, 10)
	telemetryOf(t, run.writer)
}

func TestUploadDrainsBeforeResponding(t *testing.T) {
	t.Parallel()

	run := newUploadRun(exampleEntry,
		arrival{at: 10 * time.Millisecond, size: 4000},
		arrival{at: 20 * time.Millisecond, size: 4000},
	)
	run.body.beforeRead = func() {
		if run.writer.written {
			t.Errorf("the response was written before read %d", run.body.reads+1)
		}
	}
	run.serve(t, 8000)

	// The last read call is the one that returned the end of the body.
	if run.body.reads != 2 || telemetryOf(t, run.writer).Bytes != 8000 {
		t.Fatalf("%d reads", run.body.reads)
	}
}

func TestUploadRefusesBeforeReading(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		code          string
		contentLength int64
		status        int
		noHeader      bool
	}{
		// Chunked: net/http reports the length as unknown.
		{CodeLengthRequired, -1, http.StatusLengthRequired, false},
		// No length and no chunking: net/http reports 0, and only the header is missing.
		{CodeLengthRequired, 0, http.StatusLengthRequired, true},
		{CodePayloadTooLarge, testMaxBody + 1, http.StatusRequestEntityTooLarge, false},
	} {
		run := newUploadRun(exampleEntry, arrival{at: time.Millisecond, size: 1})
		run.withoutLengthHeader = test.noHeader
		run.body.beforeRead = func() {
			t.Errorf("Content-Length %d: the body was read", test.contentLength)
		}
		run.serve(t, test.contentLength)

		if run.writer.status != test.status ||
			!strings.Contains(run.writer.body.String(), `"code":"`+test.code+`"`) ||
			run.writer.header.Get("Connection") != "close" {
			t.Fatalf("Content-Length %d: status %d, body %s, Connection %q",
				test.contentLength, run.writer.status, run.writer.body.String(),
				run.writer.header.Get("Connection"))
		}
	}
}

func TestUploadAbortsWhenTheClientGoesAway(t *testing.T) {
	t.Parallel()

	// A client that half-closes after 10 of the 100 declared bytes.
	run := newUploadRun(exampleEntry,
		arrival{at: time.Millisecond, size: 10},
		arrival{at: 2 * time.Millisecond, err: io.ErrUnexpectedEOF},
	)

	defer func() {
		// net/http closes the connection, or resets the stream, on this panic.
		recovered, _ := recover().(error)
		if !errors.Is(recovered, http.ErrAbortHandler) {
			t.Fatalf("recovered %v, want http.ErrAbortHandler", recovered)
		}

		if run.writer.written {
			t.Fatal("a response was written to a client that went away")
		}
	}()

	run.serve(t, 100)
}

func TestUploadLyingContentLengthIsBounded(t *testing.T) {
	t.Parallel()

	// Declared within the cap, the body keeps coming past it: reading stops at the cap.
	arrivals := make([]arrival, 0, 40)
	for index := range 40 {
		arrivals = append(
			arrivals,
			arrival{at: time.Duration(index+1) * time.Millisecond, size: 64 << 10},
		)
	}

	run := newUploadRun(exampleEntry, arrivals...)
	run.serve(t, 100)

	if run.writer.status != http.StatusRequestEntityTooLarge ||
		run.writer.header.Get("Connection") != "close" {
		t.Fatalf("status %d, Connection %q; want 413 and close",
			run.writer.status, run.writer.header.Get("Connection"))
	}

	if run.body.reads > testMaxBody/(64<<10)+1 {
		t.Fatalf("%d reads of 64 KiB, want reading to stop at the 1 MiB cap", run.body.reads)
	}
}

func TestUploadEmptyBody(t *testing.T) {
	t.Parallel()

	run := newUploadRun(exampleEntry)
	run.serve(t, 0)

	want := `{"epoch":"k3V9qW2rT0aY","bucketMs":100,"firstBucket":1234567,"buckets":[],` +
		`"bytes":0,"startMs":123456700,"durationMs":0}`

	telemetryOf(t, run.writer)

	if run.writer.body.String() != want {
		t.Fatalf("telemetry = %s, want %s", run.writer.body.String(), want)
	}
}

func TestUploadWithoutReadDeadlinesIs500(t *testing.T) {
	t.Parallel()

	clock := &fakeClock{now: time.Now()}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequestWithContext(
		t.Context(), http.MethodPost, "/api/v1/upload", strings.NewReader("abc"))

	Upload(NewGrid(clock, 0), NewEpoch(), testMaxBody, UploadLifetime)(recorder, request)

	assertEnvelope(t, recorder, http.StatusInternalServerError, CodeInternal)
}

func TestUploadEpochStablePerProcess(t *testing.T) {
	t.Parallel()

	clock := &fakeClock{now: time.Now()}
	grid := NewGrid(clock, 0)
	epochs := map[string]int{}

	// Two instances, two uploads each.
	for _, epoch := range []Epoch{NewEpoch(), NewEpoch()} {
		handler := Upload(grid, epoch, testMaxBody, UploadLifetime)

		for range 2 {
			writer := newRecordingWriter()
			request := httptest.NewRequestWithContext(
				t.Context(), http.MethodPost, "/api/v1/upload", strings.NewReader("ab"))
			handler(writer, request)

			got := telemetryOf(t, writer)
			if got.Epoch != epoch.ID {
				t.Fatalf("epoch %q, want the instance's %q", got.Epoch, epoch.ID)
			}

			epochs[got.Epoch]++
		}
	}

	if len(epochs) != 2 {
		t.Fatalf("epochs %v, want one per instance", epochs)
	}
}

func TestUploadOverHTTP(t *testing.T) {
	t.Parallel()

	const size = 3<<20 + 5

	server := httptest.NewServer(
		Upload(NewGrid(ratelimit.RealClock{}, 77), NewEpoch(), 1<<30, UploadLifetime),
	)
	t.Cleanup(server.Close)

	request, err := http.NewRequestWithContext(
		t.Context(), http.MethodPost, server.URL, bytes.NewReader(make([]byte, size)))
	if err != nil {
		t.Fatal(err)
	}

	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = response.Body.Close() })

	var got telemetry

	err = json.NewDecoder(response.Body).Decode(&got)
	if err != nil || response.StatusCode != http.StatusOK || got.Bytes != size {
		t.Fatalf("status %d, %+v, %v; want 200 and %d bytes", response.StatusCode, got, err, size)
	}

	if want := "bg-recv;dur=" + strconv.FormatInt(
		got.DurationMs,
		10,
	); response.Header.Get(
		"Server-Timing",
	) != want {
		t.Fatalf("Server-Timing = %q, want %q", response.Header.Get("Server-Timing"), want)
	}
}

func TestUploadStalledBodyIsCutByTheReadDeadline(t *testing.T) {
	t.Parallel()

	// No fake clock reaches the network poller, so this is the one test of the read deadline
	// itself, and it runs on real time with a short lifetime in place of the 120 s one, whose
	// value the fake-clock tests cover.
	const lifetime = 300 * time.Millisecond

	server := httptest.NewServer(
		Upload(NewGrid(ratelimit.RealClock{}, 0), NewEpoch(), 1<<30, lifetime),
	)
	t.Cleanup(server.Close)

	var dialer net.Dialer

	conn, err := dialer.DialContext(t.Context(), "tcp", server.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = conn.Close() })

	// A failsafe against a hang, far above the deadline under test; not a wait for state.
	err = conn.SetReadDeadline(time.Now().Add(30 * time.Second))
	if err != nil {
		t.Fatal(err)
	}

	// Ten of the hundred declared bytes, then nothing.
	_, err = conn.Write(
		[]byte("POST / HTTP/1.1\r\nHost: test\r\nContent-Length: 100\r\n\r\n0123456789"),
	)
	if err != nil {
		t.Fatal(err)
	}

	reader := bufio.NewReader(conn)

	response, err := http.ReadResponse(reader, nil)
	if err != nil {
		t.Fatal(err)
	}

	body, err := io.ReadAll(response.Body)
	_ = response.Body.Close()

	if err != nil || response.StatusCode != http.StatusRequestTimeout ||
		!strings.Contains(
			string(body),
			`"code":"request_timeout"`,
		) || response.Header.Get("Server-Timing") != "" {
		t.Fatalf("status %d, body %s, %v; want the 408 envelope without telemetry",
			response.StatusCode, body, err)
	}

	// The server closes the connection after the 408.
	_, err = reader.ReadByte()
	if !errors.Is(err, io.EOF) {
		t.Fatalf("read after the 408: %v, want the connection closed", err)
	}
}

func TestUploadWithoutLengthOverHTTPIs411(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(
		Upload(NewGrid(ratelimit.RealClock{}, 0), NewEpoch(), 1<<30, UploadLifetime),
	)
	t.Cleanup(server.Close)

	for name, head := range map[string]string{
		"no length":  "POST / HTTP/1.1\r\nHost: test\r\n\r\n",
		"chunked":    "POST / HTTP/1.1\r\nHost: test\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nabcde\r\n0\r\n\r\n",
		"declared 0": "POST / HTTP/1.1\r\nHost: test\r\nContent-Length: 0\r\n\r\n",
	} {
		var dialer net.Dialer

		conn, err := dialer.DialContext(t.Context(), "tcp", server.Listener.Addr().String())
		if err != nil {
			t.Fatal(err)
		}

		_, err = conn.Write([]byte(head))
		if err != nil {
			t.Fatal(err)
		}

		response, err := http.ReadResponse(bufio.NewReader(conn), nil)
		if err != nil {
			t.Fatal(err)
		}

		_ = response.Body.Close()
		_ = conn.Close()

		want := http.StatusLengthRequired
		if name == "declared 0" {
			want = http.StatusOK
		}

		if response.StatusCode != want {
			t.Fatalf("%s: status %d, want %d", name, response.StatusCode, want)
		}
	}
}
