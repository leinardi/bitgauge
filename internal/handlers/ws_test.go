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
	"context"
	"encoding/binary"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/leinardi/bitgauge/internal/buildinfo"
	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/metrics"
	"github.com/leinardi/bitgauge/internal/ratelimit"
)

// wsServer serves the echo behind the clientip middleware, as the router does, and reports
// on returned each time a handler has returned and so given its slot back.
type wsServer struct {
	clock    *fakeClock
	sockets  *WebSockets
	meter    *metrics.Metrics
	server   *httptest.Server
	returned chan struct{}
	url      string
}

func newWSServer(t *testing.T, allowed ...config.Origin) *wsServer {
	t.Helper()

	return newLoggedWSServer(t, slog.New(slog.DiscardHandler), allowed...)
}

func newLoggedWSServer(t *testing.T, log *slog.Logger, allowed ...config.Origin) *wsServer {
	t.Helper()

	clock := &fakeClock{now: time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)}
	limiter := ratelimit.New(ratelimit.Options{
		MaxStreams: 8, RequestsPerMinute: 1200, TrackedClients: 64, MaxFlows: 32,
	}, clock)
	meter := metrics.New(buildinfo.Build{}, limiter.Len, nil)
	sockets := NewWebSockets(limiter, clock, allowed, WebSocketIdle, log, meter)
	returned := make(chan struct{}, 16)

	handler := clientip.Middleware(clientip.NewDeriver(nil))(
		http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			sockets.ServeHTTP(writer, request)

			returned <- struct{}{}
		}))

	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	return &wsServer{
		clock:    clock,
		sockets:  sockets,
		meter:    meter,
		server:   server,
		returned: returned,
		url:      "ws" + strings.TrimPrefix(server.URL, "http"),
	}
}

// dial opens a connection; a refused handshake gives a nil conn and the response's status
// and headers.
func (s *wsServer) dial(t *testing.T, origin string) (*websocket.Conn, int, http.Header) {
	t.Helper()

	header := http.Header{}
	if origin != "" {
		header.Set("Origin", origin)
	}

	conn, response, err := websocket.Dial(t.Context(), s.url, &websocket.DialOptions{
		HTTPHeader: header,
	})
	if err != nil {
		if response == nil {
			t.Fatalf("dial: %v", err)
		}

		_ = response.Body.Close()

		return nil, response.StatusCode, response.Header
	}

	t.Cleanup(func() { _ = conn.CloseNow() })

	return conn, http.StatusSwitchingProtocols, nil
}

func (s *wsServer) mustDial(t *testing.T) *websocket.Conn {
	t.Helper()

	conn, status, _ := s.dial(t, "")
	if conn == nil {
		t.Fatalf("handshake refused with %d", status)
	}

	return conn
}

// waitReturned waits for one handler to return; the failsafe only guards against a hang.
func (s *wsServer) waitReturned(t *testing.T) {
	t.Helper()

	select {
	case <-s.returned:
	case <-time.After(30 * time.Second):
		t.Fatal("the handler did not return")
	}
}

func send(t *testing.T, conn *websocket.Conn, kind websocket.MessageType, message string) {
	t.Helper()

	err := conn.Write(t.Context(), kind, []byte(message))
	if err != nil {
		t.Fatal(err)
	}
}

func receive(t *testing.T, conn *websocket.Conn) string {
	t.Helper()

	kind, data, err := conn.Read(t.Context())
	if err != nil || kind != websocket.MessageText {
		t.Fatalf("read %v %q: %v", kind, data, err)
	}

	return string(data)
}

// closedWith reads until the server's close frame and returns its status.
func closedWith(t *testing.T, conn *websocket.Conn) websocket.StatusCode {
	t.Helper()

	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()

	for {
		_, _, err := conn.Read(ctx)
		if err != nil {
			return websocket.CloseStatus(err)
		}
	}
}

func TestWebSocketEchoesSeqAndTUnchanged(t *testing.T) {
	t.Parallel()

	conn := newWSServer(t).mustDial(t)

	for _, test := range []struct{ ping, pong string }{
		{`{"type":"ping","seq":17,"t":48213.512}`, `{"type":"pong","seq":17,"t":48213.512}`},
		// A float with more digits than a float64 holds comes back as the same text.
		{
			`{"type":"ping","seq":18,"t":0.1000000000000000055511151231257827021181583404541015625}`,
			`{"type":"pong","seq":18,"t":0.1000000000000000055511151231257827021181583404541015625}`,
		},
		{`{ "t" : 1e3 , "type" : "ping" , "seq" : 19 }`, `{"type":"pong","seq":19,"t":1e3}`},
	} {
		send(t, conn, websocket.MessageText, test.ping)

		if got := receive(t, conn); got != test.pong {
			t.Fatalf("pong = %s, want %s", got, test.pong)
		}
	}
}

func TestWebSocketIgnoresUnknownTypes(t *testing.T) {
	t.Parallel()

	conn := newWSServer(t).mustDial(t)

	send(t, conn, websocket.MessageText, `{"type":"hello","seq":1}`)
	send(t, conn, websocket.MessageText, `{"type":"ping","seq":2,"t":5}`)

	// The first answer is the pong to the second message: nothing answered the first.
	if got := receive(t, conn); got != `{"type":"pong","seq":2,"t":5}` {
		t.Fatalf("first answer %s", got)
	}
}

func TestWebSocketCloseCodes(t *testing.T) {
	t.Parallel()

	server := newWSServer(t)

	// A message of exactly 256 bytes is accepted.
	ping := `{"type":"ping","seq":1,"t":2}`
	exact := server.mustDial(t)
	send(t, exact, websocket.MessageText, ping+strings.Repeat(" ", WebSocketReadLimit-len(ping)))

	if got := receive(t, exact); got != `{"type":"pong","seq":1,"t":2}` {
		t.Fatalf("pong to a 256-byte ping = %s", got)
	}

	for _, test := range []struct {
		message string
		kind    websocket.MessageType
		status  websocket.StatusCode
	}{
		{ping + strings.Repeat(" ", WebSocketReadLimit-len(ping)+1), websocket.MessageText, websocket.StatusMessageTooBig},
		{ping, websocket.MessageBinary, websocket.StatusUnsupportedData},
		{`{"type":"ping",`, websocket.MessageText, websocket.StatusInvalidFramePayloadData},
		{`[1,2]`, websocket.MessageText, websocket.StatusInvalidFramePayloadData},
	} {
		conn := server.mustDial(t)
		send(t, conn, test.kind, test.message)

		if got := closedWith(t, conn); got != test.status {
			t.Fatalf("%q (%v): closed with %v, want %v", test.message, test.kind, got, test.status)
		}
	}
}

func TestWebSocketIdleClose(t *testing.T) {
	t.Parallel()

	server := newWSServer(t)
	conn := server.mustDial(t)

	send(t, conn, websocket.MessageText, `{"type":"ping","seq":1,"t":1}`)
	receive(t, conn)

	// Just short of the window nothing happens, and a message restarts it.
	server.clock.Advance(WebSocketIdle - time.Millisecond)
	send(t, conn, websocket.MessageText, `{"type":"ping","seq":2,"t":2}`)
	receive(t, conn)

	server.clock.Advance(WebSocketIdle - time.Millisecond)
	send(t, conn, websocket.MessageText, `{"type":"ping","seq":3,"t":3}`)
	receive(t, conn)

	// Each message replaced the window instead of adding one.
	if pending := server.clock.pending(); pending != 1 {
		t.Fatalf("%d idle timers armed, want 1", pending)
	}

	// A full window without a message closes with 1000.
	server.clock.Advance(WebSocketIdle)

	if got := closedWith(t, conn); got != websocket.StatusNormalClosure {
		t.Fatalf("idle connection closed with %v, want 1000", got)
	}
}

func TestWebSocketOrigin(t *testing.T) {
	t.Parallel()

	server := newWSServer(t, "https://speed.example", "http://lan.example:8080")
	host := strings.TrimPrefix(server.server.URL, "http://")

	for _, test := range []struct {
		origin   string
		accepted bool
	}{
		{"", true},
		{"http://" + host, true},
		// Behind a TLS proxy the page is https while the server sees http.
		{"https://" + host, true},
		{"https://speed.example", true},
		{"HTTPS://Speed.Example:443", true},
		{"http://lan.example:8080", true},
		{"http://speed.example", false},
		{"https://evil.example", false},
		{"http://lan.example", false},
		{"null", false},
		{"http://" + strings.Replace(host, "127.0.0.1", "127.0.0.2", 1), false},
	} {
		conn, status, _ := server.dial(t, test.origin)
		if test.accepted {
			if conn == nil {
				t.Fatalf("origin %q refused with %d", test.origin, status)
			}

			_ = conn.Close(websocket.StatusNormalClosure, "")

			server.waitReturned(t)

			continue
		}

		if status != http.StatusForbidden {
			t.Fatalf("origin %q: status %d, want 403", test.origin, status)
		}

		server.waitReturned(t)
	}
}

func TestWebSocketFifthConnectionIs429(t *testing.T) {
	t.Parallel()

	server := newWSServer(t)

	open := make([]*websocket.Conn, 0, ratelimit.WebSocketsPerClient)
	for range ratelimit.WebSocketsPerClient {
		open = append(open, server.mustDial(t))
	}

	_, status, header := server.dial(t, "")
	if status != http.StatusTooManyRequests || header.Get("Retry-After") == "" {
		t.Fatalf("fifth connection: status %d, headers %v; want 429 with Retry-After",
			status, header)
	}

	server.waitReturned(t)

	// Closing one frees its slot.
	err := open[0].Close(websocket.StatusNormalClosure, "")
	if err != nil {
		t.Fatal(err)
	}

	server.waitReturned(t)
	server.mustDial(t)
}

// rawDial does the handshake by hand, so the test sees the TCP connection itself: whether
// the server ends it, not only whether it wrote a close frame.
func (s *wsServer) rawDial(t *testing.T) (net.Conn, *bufio.Reader) {
	t.Helper()

	var dialer net.Dialer

	conn, err := dialer.DialContext(t.Context(), "tcp", s.server.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = conn.Close() })

	_, err = io.WriteString(conn, "GET / HTTP/1.1\r\nHost: "+s.server.Listener.Addr().String()+
		"\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"+
		"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n")
	if err != nil {
		t.Fatal(err)
	}

	reader := bufio.NewReader(conn)

	response, err := http.ReadResponse(reader, nil)
	if err != nil {
		t.Fatal(err)
	}

	_ = response.Body.Close()

	if response.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("raw handshake: status %d, want 101", response.StatusCode)
	}

	return conn, reader
}

// maskedTextFrame is one client text frame (FIN set, masked) of length spaces; length must be
// at least 126, so that it takes the 16-bit form.
func maskedTextFrame(length uint16) []byte {
	mask := [4]byte{0x1b, 0x2c, 0x3d, 0x4e}

	frame := make([]byte, 0, 8+int(length))
	frame = append(frame, 0x81, 0x80|126)
	frame = binary.BigEndian.AppendUint16(frame, length)
	frame = append(frame, mask[:]...)

	for index := range int(length) {
		frame = append(frame, ' '^mask[index%len(mask)])
	}

	return frame
}

func TestWebSocketReadLimitClosesTheConnection(t *testing.T) {
	t.Parallel()

	server := newWSServer(t)

	for range ratelimit.WebSocketsPerClient - 1 {
		server.mustDial(t)
	}

	raw, reader := server.rawDial(t)

	err := raw.SetDeadline(time.Now().Add(30 * time.Second))
	if err != nil {
		t.Fatal(err)
	}

	_, err = raw.Write(maskedTextFrame(WebSocketReadLimit + 1))
	if err != nil {
		t.Fatal(err)
	}

	// The server's frame is unmasked and short: opcode, length, then the status code.
	header := make([]byte, 4)

	_, err = io.ReadFull(reader, header)
	if err != nil {
		t.Fatalf("read the close frame: %v", err)
	}

	if header[0] != 0x88 || header[1] < 2 ||
		websocket.StatusCode(binary.BigEndian.Uint16(header[2:])) != websocket.StatusMessageTooBig {
		t.Fatalf("frame % x, want a close frame with 1009", header)
	}

	_, err = io.CopyN(io.Discard, reader, int64(header[1]-2))
	if err != nil {
		t.Fatal(err)
	}

	// The server ends the TCP connection too, rather than holding it after freeing its slot.
	_, err = reader.ReadByte()
	if !errors.Is(err, io.EOF) {
		t.Fatalf("after the close frame: %v, want io.EOF", err)
	}

	server.waitReturned(t)

	// Its slot is free, so one more fits and four are open again; a fifth is refused.
	server.mustDial(t)

	_, status, refused := server.dial(t, "")
	if status != http.StatusTooManyRequests || refused.Get("Retry-After") == "" {
		t.Fatalf("fifth connection: status %d, headers %v; want 429 with Retry-After",
			status, refused)
	}

	server.waitReturned(t)

	if got := sample(scrape(t, server.meter), "bitgauge_websocket_connections"); got != "4" {
		t.Fatalf("bitgauge_websocket_connections = %q, want 4", got)
	}
}

// logRecord is one captured log line: its level, message and attributes.
type logRecord struct {
	attrs   map[string]string
	message string
	level   slog.Level
}

// captureHandler keeps every record at debug and above.
type captureHandler struct {
	records *[]logRecord
	mu      *sync.Mutex
}

func (captureHandler) Enabled(context.Context, slog.Level) bool { return true }

//nolint:gocritic // slog.Handler fixes the signature: the record comes by value
func (h captureHandler) Handle(_ context.Context, record slog.Record) error {
	attrs := map[string]string{}

	record.Attrs(func(attr slog.Attr) bool {
		attrs[attr.Key] = attr.Value.String()

		return true
	})

	h.mu.Lock()
	defer h.mu.Unlock()

	*h.records = append(*h.records, logRecord{
		attrs: attrs, message: record.Message,
		level: record.Level,
	})

	return nil
}

func (h captureHandler) WithAttrs([]slog.Attr) slog.Handler { return h }

func (h captureHandler) WithGroup(string) slog.Handler { return h }

func TestWebSocketOpenAndCloseAreLoggedAtDebug(t *testing.T) {
	t.Parallel()

	var (
		records []logRecord
		mu      sync.Mutex
	)

	server := newLoggedWSServer(t, slog.New(captureHandler{records: &records, mu: &mu}))
	conn := server.mustDial(t)

	send(t, conn, websocket.MessageText, `{"type":"ping","seq":1,"t":1}`)
	receive(t, conn)

	err := conn.Close(websocket.StatusNormalClosure, "")
	if err != nil {
		t.Fatal(err)
	}

	server.waitReturned(t)

	mu.Lock()
	defer mu.Unlock()

	if len(records) != 2 || records[0].message != "websocket open" ||
		records[1].message != "websocket close" {
		t.Fatalf("records %+v, want websocket open then websocket close", records)
	}

	for _, record := range records {
		// The client address alone: never a message, a header or a seq.
		if record.level != slog.LevelDebug || len(record.attrs) != 1 ||
			record.attrs["client"] != "127.0.0.1" {
			t.Fatalf("record %+v, want debug with only client=127.0.0.1", record)
		}
	}
}

func TestWebSocketNotAHandshakeIs400(t *testing.T) {
	t.Parallel()

	server := newWSServer(t)

	request, err := http.NewRequestWithContext(
		t.Context(),
		http.MethodGet,
		server.server.URL,
		http.NoBody,
	)
	if err != nil {
		t.Fatal(err)
	}

	response, err := server.server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}

	_ = response.Body.Close()

	if response.StatusCode != http.StatusBadRequest ||
		response.Header.Get("Content-Type") != "application/json" {
		t.Fatalf("status %d, Content-Type %q; want the 400 envelope",
			response.StatusCode, response.Header.Get("Content-Type"))
	}
}

func TestWebSocketCloseAll(t *testing.T) {
	t.Parallel()

	server := newWSServer(t)
	first, second := server.mustDial(t), server.mustDial(t)

	// Each client reads, so the close handshakes complete.
	statuses := make(chan websocket.StatusCode, 2)

	for _, conn := range []*websocket.Conn{first, second} {
		go func() { statuses <- closedWith(t, conn) }()
	}

	err := server.sockets.CloseAll(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	for range 2 {
		if got := <-statuses; got != websocket.StatusGoingAway {
			t.Fatalf("closed with %v, want 1001", got)
		}
	}

	// A connection after shutdown began is closed at once.
	if got := closedWith(t, server.mustDial(t)); got != websocket.StatusGoingAway {
		t.Fatalf("late connection closed with %v, want 1001", got)
	}
}

func TestWebSocketCloseAllHonoursItsContext(t *testing.T) {
	t.Parallel()

	server := newWSServer(t)
	conn := server.mustDial(t)

	// A round trip proves the connection is registered; after it the client never reads
	// again, so its close handshake cannot complete.
	send(t, conn, websocket.MessageText, `{"type":"ping","seq":1,"t":1}`)
	receive(t, conn)

	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	err := server.sockets.CloseAll(ctx)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want the context's", err)
	}
}
