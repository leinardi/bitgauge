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

// Package ratelimit is the bounded per-client limiter of configuration-security.md section 5:
// concurrent throughput requests, a token bucket for new ones, WebSockets and networkQuality
// flows, per derived client IP, in a table of at most limits.tracked_clients entries.
package ratelimit

import "time"

// Clock is the time source of everything in the server whose behavior depends on time: the
// limiter's refill and Retry-After here, and the upload grid and deadlines in the handlers. Tests
// inject a fake one and advance it; nothing waits out a real window (go-style-guide section 18).
type Clock interface {
	// Now returns the current time, with its monotonic reading when it comes from time.Now, so
	// that intervals measured between two calls do not jump with the wall clock.
	Now() time.Time
}

// Timers is a Clock that also schedules work on its timeline: the WebSocket idle close in the
// handlers. Tests inject a fake one whose timers fire when the test advances it.
type Timers interface {
	Clock
	// AfterFunc calls fire in its own goroutine once d has elapsed, unless stop is called
	// first; stop reports whether it prevented the call.
	AfterFunc(d time.Duration, fire func()) (stop func() bool)
}

// RealClock is the production Clock and Timers.
type RealClock struct{}

// Now returns time.Now().
func (RealClock) Now() time.Time {
	return time.Now()
}

// AfterFunc is time.AfterFunc.
func (RealClock) AfterFunc(d time.Duration, fire func()) func() bool {
	return time.AfterFunc(d, fire).Stop
}
