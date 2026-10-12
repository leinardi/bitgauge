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
	"container/list"
	"errors"
	"fmt"
	"math"
	"net/netip"
	"sync"
	"time"
)

// WebSocketsPerClient is the fixed WebSocket limit per client IP (wire-protocol.md section 9).
const WebSocketsPerClient = 4

const (
	// minBurst is the smallest token-bucket burst: max(60, requests_per_minute / 4).
	minBurst = 60
	// burstDivisor turns requests_per_minute into the burst.
	burstDivisor = 4
	// concurrencyRetryAfter is the Retry-After of the concurrency limits and of a full table.
	concurrencyRetryAfter = 1
)

// The envelope codes of a 429 (wire-protocol.md section 7). The WebSocket and flow limits are
// concurrency limits and answer too_many_streams (wire-protocol.md section 9).
const (
	CodeRateLimited    = "rate_limited"
	CodeTooManyStreams = "too_many_streams"
	CodeTableFull      = "table_full"
)

var (
	// ErrStreams is a client at limits.max_streams_per_client concurrent throughput requests.
	ErrStreams = errors.New("too many concurrent throughput requests")
	// ErrRate is a client out of tokens for new throughput requests.
	ErrRate = errors.New("too many new throughput requests")
	// ErrWebSockets is a client at WebSocketsPerClient open WebSockets.
	ErrWebSockets = errors.New("too many WebSockets")
	// ErrFlows is a client at compat.networkquality.max_flows_per_client active flows.
	ErrFlows = errors.New("too many networkQuality flows")
	// ErrTableFull is a new client arriving while every tracked client has active work.
	ErrTableFull = errors.New("rate-limit table full of active clients")
)

// LimitError is a refused acquisition. It wraps one of the Err sentinels and carries what a 429
// needs.
type LimitError struct {
	err error
	// RetryAfter is the Retry-After value in whole seconds, rounded up and at least 1.
	RetryAfter int
	// Code is the error envelope code of the 429.
	Code string
}

func (e *LimitError) Error() string {
	return fmt.Sprintf("%v (retry after %d s)", e.err, e.RetryAfter)
}

func (e *LimitError) Unwrap() error {
	return e.err
}

// Options are the configured limits.
type Options struct {
	// MaxStreams is limits.max_streams_per_client.
	MaxStreams int
	// RequestsPerMinute is limits.requests_per_minute.
	RequestsPerMinute int
	// TrackedClients is limits.tracked_clients, the bound on the table.
	TrackedClients int
	// MaxFlows is compat.networkquality.max_flows_per_client.
	MaxFlows int
}

// entry is one client. It is on the idle list exactly when it has no active request, WebSocket
// or flow, which is what makes it evictable.
type entry struct {
	addr       netip.Addr
	streams    int
	websockets int
	flows      int
	tokens     float64
	refilledAt time.Time
	idle       *list.Element
}

func (e *entry) active() bool {
	return e.streams > 0 || e.websockets > 0 || e.flows > 0
}

// Limiter is the table. One mutex guards it, and every operation is constant time: the idle
// list keeps evictable entries in least-recently-seen order, so eviction never scans.
type Limiter struct {
	mu              sync.Mutex
	clock           Clock
	options         Options
	refillPerSecond float64
	burst           float64
	entries         map[netip.Addr]*entry
	idle            *list.List
}

// New returns an empty limiter.
func New(options Options, clock Clock) *Limiter {
	return &Limiter{
		clock:           clock,
		options:         options,
		refillPerSecond: float64(options.RequestsPerMinute) / float64(time.Minute/time.Second),
		burst:           math.Max(minBurst, float64(options.RequestsPerMinute)/burstDivisor),
		// No size hint: the table is bounded by TrackedClients, not allocated at it.
		entries: make(map[netip.Addr]*entry),
		idle:    list.New(),
	}
}

// AcquireStream admits one throughput request (download or upload) for addr: a concurrency slot
// and a token. The caller must call release when the request ends, in a defer, so that an
// aborted transfer frees its slot; release is safe to call more than once.
func (l *Limiter) AcquireStream(addr netip.Addr) (func(), error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.clock.Now()

	client, err := l.lookup(addr, now)
	if err != nil {
		return nil, err
	}

	defer l.settle(client)

	if client.streams >= l.options.MaxStreams {
		return nil, &LimitError{
			err:        ErrStreams,
			RetryAfter: concurrencyRetryAfter,
			Code:       CodeTooManyStreams,
		}
	}

	l.refill(client, now)

	if client.tokens < 1 {
		return nil, &LimitError{
			err:        ErrRate,
			RetryAfter: l.untilNextToken(client),
			Code:       CodeRateLimited,
		}
	}

	client.tokens--
	client.streams++

	return l.releaser(client, func(released *entry) { released.streams-- }), nil
}

// AcquireWebSocket admits one WebSocket for addr; release as for AcquireStream. WebSockets do
// not spend tokens: the token bucket counts throughput requests only.
func (l *Limiter) AcquireWebSocket(addr netip.Addr) (func(), error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	client, err := l.lookup(addr, l.clock.Now())
	if err != nil {
		return nil, err
	}

	defer l.settle(client)

	if client.websockets >= WebSocketsPerClient {
		return nil, &LimitError{
			err:        ErrWebSockets,
			RetryAfter: concurrencyRetryAfter,
			Code:       CodeTooManyStreams,
		}
	}

	client.websockets++

	return l.releaser(client, func(released *entry) { released.websockets-- }), nil
}

// AcquireFlow admits one networkQuality flow for addr; release as for AcquireStream.
func (l *Limiter) AcquireFlow(addr netip.Addr) (func(), error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	client, err := l.lookup(addr, l.clock.Now())
	if err != nil {
		return nil, err
	}

	defer l.settle(client)

	if client.flows >= l.options.MaxFlows {
		return nil, &LimitError{
			err:        ErrFlows,
			RetryAfter: concurrencyRetryAfter,
			Code:       CodeTooManyStreams,
		}
	}

	client.flows++

	return l.releaser(client, func(released *entry) { released.flows-- }), nil
}

// Len returns the number of tracked clients.
func (l *Limiter) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()

	return len(l.entries)
}

// lookup returns addr's entry, creating it with a full bucket. A new client at a full table
// takes the place of the least recently seen idle entry; with none idle it is refused, because
// an active entry's counters must never be lost.
func (l *Limiter) lookup(addr netip.Addr, now time.Time) (*entry, error) {
	client, found := l.entries[addr]
	if found {
		return client, nil
	}

	if len(l.entries) >= l.options.TrackedClients {
		oldest := l.idle.Back()
		if oldest == nil {
			return nil, &LimitError{
				err:        ErrTableFull,
				RetryAfter: concurrencyRetryAfter,
				Code:       CodeTableFull,
			}
		}

		evicted, _ := oldest.Value.(*entry)
		l.idle.Remove(oldest)
		delete(l.entries, evicted.addr)
	}

	client = &entry{addr: addr, tokens: l.burst, refilledAt: now}
	l.entries[addr] = client

	return client, nil
}

// settle records that client was just seen: an idle client moves to the front of the idle list,
// an active one leaves it.
func (l *Limiter) settle(client *entry) {
	if client.idle != nil {
		l.idle.Remove(client.idle)
		client.idle = nil
	}

	if !client.active() {
		client.idle = l.idle.PushFront(client)
	}
}

// releaser returns the release function of one acquisition: it undoes it once, under the lock.
func (l *Limiter) releaser(client *entry, undo func(*entry)) func() {
	var once sync.Once

	return func() {
		once.Do(func() {
			l.mu.Lock()
			defer l.mu.Unlock()

			undo(client)
			l.settle(client)
		})
	}
}

func (l *Limiter) refill(client *entry, now time.Time) {
	elapsed := now.Sub(client.refilledAt).Seconds()
	if elapsed > 0 {
		client.tokens = math.Min(l.burst, client.tokens+elapsed*l.refillPerSecond)
	}

	client.refilledAt = now
}

// untilNextToken is the time until the client has one whole token, in whole seconds rounded up,
// at least 1 (configuration-security.md section 5).
func (l *Limiter) untilNextToken(client *entry) int {
	if l.refillPerSecond <= 0 {
		return math.MaxInt32
	}

	seconds := int(math.Ceil((1 - client.tokens) / l.refillPerSecond))

	return max(seconds, 1)
}
