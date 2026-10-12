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
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/leinardi/bitgauge/internal/handlers"
	"github.com/leinardi/bitgauge/internal/ratelimit"
)

// ShutdownGrace is how long shutdown waits for running requests before cutting them
// (backend.md section 5).
const ShutdownGrace = 10 * time.Second

// ErrGraceExceeded reports a shutdown that had to cut transfers still running after the grace.
var ErrGraceExceeded = errors.New("shutdown grace exceeded; running transfers were cut")

// Lifecycle is what Run serves and shuts down.
type Lifecycle struct {
	Server     *http.Server
	Listener   net.Listener
	WebSockets *handlers.WebSockets
	Timers     ratelimit.Timers
	Log        *slog.Logger
}

// Run serves on the listener until ctx ends or the process receives SIGTERM or SIGINT, then
// shuts down: it stops accepting connections, closes every WebSocket with 1001 and gives
// running requests ShutdownGrace to finish, after which they are cut. It returns the
// listener's error if serving fails, ErrGraceExceeded if requests had to be cut, and nil
// after a clean shutdown.
func Run(ctx context.Context, lifecycle *Lifecycle) error {
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	served := make(chan error, 1)

	go func() {
		served <- lifecycle.Server.Serve(lifecycle.Listener)
	}()

	select {
	case err := <-served:
		return fmt.Errorf("serve: %w", err)
	case <-ctx.Done():
	}

	// A second signal during the grace now ends the process at once, as an operator expects.
	stop()
	lifecycle.Log.Info("shutting down")

	grace, cancel := context.WithCancel(context.WithoutCancel(ctx))
	defer cancel()

	stopGrace := lifecycle.Timers.AfterFunc(ShutdownGrace, cancel)
	defer stopGrace()

	// Shutdown closes the listener at once and then waits for the running requests; the
	// WebSockets, hijacked and so invisible to it, are closed alongside.
	shutdown := make(chan error, 1)

	go func() {
		shutdown <- lifecycle.Server.Shutdown(grace)
	}()

	socketsErr := lifecycle.WebSockets.CloseAll(grace)
	shutdownErr := <-shutdown

	if socketsErr != nil || shutdownErr != nil {
		closeErr := lifecycle.Server.Close()

		<-served

		return errors.Join(ErrGraceExceeded, closeErr)
	}

	err := <-served
	if !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve: %w", err)
	}

	lifecycle.Log.Info("stopped")

	return nil
}
