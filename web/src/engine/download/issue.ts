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

import type { DownloadOptions } from '@/engine/download/phase'
import type { DownloadRequest, Streams } from '@/engine/download/streams'
import { deferred, inFlightLimit, issuesEarly } from '@/engine/phases/issue'
import { dataBudget, serverBound } from '@/engine/phases/options'
import type { RateLimitWaits } from '@/engine/phases/refusal'
import type { Clock, DownloadChunk, Refusal, ResourceTiming } from '@/engine/types'

// The download streams' requests (measurement.md sections 3 and 6): each stream issues sized
// requests back to back, or early once the browser's issue gap has shown, within the data cap and
// the server's in-flight bound. The phase owns what they count into and decides what a request's
// end means.

/** A request still running after this long is aborted and counts as failed. */
const TIMEOUT_MS = 30_000

/** What a stream's requests read and report of their phase. */
export interface DownloadIssueHost {
  readonly clock: Clock
  readonly options: DownloadOptions
  readonly streams: Streams
  /** The requests in flight; the phase aborts them all at its end. */
  readonly inFlight: Map<DownloadRequest, AbortController>
  /** The streams waiting out a rate-limit refusal (measurement.md section 4). */
  readonly waits: RateLimitWaits
  /** Whether the stream still issues: the phase runs and the stream is within the count. */
  issues(stream: number): boolean
  /** The protocol of the latest request with a timing entry. */
  protocol(): string | null
  /** The bytes read so far in the phase. */
  read(): number
  /** The data cap allows no further request. */
  capped(): void
  /** An answer's Content-Encoding, which the phase reports when present. */
  encoding(contentEncoding: string | null): void
  /** A chunk of a request's body arrived. */
  count(request: DownloadRequest, chunk: DownloadChunk): void
  /** A request's Resource Timing entry. */
  record(timing: ResourceTiming | null): void
  /** A request ended: complete when its whole body arrived; `status` is 0 without an answer. */
  settled(request: DownloadRequest, complete: boolean, status: number, refusal: Refusal | undefined): void
}

/**
 * One stream: requests back to back while the phase runs and the stream is within the count, each
 * issued at the previous one's end or early (measurement.md section 3), within the server's
 * in-flight bound. After a rate-limit refusal the stream waits it out first (section 4).
 */
export async function downloadLoop(host: DownloadIssueHost, stream: number): Promise<void> {
  while (host.issues(stream)) {
    const wait = host.waits.before(stream)
    if (wait !== null && ((await wait) === 'idle' || !host.issues(stream))) {
      return
    }
    const size = host.streams.nextSize(stream, host.options.limits.maxDownloadBytes, budget(host))
    if (size === null) {
      // The requests in flight may hold what the cap still allows: the phase ends once they have
      // moved it (measurement.md section 5), or the stream issues again if one failed and left some.
      const pending = [...host.inFlight.keys()].flatMap((request) => settlement.get(request) ?? [])
      if (pending.length > 0) {
        await Promise.race(pending)
        continue
      }
      host.capped()
      return
    }
    if (wait !== null) {
      host.waits.issued()
    }
    const issuedAt = host.clock.now()
    const first = deferred<number>()
    const done = request(host, stream, size, issuedAt, first.resolve)
    const watched = { firstByte: first.promise, done, expectedMs: host.streams.expectedMs(stream, size), tailMs: 0 }
    if (!(await issuesEarly(host.clock, host.streams.leadMs, watched)) || host.inFlight.size >= inFlightLimit(host.protocol(), serverBound(host.options.limits.maxStreamsPerClient, host.options.streamCap))) {
      await done
    }
  }
}

/** What the data cap still allows after data used and the bytes still to come in flight. */
function budget(host: DownloadIssueHost): number | null {
  let pending = 0
  for (const request of host.inFlight.keys()) {
    pending += request.size - request.read
  }
  return dataBudget(host.options, host.read(), pending)
}

/** Each request in flight's end, after its phase has heard of it, which a capped stream waits for. */
const settlement = new WeakMap<DownloadRequest, Promise<void>>()

/** `firstChunk` is told the instant of the first chunk, which the early issue of the next watches. */
async function request(host: DownloadIssueHost, stream: number, size: number, issuedAt: number, firstChunk: (at: number) => void): Promise<void> {
  const issued = host.streams.issue(stream, size, issuedAt)
  const controller = new AbortController()
  const settled = deferred<void>()
  settlement.set(issued, settled.promise)
  host.inFlight.set(issued, controller)
  const timeout = host.clock.setTimer(TIMEOUT_MS, () => controller.abort())
  let status = 0
  let refusal: Refusal | undefined
  let complete = false
  try {
    const response = await host.options.transport.download(size, controller.signal)
    status = response.status
    refusal = response.refusal
    if (status === 200) {
      host.encoding(response.contentEncoding)
      for await (const chunk of response.chunks) {
        if (issued.firstChunkAt === null) {
          firstChunk(chunk.at)
        }
        host.count(issued, chunk)
      }
      host.record(response.timing())
      // A body shorter or longer than asked for, without an abort, is a failed request.
      complete = issued.read === size
    }
  } catch {
    // Aborted at the end of the phase, timed out, or a network error.
  } finally {
    host.clock.clearTimer(timeout)
    host.inFlight.delete(issued)
    if (!complete) {
      // Releases the connection of an answer whose body was not read, such as a 429's.
      controller.abort()
    }
  }
  host.settled(issued, complete, status, refusal)
  settled.resolve()
}
