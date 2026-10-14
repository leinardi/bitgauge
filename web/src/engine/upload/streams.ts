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

import { nextSize, SIZE_FLOOR, streamRate } from '@/engine/phases/sizing'
import { percentile } from '@/engine/stats/buckets'
import type { RequestId } from '@/engine/upload/watermark'
import type { UploadTelemetry } from '@/engine/types'

// Upload stream bookkeeping (measurement.md sections 3, 5 and 7): each stream's last confirmed
// request sizes its next one at the server's rate, each request's expected duration sizes the
// grace, and the confirmed requests give the proxy-buffering check and the display offset.

/** A request is checked for proxy buffering only from this client duration on. */
const BUFFERING_MIN_MS = 1000

/** Below this share of the client duration, the server's read time suggests a buffering proxy. */
const BUFFERING_SHARE = 0.1

/** A stream idle, beyond the round trip, for more than this share of a request's client duration is not losing a few round trips. */
export const IDLE_SHARE = 0.2

/** A request's idle share is read only from a server duration of at least one bucket. */
const IDLE_MIN_DURATION_MS = 100

/** The RTT the idle share subtracts when idle latency was skipped. */
const DEFAULT_RTT_MS = 100

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
}

interface StreamState {
  size: number | null
  /** rate_s of its last confirmed request, in bytes per second. */
  rate: number
  confirmed: number
  /** The first byte, on the server timeline, of its first confirmed request. */
  firstStartMs: number | null
}

export class UploadStreams {
  /** Whether a confirmed request of at least 1 s on the client was read in under 10 % of it. */
  bufferingSuspected = false
  private readonly streams: StreamState[] = []
  /** t_done − (startMs + durationMs) of every confirmed request. */
  private readonly offsets: number[] = []

  /** How many streams have been started. */
  get started(): number {
    return this.streams.length
  }

  /** Starts a stream; returns its index. */
  add(): number {
    return this.streams.push({ size: null, rate: 0, confirmed: 0, firstStartMs: null }) - 1
  }

  /** The size of the stream's next request, or null when the data cap leaves less than the floor. */
  nextSize(stream: number, cap: number, budget: number | null): number | null {
    const state = this.state(stream)
    return nextSize(state.rate, state.size, SIZE_FLOOR, cap, budget)
  }

  /**
   * The largest share of a confirmed request's client duration in which its stream sat idle beyond
   * the round trip, such as a browser preparing the body before sending it (measurement.md section
   * 8.2); null while no request lost more than IDLE_SHARE.
   */
  idleShare: number | null = null
  private readonly rttMs: number

  constructor(rttMs: number | null) {
    this.rttMs = rttMs ?? DEFAULT_RTT_MS
  }

  /** Records a request as sent. */
  issue(id: RequestId, stream: number, size: number, sentAt: number): UploadRequest {
    const state = this.state(stream)
    const expectedMs = state.size === null ? null : (size * 1000) / state.rate
    return { id, stream, size, sentAt, sent: 0, expectedMs }
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
    const clientMs = doneAt - request.sentAt
    const idle = (clientMs - telemetry.durationMs - this.rttMs) / clientMs
    if (telemetry.durationMs >= IDLE_MIN_DURATION_MS && idle > IDLE_SHARE) {
      this.idleShare = Math.max(this.idleShare ?? 0, idle)
    }
    if (clientMs >= BUFFERING_MIN_MS && telemetry.durationMs < BUFFERING_SHARE * clientMs) {
      this.bufferingSuspected = true
    }
    this.offsets.push(doneAt - (telemetry.startMs + telemetry.durationMs))
  }

  /** The confirmed requests of each of the first `active` streams. */
  confirmedPerStream(active: number): number[] {
    return this.streams.slice(0, active).map((state) => state.confirmed)
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

  /** The display-only offset of section 7.4: the median of t_done − server end; null before one. */
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
