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

import type { IdleResult } from '@/engine/messages'
import { percentile } from '@/engine/stats/buckets'
import type { Clock, TimerId, Transport, WsEcho } from '@/engine/types'

// Idle latency (measurement.md section 10): sequential pings with one outstanding, over the
// WebSocket echo or, when it cannot be opened, over GET /api/v1/ping timed from its Resource Timing
// entry. Times are on the injected Clock; nothing is rounded, so samples keep the timer's
// resolution.

const PING_PATH = '/api/v1/ping'
const SPACING_MS = 100
const MAX_TIMEOUT_MS = 10_000
const MIN_TIMEOUT_MS = 2000
const TIMEOUT_MEDIANS = 4
const PHASE_LIMIT_MS = 30_000
const MIN_SAMPLES = 5

/** A ping's answer: its RTT, a loss, or no sample at all (a fallback answer without timing). */
export type PingAnswer = { rttMs: number } | 'lost' | 'unmeasured'

/** One ping path: sends ping `seq` and calls `answer` once it is answered. */
export interface Pinger {
  path: IdleResult['path']
  send(seq: number, sentAt: number, answer: (seq: number, result: PingAnswer) => void): void
}

/**
 * Pings over the WebSocket echo: RTT = echo arrival − send. Only the echo of the latest send is an
 * answer: a run restarted on the same echo numbers its pings from 0 again, so a late echo of a
 * stopped run's ping can carry the current sequence number, but never the current send time.
 */
export function webSocketPinger(echo: WsEcho): Pinger {
  let pending: { seq: number; sentAt: number; answer: (seq: number, result: PingAnswer) => void } | null = null
  echo.onPong((seq, sentAt, receivedAt) => {
    if (pending?.seq === seq && pending.sentAt === sentAt) {
      const { answer } = pending
      pending = null
      answer(seq, { rttMs: receivedAt - sentAt })
    }
  })
  return {
    path: 'websocket',
    send(seq, sentAt, answer) {
      pending = { seq, sentAt, answer }
      echo.ping(seq, sentAt)
    },
  }
}

/** Pings over GET /api/v1/ping: RTT = responseStart − requestStart of its timing entry. */
export function httpPinger(transport: Pick<Transport, 'probe'>): Pinger {
  return {
    path: 'http',
    send(seq, _sentAt, answer) {
      transport.probe(PING_PATH).then(
        (probe) => {
          if (probe.status !== 204) {
            answer(seq, 'lost')
          } else if (probe.timing === null) {
            answer(seq, 'unmeasured')
          } else {
            answer(seq, { rttMs: probe.timing.responseStart - probe.timing.requestStart })
          }
        },
        () => answer(seq, 'lost'),
      )
    },
  }
}

/** How idle latency ended. */
export interface IdleOutcome {
  result: IdleResult
  /** Fewer than 5 successful samples: no statistics. */
  unavailable: boolean
  /** Every counted ping was lost: the server-unreachable notice. */
  unreachable: boolean
}

/** The statistics of measurement.md section 10 over the samples, in send order. */
export function idleStatistics(
  samples: readonly number[],
): Required<Pick<IdleResult, 'minMs' | 'medianMs' | 'p90Ms' | 'jitterMs'>> {
  const median = percentile(samples, 50)
  const p90 = percentile(samples, 90)
  if (median === null || p90 === null) {
    throw new RangeError('idle statistics need at least one sample')
  }
  let jitter = 0
  for (let index = 1; index < samples.length; index++) {
    jitter += Math.abs((samples[index] ?? 0) - (samples[index - 1] ?? 0))
  }
  return {
    minMs: Math.min(...samples),
    medianMs: median,
    p90Ms: p90,
    // Mean absolute difference of consecutive samples; one sample has none.
    jitterMs: samples.length > 1 ? jitter / (samples.length - 1) : 0,
  }
}

/** One idle-latency run. A page that becomes visible again starts a new one. */
export class IdleLatency {
  private readonly clock: Clock
  private readonly pinger: Pinger
  private readonly count: number
  private readonly samples: number[] = []
  private lost = 0
  private sent = 0
  private lastSend: number | null = null
  private current: number | null = null
  private timer: TimerId | null = null
  private limit: TimerId | null = null
  private done: ((outcome: IdleOutcome | null) => void) | null = null

  /** `count` is the ping count, the warm-up ping included. */
  constructor(clock: Clock, pinger: Pinger, count: number) {
    this.clock = clock
    this.pinger = pinger
    this.count = count
  }

  /** Runs the pings; resolves with the outcome, or null when stopped. */
  run(): Promise<IdleOutcome | null> {
    return new Promise((resolve) => {
      this.done = resolve
      this.limit = this.clock.setTimer(PHASE_LIMIT_MS, () => this.finish())
      this.next()
    })
  }

  /** The running median of the samples so far, for the timeout policy; null before the first. */
  get medianMs(): number | null {
    return percentile(this.samples, 50)
  }

  /** Stops the run without an outcome. */
  stop(): void {
    this.settle(null)
  }

  private next(): void {
    if (this.done === null) {
      return
    }
    if (this.sent >= this.count) {
      this.finish()
      return
    }
    const wait = this.lastSend === null ? 0 : this.lastSend + SPACING_MS - this.clock.now()
    if (wait > 0) {
      this.timer = this.clock.setTimer(wait, () => this.send())
    } else {
      this.send()
    }
  }

  private send(): void {
    const seq = this.sent++
    const now = this.clock.now()
    this.lastSend = now
    this.current = seq
    this.timer = this.clock.setTimer(this.timeout(), () => this.answered(seq, 'lost'))
    this.pinger.send(seq, now, (answeredSeq, result) => this.answered(answeredSeq, result))
  }

  /** 10 s without a sample, then max(2 s, 4 × running median), capped at 10 s. */
  private timeout(): number {
    const median = this.medianMs
    return median === null ? MAX_TIMEOUT_MS : Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, TIMEOUT_MEDIANS * median))
  }

  private answered(seq: number, result: PingAnswer): void {
    // A late answer to a ping already counted as lost, or any answer after the end, is ignored.
    if (seq !== this.current || this.done === null) {
      return
    }
    this.current = null
    this.clearTimer()
    // The first ping is the warm-up: neither a sample nor a loss.
    if (seq > 0) {
      if (result === 'lost') {
        this.lost++
      } else if (result !== 'unmeasured') {
        this.samples.push(result.rttMs)
      }
    }
    this.next()
  }

  private finish(): void {
    const counted = this.samples.length + this.lost
    const unavailable = this.samples.length < MIN_SAMPLES
    const result: IdleResult = {
      path: this.pinger.path,
      lossPercent: counted === 0 ? 0 : (this.lost / counted) * 100,
      samples: [...this.samples],
      ...(unavailable ? {} : idleStatistics(this.samples)),
    }
    this.settle({ result, unavailable, unreachable: counted > 0 && this.samples.length === 0 })
  }

  private settle(outcome: IdleOutcome | null): void {
    const done = this.done
    if (done === null) {
      return
    }
    this.done = null
    this.clearTimer()
    if (this.limit !== null) {
      this.clock.clearTimer(this.limit)
    }
    done(outcome)
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.clock.clearTimer(this.timer)
      this.timer = null
    }
  }
}
