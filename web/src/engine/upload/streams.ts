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

import { DEFAULT_RTT_MS, IssueGaps, issueGap } from '@/engine/phases/issue'
import { nextSize, SIZE_FLOOR, streamRate } from '@/engine/phases/sizing'
import { percentile } from '@/engine/stats/buckets'
import type { RequestId } from '@/engine/upload/watermark'
import type { UploadTelemetry } from '@/engine/types'

// Upload stream bookkeeping (measurement.md sections 3, 5 and 7): each stream's last confirmed
// request sizes its next one at the server's rate, each request's expected duration sizes the
// grace and places its early issue, and the confirmed requests give the issue gap, the idle share,
// the proxy-buffering check and the display offset.

/** A request is checked for proxy buffering only from this client duration on. */
const BUFFERING_MIN_MS = 1000

/** Below this share of the client duration, the server's read time suggests a buffering proxy. */
const BUFFERING_SHARE = 0.1

/** A stream idle, beyond the round trip, for more than this share of a request's client duration is not losing a few round trips. */
export const IDLE_SHARE = 0.2

/** A request's idle share is read only from a server duration of at least one bucket. */
const IDLE_MIN_DURATION_MS = 100

/** A Continuous upload's display offset reads its last 100 confirmed requests (measurement.md section 15). */
const CONTINUOUS_OFFSETS = 100

/** One request of a stream, from its send to its telemetry or its end. */
export interface UploadRequest {
  id: RequestId
  stream: number
  size: number
  /** t_send on the client clock. */
  sentAt: number
  /** The bytes sent so far, from upload progress. */
  sent: number
  /** size / rate_s of the stream, or null for a stream's first request, whose rate is unknown. */
  expectedMs: number | null
  /** Whether it was issued early (measurement.md section 3). */
  early: boolean
}

interface StreamState {
  size: number | null
  /** rate_s of its last confirmed request, in bytes per second. */
  rate: number
  confirmed: number
  /** The first byte, on the server timeline, of its first confirmed request. */
  firstStartMs: number | null
  /** t_done of its last request that ended, on the client clock. */
  doneAt: number | null
}

export class UploadStreams {
  /** Whether a confirmed request of at least 1 s on the client was read in under 10 % of it. */
  bufferingSuspected = false
  private readonly streams: StreamState[] = []
  /** t_done − (startMs + durationMs) of every confirmed request, or in Continuous of the last 100. */
  private readonly offsets: number[] = []
  private readonly offsetLimit: number

  /** How many streams have been started. */
  get started(): number {
    return this.streams.length
  }

  /** Starts a stream; returns its index. */
  add(): number {
    return this.streams.push({ size: null, rate: 0, confirmed: 0, firstStartMs: null, doneAt: null }) - 1
  }

  /** The size of the stream's next request, or null when the data cap leaves less than the floor. */
  nextSize(stream: number, cap: number, budget: number | null): number | null {
    const state = this.state(stream)
    return nextSize(state.rate, state.size, SIZE_FLOOR, cap, budget)
  }

  /**
   * The largest share of a confirmed request's client duration that was its issue gap, such as a
   * browser preparing the body before sending it (measurement.md section 8.2): read from the
   * requests issued early once the phase turned to early issue, from every request before; null
   * while none lost more than IDLE_SHARE.
   */
  idleShare: number | null = null
  /** Set once the ramp has settled: early issue begins only then (measurement.md section 3). */
  settled = false
  private readonly gaps = new IssueGaps()
  private readonly rttMs: number

  constructor(rttMs: number | null, continuous = false) {
    this.rttMs = rttMs ?? DEFAULT_RTT_MS
    this.offsetLimit = continuous ? CONTINUOUS_OFFSETS : Number.POSITIVE_INFINITY
  }

  /** Whether streams issue their next request early (measurement.md section 3). */
  get early(): boolean {
    return this.settled && this.gaps.early
  }

  /** The lead of an early issue; null while streams re-request at the answer. */
  get leadMs(): number | null {
    return this.settled ? this.gaps.leadMs : null
  }

  /** The RTT the expected end of a request adds after its transfer: the response's way back. */
  get tailMs(): number {
    return this.rttMs
  }

  /** size / rate_s of the stream, the transfer a request of `size` is expected to take; null before its first confirms. */
  expectedMs(stream: number, size: number): number | null {
    const state = this.state(stream)
    return state.size === null ? null : (size * 1000) / state.rate
  }

  /** Records a request as sent; `early` when it was issued before the stream's previous one ended. */
  issue(id: RequestId, stream: number, size: number, sentAt: number, early = false): UploadRequest {
    return { id, stream, size, sentAt, sent: 0, expectedMs: this.expectedMs(stream, size), early }
  }

  /** Records a request that ended without confirmation. */
  ended(request: UploadRequest, at: number): void {
    this.state(request.stream).doneAt = at
  }

  /**
   * Records a confirmed request: its rate over the server's read time sizes the stream's next
   * request, and its client and server durations feed the buffering check and the offset.
   */
  confirm(request: UploadRequest, telemetry: UploadTelemetry, doneAt: number): void {
    const state = this.state(request.stream)
    state.size = request.size
    state.rate = streamRate(telemetry.bytes, telemetry.durationMs)
    state.confirmed++
    state.firstStartMs ??= telemetry.startMs
    const from = state.doneAt === null ? request.sentAt : Math.max(request.sentAt, state.doneAt)
    const gap = issueGap(request.sentAt, state.doneAt, doneAt, telemetry.durationMs, this.rttMs)
    state.doneAt = doneAt
    const wasEarly = this.early
    this.gaps.record(gap)
    if (this.early && !wasEarly) {
      // Early issue is what removes the idle: the shares read before it are forgotten.
      this.idleShare = null
    }
    const idle = gap / (doneAt - from)
    if ((request.early || !this.early) && telemetry.durationMs >= IDLE_MIN_DURATION_MS && idle > IDLE_SHARE) {
      // Read from every request before the turn to early issue, and from the early ones after it.
      this.idleShare = Math.max(this.idleShare ?? 0, idle)
    }
    const clientMs = doneAt - from
    if (clientMs >= BUFFERING_MIN_MS && telemetry.durationMs < BUFFERING_SHARE * clientMs) {
      this.bufferingSuspected = true
    }
    this.offsets.push(doneAt - (telemetry.startMs + telemetry.durationMs))
    if (this.offsets.length > this.offsetLimit) {
      this.offsets.shift()
    }
  }

  /** The confirmed requests of each of the first `active` streams. */
  confirmedPerStream(active: number): number[] {
    return this.streams.slice(0, active).map((state) => state.confirmed)
  }

  /** The sum of rate_s over the first `active` streams, null before one confirms (section 8.2). */
  summedRate(active: number): number | null {
    const rates = this.streams.slice(0, active).flatMap((state) => (state.confirmed > 0 ? [state.rate] : []))
    return rates.length === 0 ? null : rates.reduce((sum, rate) => sum + rate, 0)
  }

  /**
   * The latest first byte among streams `from` to `to` (exclusive), each at its first confirmed
   * request; null while one of them has none.
   */
  latestFirstStart(from: number, to: number): number | null {
    const starts: number[] = []
    for (const state of this.streams.slice(from, to)) {
      if (state.firstStartMs === null) {
        return null
      }
      starts.push(state.firstStartMs)
    }
    return starts.length === to - from ? Math.max(...starts) : null
  }

  /** The offsets kept, one per confirmed request, which the footprint test reads. */
  footprint(): number {
    return this.offsets.length
  }

  /** The display-only offset of section 7.4: the median of t_done − server end over the offsets kept; null before one. */
  displayOffset(): number | null {
    return percentile(this.offsets, 50)
  }

  private state(stream: number): StreamState {
    const state = this.streams[stream]
    if (state === undefined) {
      throw new RangeError(`stream ${stream} was never started`)
    }
    return state
  }
}
