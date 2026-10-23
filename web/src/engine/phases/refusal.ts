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

import type { DirectionEvent, Direction, FailureCode, Notice } from '@/engine/messages'
import type { Clock, Refusal, TimerId } from '@/engine/types'

// The rate-limit 429 of measurement.md section 4: a `rate_limited` or `table_full` refusal makes
// the stream that got it wait the server's Retry-After before its next request, with the stream
// count unchanged, where a stream-limit 429 lowers the cap instead. The phase still counts the
// refusal as a failure (section 5).

/** Consecutive failed requests that end the phase with an error (measurement.md section 5). */
const MAX_FAILURES = 3

const TOO_MANY_REQUESTS = 429

/** The wait when a refusal's Retry-After cannot be read. */
const RETRY_AFTER_FALLBACK_MS = 1000

/** Which rate limit refused a request: the per-minute rate, or a full rate-limit table. */
export type RefusalReason = 'rate' | 'table-full'

/** The run error three failures raise when the last was a rate-limit refusal of this reason. */
const FAILURE_CODES = { rate: 'rate-limited', 'table-full': 'server-busy' } as const

/** The rate limit a 429 names, or null for a stream limit: `too_many_streams`, or no known code. */
function refusalReason(refusal: Refusal | undefined): RefusalReason | null {
  switch (refusal?.code) {
    case 'rate_limited':
      return 'rate'
    case 'table_full':
      return 'table-full'
    default:
      return null
  }
}

/** A phase's rate-limit refusals: the streams waiting them out, and the notice they leave. */
export class RateLimitWaits {
  private readonly clock: Clock
  /** The last client instant a request may be issued at; Infinity without one. */
  private readonly cutoff: () => number
  /** When each waiting stream may issue its next request. */
  private readonly until = new Map<number, number>()
  private readonly timers = new Map<TimerId, () => void>()
  private reason: RefusalReason | null = null
  private retried = false

  constructor(clock: Clock, cutoff: () => number) {
    this.clock = clock
    this.cutoff = cutoff
  }

  /**
   * A rate-limit refusal of `stream`: when `waits`, the stream waits `retryAfterMs`, or the
   * fallback, before its next request; otherwise the refusal ended the phase and is only noted.
   */
  refused(stream: number, reason: RefusalReason, retryAfterMs: number | null, waits: boolean): void {
    this.reason = reason
    if (waits) {
      this.until.set(stream, this.clock.now() + (retryAfterMs ?? RETRY_AFTER_FALLBACK_MS))
    }
  }

  /**
   * The stream's wait before its next request, or null when it has none: resolves `waited` once
   * the wait has passed, or `idle` when the wait would end after the cut-off or the phase ended
   * first, and the stream issues nothing more.
   */
  before(stream: number): Promise<'waited' | 'idle'> | null {
    const until = this.until.get(stream)
    if (until === undefined) {
      return null
    }
    this.until.delete(stream)
    if (until > this.cutoff()) {
      return Promise.resolve('idle')
    }
    return new Promise((resolve) => {
      const timer = this.clock.setTimer(Math.max(0, until - this.clock.now()), () => {
        this.timers.delete(timer)
        resolve('waited')
      })
      this.timers.set(timer, () => resolve('idle'))
    })
  }

  /** A stream that waited issued its next request. */
  issued(): void {
    this.retried = true
  }

  /** The phase ended: no stream waits any longer. */
  cancel(): void {
    for (const [timer, idle] of this.timers) {
      this.clock.clearTimer(timer)
      idle()
    }
    this.timers.clear()
    this.until.clear()
  }

  /** The direction's `rate-limited` notice, or null when no rate limit refused a request. */
  notice(direction: Direction): Notice | null {
    return this.reason === null ? null : { code: 'rate-limited', direction, reason: this.reason, retried: this.retried }
  }
}

/** What a failed request asks of its phase. */
export interface FailureVerdict {
  /** A stream-limit 429: the phase lowers its effective cap by one (measurement.md section 4). */
  lowerCap: boolean
  /** The third in a row: the phase ends with this error code; null while it continues. */
  ended: FailureCode | null
}

/** A phase's consecutive failed requests (measurement.md section 5) and its rate-limit waits. */
export class Failures {
  readonly waits: RateLimitWaits
  private count = 0

  constructor(clock: Clock, cutoff: () => number) {
    this.waits = new RateLimitWaits(clock, cutoff)
  }

  /** A request completed: the count starts over. */
  completed(): void {
    this.count = 0
  }

  /**
   * A request of `stream` failed with `status` (0 without an answer). `continues` is false when a
   * single failure ends the phase (an upload over HTTP/1.1, section 7.5): nothing waits then.
   */
  failed(stream: number, status: number, refusal: Refusal | undefined, continues = true): FailureVerdict {
    const reason = status === TOO_MANY_REQUESTS ? refusalReason(refusal) : null
    if (reason !== null) {
      this.waits.refused(stream, reason, refusal?.retryAfterMs ?? null, continues)
    }
    this.count++
    const ended = continues && this.count >= MAX_FAILURES ? (reason === null ? 'requests-failed' : FAILURE_CODES[reason]) : null
    return { lowerCap: continues && status === TOO_MANY_REQUESTS && reason === null, ended }
  }
}

/** The error code a direction's own error event carries: what three failures in a row raised. */
export function failureCode(events: readonly DirectionEvent[]): FailureCode {
  for (const event of events) {
    if (event.code === 'error' && (event.notice === 'rate-limited' || event.notice === 'server-busy')) {
      return event.notice
    }
  }
  return 'requests-failed'
}
