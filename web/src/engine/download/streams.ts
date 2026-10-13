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

// Download stream bookkeeping: each stream's last completed request, which sizes its next one
// (measurement.md section 3), and every request's arrivals on the client timeline, which the
// warm-up's per-stream counts and the window condition read (sections 5 and 8.3).

/** One request of a stream, from its issue to its end. */
export interface DownloadRequest {
  stream: number
  size: number
  /** Bytes read so far. */
  read: number
  /** The arrival instants of its first and last chunk. */
  firstChunkAt: number | null
  lastChunkAt: number | null
  /** The first and last bucket it added bytes to. */
  firstBucket: number | null
  lastBucket: number | null
}

interface StreamState {
  /** The size of its last completed request, or null before the first one completes. */
  size: number | null
  /** rate_s of its last completed request, in bytes per second. */
  rate: number
  /** Its completed requests since the phase began. */
  completed: number
}

export class Streams {
  private readonly streams: StreamState[] = []
  private readonly requests: DownloadRequest[] = []

  /** How many streams have been started. */
  get started(): number {
    return this.streams.length
  }

  /** Starts a stream; returns its index. */
  add(): number {
    return this.streams.push({ size: null, rate: 0, completed: 0 }) - 1
  }

  /**
   * The size of the stream's next request, or null when the data cap leaves less than the floor.
   * `budget` is what the cap still allows after data used and every request in flight; null
   * without a data cap.
   */
  nextSize(stream: number, cap: number, budget: number | null): number | null {
    const state = this.state(stream)
    return nextSize(state.rate, state.size, SIZE_FLOOR, cap, budget)
  }

  /** Records a request as issued. */
  issue(stream: number, size: number): DownloadRequest {
    const request: DownloadRequest = {
      stream,
      size,
      read: 0,
      firstChunkAt: null,
      lastChunkAt: null,
      firstBucket: null,
      lastBucket: null,
    }
    this.requests.push(request)
    return request
  }

  /** Records a chunk of `bytes` that arrived at `at`, in bucket `bucket`. */
  chunk(request: DownloadRequest, bytes: number, at: number, bucket: number): void {
    request.read += bytes
    request.firstChunkAt ??= at
    request.lastChunkAt = at
    request.firstBucket ??= bucket
    request.lastBucket = bucket
  }

  /**
   * Records a request as completed: its rate over the first-to-last chunk time, with the floor of
   * one bucket, sizes the stream's next request.
   */
  complete(request: DownloadRequest): void {
    const state = this.state(request.stream)
    const transferMs = (request.lastChunkAt ?? 0) - (request.firstChunkAt ?? 0)
    state.size = request.size
    state.rate = streamRate(request.read, transferMs)
    state.completed++
  }

  /** The completed requests of each of the first `active` streams. */
  completedPerStream(active: number): number[] {
    return this.streams.slice(0, active).map((state) => state.completed)
  }

  /** The different requests that added bytes to the buckets from `from` to `to` (exclusive). */
  contributors(from: number, to: number): number {
    return this.requests.filter(
      (request) =>
        request.firstBucket !== null && request.lastBucket !== null && request.firstBucket < to && request.lastBucket >= from,
    ).length
  }

  private state(stream: number): StreamState {
    const state = this.streams[stream]
    if (state === undefined) {
      throw new RangeError(`stream ${stream} was never started`)
    }
    return state
  }
}
