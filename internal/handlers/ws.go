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
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/leinardi/bitgauge/internal/clientip"
	"github.com/leinardi/bitgauge/internal/config"
	"github.com/leinardi/bitgauge/internal/metrics"
	"github.com/leinardi/bitgauge/internal/ratelimit"
)

const (
	// WebSocketReadLimit is the largest message accepted; a larger one closes with 1009.
	WebSocketReadLimit = 256
	// WebSocketIdle is how long a connection may go without a message before it closes with
	// 1000 (wire-protocol.md section 6).
	WebSocketIdle = 120 * time.Second
	// webSocketKeyBytes is the decoded length of a valid Sec-WebSocket-Key.
	webSocketKeyBytes = 16
	pingType          = "ping"
	pongType          = "pong"
)

// wsMessage is a message in either direction. Seq and T stay raw JSON, so the pong carries
// them exactly as the ping wrote them: t is opaque to the server, and a float decoded and
// encoded again could change its text.
type wsMessage struct {
	Type string          `json:"type"`
	Seq  json.RawMessage `json:"seq,omitempty"`
	T    json.RawMessage `json:"t,omitempty"`
}

// WebSockets serves /api/v1/ws, the idle-latency echo, and tracks its open connections only
// so that shutdown can close them all with 1001 (backend.md section 5); it keeps nothing
// about a connection beyond the connection itself.
type WebSockets struct {
	timers  ratelimit.Timers
	limiter *ratelimit.Limiter
	log     *slog.Logger
	meter   *metrics.Metrics
	closing chan struct{}
	allowed map[string]bool
	active  sync.WaitGroup
	idle    time.Duration
	mu      sync.Mutex
	closed  bool
}

// NewWebSockets builds the echo endpoint. allowedOrigins is server.cors.allowed_origins; idle
// is WebSocketIdle outside tests. meter counts the open connections, the echoed pings and the
// refused handshakes; nil counts nothing.
func NewWebSockets(
	limiter *ratelimit.Limiter,
	timers ratelimit.Timers,
	allowedOrigins []config.Origin,
	idle time.Duration,
	log *slog.Logger,
	meter *metrics.Metrics,
) *WebSockets {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		if normalized, ok := NormalizeOrigin(string(origin)); ok {
			allowed[normalized] = true
		}
	}

	return &WebSockets{
		timers:  timers,
		limiter: limiter,
		log:     log,
		meter:   meter,
		closing: make(chan struct{}),
		allowed: allowed,
		idle:    idle,
	}
}

// CloseAll closes every open connection with 1001 (going away), refuses to keep new ones,
// and waits until their handlers have returned or ctx ends.
func (s *WebSockets) CloseAll(ctx context.Context) error {
	s.mu.Lock()
	if !s.closed {
		s.closed = true
		close(s.closing)
	}
	s.mu.Unlock()

	done := make(chan struct{})

	go func() {
		s.active.Wait()
		close(done)
	}()

	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("close the WebSockets: %w", context.Cause(ctx))
	}
}

// ServeHTTP checks the handshake's Origin (403 for a foreign one), then the handshake itself
// (400), then takes one of the client's WebSocket slots (429), and only then upgrades. The slot
// is held until the connection closes.
func (s *WebSockets) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	if !s.originAllowed(request) {
		// wire-protocol.md section 7 names no code for this 403, so it has no envelope.
		writer.Header()["Cache-Control"] = NoStore
		writer.WriteHeader(http.StatusForbidden)

		return
	}

	if !isWebSocketHandshake(request) {
		writer.Header().Set("Sec-WebSocket-Version", "13")
		WriteError(writer, http.StatusBadRequest, CodeBadRequest,
			"a WebSocket handshake is required", nil)

		return
	}

	addr, _ := clientip.FromContext(request.Context())

	release, err := s.limiter.AcquireWebSocket(addr)
	if err != nil {
		ratelimit.Refuse(writer, request, err, ErrorWriter{}, s.log, s.meter)

		return
	}

	defer release()

	conn, err := websocket.Accept(writer, request, &websocket.AcceptOptions{
		// The Origin rule above replaces the library's own.
		InsecureSkipVerify: true,
		CompressionMode:    websocket.CompressionDisabled,
	})
	if err != nil {
		return
	}

	s.meter.WebSocketOpened()
	defer s.meter.WebSocketClosed()

	if s.join() {
		defer s.active.Done()
	}

	// The connection outlives the request's context once hijacked; shutdown reaches it
	// through CloseAll instead.
	s.echo(context.WithoutCancel(request.Context()), conn)
}

// join registers a connection for CloseAll; after CloseAll it reports false.
func (s *WebSockets) join() bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return false
	}

	s.active.Add(1)

	return true
}

// echo answers each ping with its pong until the connection ends: by the peer, by a protocol
// rule, by 120 s without a message, or by CloseAll.
func (s *WebSockets) echo(parent context.Context, conn *websocket.Conn) {
	conn.SetReadLimit(WebSocketReadLimit)

	ctx, cancel := context.WithCancel(parent)
	defer cancel()

	go func() {
		select {
		case <-s.closing:
			_ = conn.Close(websocket.StatusGoingAway, "server shutting down")
		case <-ctx.Done():
		}
	}()

	closeIdle := func() { _ = conn.Close(websocket.StatusNormalClosure, "idle") }
	stopIdle := s.timers.AfterFunc(s.idle, closeIdle)

	for {
		kind, data, err := conn.Read(ctx)

		stopIdle()

		if err != nil {
			// The peer closed, the read limit closed with 1009, or a close above is under way.
			return
		}

		// The idle window restarts when a message arrives, before it is answered.
		stopIdle = s.timers.AfterFunc(s.idle, closeIdle)

		if !s.answer(ctx, conn, kind, data) {
			stopIdle()

			return
		}
	}
}

// answer handles one message and reports whether the connection stays open.
func (s *WebSockets) answer(
	ctx context.Context,
	conn *websocket.Conn,
	kind websocket.MessageType,
	data []byte,
) bool {
	if kind != websocket.MessageText {
		_ = conn.Close(websocket.StatusUnsupportedData, "only text frames are accepted")

		return false
	}

	var message wsMessage

	err := json.Unmarshal(data, &message)
	if err != nil {
		_ = conn.Close(websocket.StatusInvalidFramePayloadData, "malformed JSON")

		return false
	}

	if message.Type != pingType {
		// Unknown types are ignored.
		return true
	}

	pong, err := json.Marshal(wsMessage{Type: pongType, Seq: message.Seq, T: message.T})
	if err != nil {
		_ = conn.Close(websocket.StatusInternalError, "encode pong")

		return false
	}

	if conn.Write(ctx, websocket.MessageText, pong) != nil {
		return false
	}

	s.meter.WebSocketEchoed()

	return true
}

// originAllowed applies the Origin rule of wire-protocol.md section 6: no Origin (a
// non-browser client), an origin whose host and port equal the request's Host whatever its
// scheme (behind a TLS proxy the server sees http while the page is https), or an origin in
// server.cors.allowed_origins.
func (s *WebSockets) originAllowed(request *http.Request) bool {
	origins := request.Header.Values("Origin")
	if len(origins) == 0 {
		return true
	}

	if len(origins) > 1 {
		return false
	}

	parsed, err := url.Parse(origins[0])
	if err != nil || parsed.Host == "" {
		return false
	}

	if strings.EqualFold(parsed.Host, request.Host) {
		return true
	}

	normalized, ok := NormalizeOrigin(origins[0])

	return ok && s.allowed[normalized]
}

// NormalizeOrigin is an origin's comparable form: lower-case scheme and host, and no port
// when it is the scheme's default, so that equal origins compare equal (RFC 6454).
func NormalizeOrigin(origin string) (string, bool) {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		return "", false
	}

	scheme := strings.ToLower(parsed.Scheme)
	host := strings.ToLower(parsed.Hostname())
	port := parsed.Port()

	if (scheme == "http" && port == "80") || (scheme == "https" && port == "443") {
		port = ""
	}

	if port == "" {
		if strings.Contains(host, ":") {
			host = "[" + host + "]"
		}

		return scheme + "://" + host, true
	}

	return scheme + "://" + net.JoinHostPort(host, port), true
}

// isWebSocketHandshake checks what websocket.Accept requires of the request, so that a
// request that is not a valid handshake gets the error envelope rather than the library's
// plain-text answer.
func isWebSocketHandshake(request *http.Request) bool {
	if !request.ProtoAtLeast(1, 1) ||
		!headerHasToken(request.Header, "Connection", "upgrade") ||
		!headerHasToken(request.Header, "Upgrade", "websocket") ||
		request.Header.Get("Sec-WebSocket-Version") != "13" {
		return false
	}

	keys := request.Header.Values("Sec-WebSocket-Key")
	if len(keys) != 1 {
		return false
	}

	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(keys[0]))

	return err == nil && len(key) == webSocketKeyBytes
}

func headerHasToken(header http.Header, name, token string) bool {
	for _, value := range header.Values(name) {
		for element := range strings.SplitSeq(value, ",") {
			if strings.EqualFold(strings.TrimSpace(element), token) {
				return true
			}
		}
	}

	return false
}
