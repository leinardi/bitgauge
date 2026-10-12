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

package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/ratelimit"
)

// failsafe bounds every wait in these tests against a hang; none of them waits for state.
const failsafe = 30 * time.Second

func awaitRun(t *testing.T, done <-chan error) error {
	t.Helper()

	select {
	case err := <-done:
		return err
	case <-time.After(failsafe):
		t.Fatal("Run did not return")

		return nil
	}
}

func TestRunClosesWebSocketsWithGoingAway(t *testing.T) {
	t.Parallel()

	stack := newStack(t, testConfig(), nil)
	// The lifecycle owns a second server of the same handler; httptest only lends it a listener.
	unstarted := httptest.NewUnstartedServer(stack.server.Config.Handler)
	clock := &fakeClock{now: time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)}

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)

	go func() {
		done <- Run(ctx, &Lifecycle{
			Server:     unstarted.Config,
			Listener:   unstarted.Listener,
			WebSockets: stack.native.WebSockets,
			Timers:     clock,
			Log:        slog.New(slog.DiscardHandler),
		})
	}()

	url := "ws://" + unstarted.Listener.Addr().String() + "/api/v1/ws"

	conn, response, err := websocket.Dial(t.Context(), url, nil)
	if response != nil && response.Body != nil {
		_ = response.Body.Close()
	}

	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = conn.CloseNow() })

	// A round trip proves the echo is running before shutdown starts.
	err = conn.Write(t.Context(), websocket.MessageText, []byte(`{"type":"ping","seq":1,"t":1}`))
	if err != nil {
		t.Fatal(err)
	}

	_, _, err = conn.Read(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	closed := make(chan websocket.StatusCode, 1)

	go func() {
		_, _, readErr := conn.Read(context.WithoutCancel(t.Context()))
		closed <- websocket.CloseStatus(readErr)
	}()

	cancel()

	err = awaitRun(t, done)
	if err != nil {
		t.Fatalf("Run = %v, want a clean shutdown", err)
	}

	if got := <-closed; got != websocket.StatusGoingAway {
		t.Fatalf("WebSocket closed with %v, want 1001", got)
	}

	// The listener is closed: new connections are refused.
	request, err := http.NewRequestWithContext(
		t.Context(),
		http.MethodGet,
		"http://"+unstarted.Listener.Addr().String()+"/api/v1/ping",
		http.NoBody,
	)
	if err != nil {
		t.Fatal(err)
	}

	late, err := http.DefaultClient.Do(request)
	if err == nil {
		_ = late.Body.Close()

		t.Fatal("the server still accepts connections after shutdown")
	}
}

func TestRunCutsRequestsAfterTheGrace(t *testing.T) {
	t.Parallel()

	entered, release := make(chan struct{}), make(chan struct{})
	unstarted := httptest.NewUnstartedServer(
		http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			close(entered)
			<-release
		}),
	)

	t.Cleanup(func() { close(release) })

	clock := &fakeClock{
		now:        time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC),
		registered: make(chan time.Duration, 1),
	}
	limiter := ratelimit.New(ratelimit.Options{}, clock)

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)

	go func() {
		done <- Run(ctx, &Lifecycle{
			Server:   unstarted.Config,
			Listener: unstarted.Listener,
			WebSockets: handlers.NewWebSockets(limiter, ratelimit.RealClock{}, nil,
				handlers.WebSocketIdle, slog.New(slog.DiscardHandler)),
			Timers: clock,
			Log:    slog.New(slog.DiscardHandler),
		})
	}()

	go func() {
		request, err := http.NewRequestWithContext(
			context.WithoutCancel(t.Context()),
			http.MethodGet,
			"http://"+unstarted.Listener.Addr().String()+"/slow",
			http.NoBody,
		)
		if err != nil {
			return
		}

		response, err := http.DefaultClient.Do(request)
		if err == nil {
			_ = response.Body.Close()
		}
	}()

	<-entered
	cancel()

	// The grace timer exists once Run has started shutting down, and it is 10 s long.
	select {
	case grace := <-clock.registered:
		if grace != ShutdownGrace {
			t.Fatalf("grace timer of %v, want %v", grace, ShutdownGrace)
		}
	case <-time.After(failsafe):
		t.Fatal("no grace timer")
	}

	// Just short of the grace, the running request still holds the shutdown.
	clock.Advance(ShutdownGrace - time.Millisecond)

	select {
	case err := <-done:
		t.Fatalf("Run returned %v before the grace ended", err)
	default:
	}

	clock.Advance(time.Millisecond)

	err := awaitRun(t, done)
	if !errors.Is(err, ErrGraceExceeded) {
		t.Fatalf("Run = %v, want ErrGraceExceeded", err)
	}
}

func TestRunReportsAListenerFailure(t *testing.T) {
	t.Parallel()

	unstarted := httptest.NewUnstartedServer(http.NotFoundHandler())
	_ = unstarted.Listener.Close()

	err := Run(t.Context(), &Lifecycle{
		Server:   unstarted.Config,
		Listener: unstarted.Listener,
		Timers:   &fakeClock{},
		Log:      slog.New(slog.DiscardHandler),
	})
	if err == nil || !strings.Contains(err.Error(), "serve") {
		t.Fatalf("Run = %v, want the listener's error", err)
	}
}
