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
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/leinardi/bitgauge/internal/buildinfo"
	"github.com/leinardi/bitgauge/internal/metrics"
	"github.com/leinardi/bitgauge/internal/ratelimit"
)

const (
	downloadSeries = `{direction="download",group="api"}`
	uploadSeries   = `{direction="upload",group="api"}`
)

func newMeter() *metrics.Metrics {
	return metrics.New(buildinfo.Build{}, nil, nil)
}

func expectSamples(t *testing.T, meter *metrics.Metrics, want map[string]string) {
	t.Helper()

	exposition := scrape(t, meter)
	for series, value := range want {
		if got := sample(exposition, series); got != value {
			t.Errorf("%s = %q, want %q", series, got, value)
		}
	}
}

func TestDownloadCountsItsTransfer(t *testing.T) {
	t.Parallel()

	meter := newMeter()
	handler := Download(NewBuffer(), 1<<30, meter.Transfer(metrics.GroupAPI, metrics.Download))
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet,
		"/api/v1/download?bytes=100000", nil)

	handler(newRecordingWriter(), request)

	gone := newRecordingWriter()
	gone.failWrites = true
	handler(gone, request)

	expectSamples(t, meter, map[string]string{
		"bitgauge_transfer_bytes_total" + downloadSeries: "100000",
		"bitgauge_active_transfers" + downloadSeries:     "0",
		"bitgauge_http_aborts_total" + downloadSeries:    "1",
	})
}

// failingBody ends with a reset after its first bytes, as a client that goes away mid-body.
type failingBody struct {
	sent bool
}

func (b *failingBody) Read(data []byte) (int, error) {
	if b.sent {
		return 0, errClientGone
	}

	b.sent = true

	return copy(data, "abc"), nil
}

func uploadRequest(t *testing.T, body io.Reader, length int64) *http.Request {
	t.Helper()

	request := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/upload", body)
	request.ContentLength = length

	return request
}

func TestUploadCountsItsTransfer(t *testing.T) {
	t.Parallel()

	meter := newMeter()
	transfer := meter.Transfer(metrics.GroupAPI, metrics.Upload)
	clock := &fakeClock{now: time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)}
	grid := NewGrid(clock, 0)

	drained := newRecordingWriter()
	Upload(grid, NewEpoch(), 1<<20, UploadLifetime, transfer)(drained,
		uploadRequest(t, strings.NewReader("abcdef"), 6))

	if drained.status != http.StatusOK {
		t.Fatalf("drained upload answered %d", drained.status)
	}

	// A lifetime that has already ended cuts the body at its first read: a timeout.
	timedOut := newRecordingWriter()
	Upload(grid, NewEpoch(), 1<<20, 0, transfer)(timedOut,
		uploadRequest(t, strings.NewReader("abc"), 3))

	if timedOut.status != http.StatusRequestTimeout {
		t.Fatalf("timed-out upload answered %d", timedOut.status)
	}

	func() {
		defer func() {
			recovered, _ := recover().(error)
			if !errors.Is(recovered, http.ErrAbortHandler) {
				t.Errorf("aborted upload recovered %v", recovered)
			}
		}()

		Upload(grid, NewEpoch(), 1<<20, UploadLifetime, transfer)(newRecordingWriter(),
			uploadRequest(t, &failingBody{}, 10))
	}()

	expectSamples(t, meter, map[string]string{
		// Every byte read is counted, the timed-out and the aborted bodies' included.
		"bitgauge_transfer_bytes_total" + uploadSeries:   "12",
		"bitgauge_active_transfers" + uploadSeries:       "0",
		"bitgauge_http_aborts_total" + uploadSeries:      "1",
		`bitgauge_upload_timeouts_total{group="api"}`:    "1",
		"bitgauge_http_aborts_total" + downloadSeries:    "0",
		"bitgauge_transfer_bytes_total" + downloadSeries: "0",
	})
}

func TestWebSocketsAreCounted(t *testing.T) {
	t.Parallel()

	server := newWSServer(t)
	conns := make([]*websocket.Conn, 0, ratelimit.WebSocketsPerClient)

	// A pong proves its connection reached the echo loop, and so was counted open.
	for index := range ratelimit.WebSocketsPerClient {
		conn := server.mustDial(t)
		conns = append(conns, conn)

		send(t, conn, websocket.MessageText, fmt.Sprintf(`{"type":"ping","seq":%d}`, index))
		receive(t, conn)
	}

	if _, status, _ := server.dial(t, ""); status != http.StatusTooManyRequests {
		t.Fatalf("fifth WebSocket answered %d", status)
	}

	server.waitReturned(t)

	expectSamples(t, server.meter, map[string]string{
		"bitgauge_websocket_connections":                 "4",
		`bitgauge_rate_limited_total{limit="websocket"}`: "1",
		"bitgauge_ratelimit_tracked_clients":             "1",
	})

	// An unknown type is not an echo.
	send(t, conns[0], websocket.MessageText, `{"type":"hello","seq":9}`)
	send(t, conns[0], websocket.MessageText, `{"type":"ping","seq":10}`)
	receive(t, conns[0])

	// Once every handler has returned, every echo has been counted and every connection closed.
	for _, conn := range conns {
		_ = conn.Close(websocket.StatusNormalClosure, "")

		server.waitReturned(t)
	}

	expectSamples(t, server.meter, map[string]string{
		"bitgauge_websocket_connections":    "0",
		"bitgauge_websocket_messages_total": "5",
	})
}
