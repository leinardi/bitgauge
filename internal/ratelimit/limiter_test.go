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
	"errors"
	"net/netip"
	"sync"
	"testing"
	"time"
)

// fakeClock is advanced by the test; nothing in these tests sleeps.
type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func newFakeClock() *fakeClock {
	return &fakeClock{now: time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)}
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.now
}

func (c *fakeClock) Advance(elapsed time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.now = c.now.Add(elapsed)
}

var defaults = Options{MaxStreams: 8, RequestsPerMinute: 1200, TrackedClients: 4096, MaxFlows: 32}

func addr(text string) netip.Addr {
	return netip.MustParseAddr(text)
}

func limitError(t *testing.T, err, sentinel error) *LimitError {
	t.Helper()

	if !errors.Is(err, sentinel) {
		t.Fatalf("error = %v, want %v", err, sentinel)
	}

	limitErr, isLimit := errors.AsType[*LimitError](err)
	if !isLimit {
		t.Fatalf("error %v is not a *LimitError", err)
	}

	return limitErr
}

// assertLimit is limitError for a caller that only needs the check.
func assertLimit(t *testing.T, err, sentinel error) {
	t.Helper()

	_ = limitError(t, err, sentinel)
}

func TestConcurrencyLimitAndRelease(t *testing.T) {
	t.Parallel()

	limiter := New(defaults, newFakeClock())
	client := addr("192.168.1.42")

	releases := make([]func(), 0, defaults.MaxStreams)

	for range defaults.MaxStreams {
		release, err := limiter.AcquireStream(client)
		if err != nil {
			t.Fatalf("stream within the limit refused: %v", err)
		}

		releases = append(releases, release)
	}

	_, err := limiter.AcquireStream(client)
	refused := limitError(t, err, ErrStreams)

	if refused.RetryAfter != 1 || refused.Code != CodeTooManyStreams {
		t.Fatalf("refusal = %+v, want Retry-After 1 and too_many_streams", refused)
	}

	// Another client is not affected.
	_, err = limiter.AcquireStream(addr("192.168.1.43"))
	if err != nil {
		t.Fatalf("another client refused: %v", err)
	}

	releases[0]()
	releases[0]() // a second call must not free a second slot

	_, err = limiter.AcquireStream(client)
	if err != nil {
		t.Fatalf("slot not freed by release: %v", err)
	}

	_, err = limiter.AcquireStream(client)
	assertLimit(t, err, ErrStreams)
}

func TestReleaseInDeferOnAbort(t *testing.T) {
	t.Parallel()

	limiter := New(
		Options{MaxStreams: 1, RequestsPerMinute: 1200, TrackedClients: 16, MaxFlows: 1},
		newFakeClock(),
	)
	client := addr("10.0.0.1")

	abortedTransfer := func() {
		defer func() { _ = recover() }()

		release, err := limiter.AcquireStream(client)
		if err != nil {
			t.Fatal(err)
		}

		defer release()

		panic("client went away mid-transfer")
	}

	abortedTransfer()

	release, err := limiter.AcquireStream(client)
	if err != nil {
		t.Fatalf("the aborted transfer kept its slot: %v", err)
	}

	release()
}

func TestTokenBucketAtTheDefaultRate(t *testing.T) {
	t.Parallel()

	clock := newFakeClock()
	limiter := New(defaults, clock)
	client := addr("192.168.1.42")

	// Burst max(60, 1200 / 4) = 300 new requests at once.
	for index := range 300 {
		release, err := limiter.AcquireStream(client)
		if err != nil {
			t.Fatalf("request %d of the burst refused: %v", index+1, err)
		}

		release()
	}

	_, err := limiter.AcquireStream(client)
	refused := limitError(t, err, ErrRate)

	// 1200 per minute is 20 tokens per second: the next one is 50 ms away, rounded up to 1 s.
	if refused.RetryAfter != 1 || refused.Code != CodeRateLimited {
		t.Fatalf("refusal = %+v, want Retry-After 1 and rate_limited", refused)
	}

	clock.Advance(49 * time.Millisecond)

	_, err = limiter.AcquireStream(client)
	assertLimit(t, err, ErrRate)

	clock.Advance(time.Millisecond)

	release, err := limiter.AcquireStream(client)
	if err != nil {
		t.Fatalf("no token after 50 ms: %v", err)
	}

	release()

	// A full second refills 20 tokens and no more.
	clock.Advance(time.Second)

	for index := range 20 {
		release, err = limiter.AcquireStream(client)
		if err != nil {
			t.Fatalf("token %d of 20 refused: %v", index+1, err)
		}

		release()
	}

	_, err = limiter.AcquireStream(client)
	assertLimit(t, err, ErrRate)
}

func TestTokenBucketBurstNeverExceeded(t *testing.T) {
	t.Parallel()

	clock := newFakeClock()
	limiter := New(defaults, clock)
	client := addr("192.168.1.42")

	clock.Advance(time.Hour)

	accepted := 0

	for {
		release, err := limiter.AcquireStream(client)
		if err != nil {
			break
		}

		release()

		accepted++
	}

	if accepted != 300 {
		t.Fatalf("accepted %d after an hour idle, want the 300 burst", accepted)
	}
}

func TestTokenBucketAtCustomRates(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name              string
		requestsPerMinute int
		burst             int
		firstRetryAfter   int
	}{
		// The minimum rate: 1 token per second, burst max(60, 15) = 60.
		{name: "60 per minute", requestsPerMinute: 60, burst: 60, firstRetryAfter: 1},
		// 100 per minute: burst max(60, 25) = 60, 0.6 s to the next token, rounded up to 1 s.
		{name: "100 per minute", requestsPerMinute: 100, burst: 60, firstRetryAfter: 1},
		// The maximum rate: burst 25000.
		{name: "100000 per minute", requestsPerMinute: 100000, burst: 25000, firstRetryAfter: 1},
		// Below the validated range the limiter still rounds up: 30 per minute is 2 s a token.
		{name: "30 per minute", requestsPerMinute: 30, burst: 60, firstRetryAfter: 2},
		// 20 per minute: 3 s a token.
		{name: "20 per minute", requestsPerMinute: 20, burst: 60, firstRetryAfter: 3},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			clock := newFakeClock()
			limiter := New(
				Options{
					MaxStreams:        8,
					RequestsPerMinute: tc.requestsPerMinute,
					TrackedClients:    16,
					MaxFlows:          1,
				},
				clock,
			)
			client := addr("10.0.0.1")

			for index := range tc.burst {
				release, err := limiter.AcquireStream(client)
				if err != nil {
					t.Fatalf("request %d of the %d burst refused: %v", index+1, tc.burst, err)
				}

				release()
			}

			_, err := limiter.AcquireStream(client)
			refused := limitError(t, err, ErrRate)

			if refused.RetryAfter != tc.firstRetryAfter {
				t.Fatalf("Retry-After = %d, want %d", refused.RetryAfter, tc.firstRetryAfter)
			}

			// Retry-After is the time to the next token: halfway there it halves, rounded up.
			if tc.firstRetryAfter > 1 {
				clock.Advance(time.Duration(tc.firstRetryAfter) * time.Second / 2)

				_, err = limiter.AcquireStream(client)
				refused = limitError(t, err, ErrRate)

				want := (tc.firstRetryAfter + 1) / 2
				if refused.RetryAfter != want {
					t.Fatalf("Retry-After halfway = %d, want %d", refused.RetryAfter, want)
				}
			}
		})
	}
}

func TestRetryAfterRoundsUpAndIsAtLeastOne(t *testing.T) {
	t.Parallel()

	limiter := New(Options{RequestsPerMinute: 60}, newFakeClock())

	tests := []struct {
		tokens float64
		want   int
	}{
		{tokens: 0, want: 1},
		{tokens: 0.999, want: 1},
		{tokens: -0.5, want: 2},
		{tokens: -1.0, want: 2},
		{tokens: -1.0001, want: 3},
	}

	for _, tc := range tests {
		if got := limiter.untilNextToken(&entry{tokens: tc.tokens}); got != tc.want {
			t.Errorf("untilNextToken(%v tokens at 1/s) = %d, want %d", tc.tokens, got, tc.want)
		}
	}
}

func TestRefusedStreamSpendsNoToken(t *testing.T) {
	t.Parallel()

	limiter := New(
		Options{MaxStreams: 1, RequestsPerMinute: 60, TrackedClients: 16, MaxFlows: 1},
		newFakeClock(),
	)
	client := addr("10.0.0.1")

	release, err := limiter.AcquireStream(client)
	if err != nil {
		t.Fatal(err)
	}

	for range 100 {
		_, err = limiter.AcquireStream(client)
		assertLimit(t, err, ErrStreams)
	}

	release()

	// 60 burst, one spent: 59 left despite the 100 refusals.
	for index := range 59 {
		release, err = limiter.AcquireStream(client)
		if err != nil {
			t.Fatalf("token %d refused: refusals spent tokens", index+1)
		}

		release()
	}
}

func TestWebSocketsAndFlows(t *testing.T) {
	t.Parallel()

	limiter := New(
		Options{MaxStreams: 8, RequestsPerMinute: 1200, TrackedClients: 16, MaxFlows: 2},
		newFakeClock(),
	)
	client := addr("10.0.0.1")

	webSocketReleases := make([]func(), 0, WebSocketsPerClient)

	for range WebSocketsPerClient {
		release, err := limiter.AcquireWebSocket(client)
		if err != nil {
			t.Fatal(err)
		}

		webSocketReleases = append(webSocketReleases, release)
	}

	_, err := limiter.AcquireWebSocket(client)
	refused := limitError(t, err, ErrWebSockets)

	if refused.RetryAfter != 1 || refused.Code != CodeTooManyStreams {
		t.Fatalf("fifth WebSocket refusal = %+v", refused)
	}

	// WebSockets and streams are separate counters.
	release, err := limiter.AcquireStream(client)
	if err != nil {
		t.Fatalf("a stream refused because of WebSockets: %v", err)
	}

	release()

	webSocketReleases[2]()

	_, err = limiter.AcquireWebSocket(client)
	if err != nil {
		t.Fatalf("closing a WebSocket did not free its slot: %v", err)
	}

	for range 2 {
		_, err = limiter.AcquireFlow(client)
		if err != nil {
			t.Fatal(err)
		}
	}

	_, err = limiter.AcquireFlow(client)
	assertLimit(t, err, ErrFlows)
}

func TestLRUEvictsOnlyIdleEntries(t *testing.T) {
	t.Parallel()

	clock := newFakeClock()
	limiter := New(
		Options{MaxStreams: 8, RequestsPerMinute: 60, TrackedClients: 3, MaxFlows: 1},
		clock,
	)

	activeRelease, err := limiter.AcquireStream(addr("10.0.0.1"))
	if err != nil {
		t.Fatal(err)
	}

	for _, idle := range []string{"10.0.0.2", "10.0.0.3"} {
		clock.Advance(time.Second)

		release, acquireErr := limiter.AcquireStream(addr(idle))
		if acquireErr != nil {
			t.Fatal(acquireErr)
		}

		release()
	}

	// Spend 10.0.0.2's tokens down, so that an eviction would show as a fresh burst. Seeing it
	// also makes 10.0.0.3 the least recently seen idle entry.
	drain(t, limiter, addr("10.0.0.2"))

	// The table is full: the least recently seen idle entry goes, not the older active one.
	release, err := limiter.AcquireStream(addr("10.0.0.4"))
	if err != nil {
		t.Fatalf("new client refused with an idle entry to evict: %v", err)
	}

	release()

	if limiter.Len() != 3 {
		t.Fatalf("table holds %d entries, want 3", limiter.Len())
	}

	// 10.0.0.3 was the least recently seen idle entry (10.0.0.2 was seen while draining).
	_, tracked := limiter.entries[addr("10.0.0.3")]
	if tracked {
		t.Fatal("10.0.0.3 survived; the eviction did not pick the least recently seen idle entry")
	}

	_, tracked = limiter.entries[addr("10.0.0.1")]
	if !tracked {
		t.Fatal("the active entry was evicted")
	}

	// 10.0.0.2 kept its spent bucket: it was not evicted and recreated.
	_, err = limiter.AcquireStream(addr("10.0.0.2"))
	assertLimit(t, err, ErrRate)

	activeRelease()
}

func drain(t *testing.T, limiter *Limiter, client netip.Addr) {
	t.Helper()

	for range 1000 {
		release, err := limiter.AcquireStream(client)
		if err != nil {
			assertLimit(t, err, ErrRate)

			return
		}

		release()
	}

	t.Fatal("the bucket never ran out")
}

func TestTableFullWhenEveryEntryIsActive(t *testing.T) {
	t.Parallel()

	clock := newFakeClock()
	limiter := New(
		Options{MaxStreams: 8, RequestsPerMinute: 1200, TrackedClients: 2, MaxFlows: 1},
		clock,
	)

	first, err := limiter.AcquireStream(addr("10.0.0.1"))
	if err != nil {
		t.Fatal(err)
	}

	_, err = limiter.AcquireWebSocket(addr("10.0.0.2"))
	if err != nil {
		t.Fatal(err)
	}

	_, err = limiter.AcquireStream(addr("10.0.0.3"))
	refused := limitError(t, err, ErrTableFull)

	if refused.RetryAfter != 1 || refused.Code != CodeTableFull {
		t.Fatalf("table_full refusal = %+v, want Retry-After 1 and table_full", refused)
	}

	_, err = limiter.AcquireFlow(addr("10.0.0.4"))
	assertLimit(t, err, ErrTableFull)

	clock.Advance(time.Minute)

	_, err = limiter.AcquireWebSocket(addr("10.0.0.5"))
	assertLimit(t, err, ErrTableFull)

	// Known clients keep working while the table is full.
	second, err := limiter.AcquireStream(addr("10.0.0.1"))
	if err != nil {
		t.Fatalf("a tracked client refused: %v", err)
	}

	if limiter.Len() != 2 {
		t.Fatalf("table grew to %d entries", limiter.Len())
	}

	// While 10.0.0.1 has any stream left it is not evictable.
	first()

	_, err = limiter.AcquireStream(addr("10.0.0.3"))
	assertLimit(t, err, ErrTableFull)

	// Once it is idle, a new client takes its place.
	second()

	_, err = limiter.AcquireStream(addr("10.0.0.3"))
	if err != nil {
		t.Fatalf("new client refused with an idle entry to evict: %v", err)
	}
}

func TestKeyIsTheFullAddress(t *testing.T) {
	t.Parallel()

	limiter := New(
		Options{MaxStreams: 1, RequestsPerMinute: 1200, TrackedClients: 16, MaxFlows: 1},
		newFakeClock(),
	)

	_, err := limiter.AcquireStream(addr("2001:db8::1"))
	if err != nil {
		t.Fatal(err)
	}

	// A neighbor in the same /64 has its own budget.
	_, err = limiter.AcquireStream(addr("2001:db8::2"))
	if err != nil {
		t.Fatalf("an address in the same /64 shared the budget: %v", err)
	}
}

func TestConcurrentUse(t *testing.T) {
	t.Parallel()

	limiter := New(
		Options{MaxStreams: 4, RequestsPerMinute: 100000, TrackedClients: 8, MaxFlows: 4},
		newFakeClock(),
	)

	var group sync.WaitGroup

	clients := []netip.Addr{addr("10.0.0.0"), addr("10.0.0.1"), addr("10.0.0.2"), addr("10.0.0.3")}

	for worker := range 16 {
		group.Go(func() {
			client := clients[worker%len(clients)]

			for range 200 {
				release, err := limiter.AcquireStream(client)
				if err == nil {
					release()
				}
			}
		})
	}

	group.Wait()

	for _, client := range limiter.entries {
		if client.streams != 0 || client.idle == nil {
			t.Fatalf(
				"entry %v left with %d streams, idle %v",
				client.addr,
				client.streams,
				client.idle != nil,
			)
		}
	}
}
