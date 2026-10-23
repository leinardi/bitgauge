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

import { deferred, inFlightLimit, issuesEarly } from '@/engine/phases/issue'
import { dataBudget, serverBound } from '@/engine/phases/options'
import type { RateLimitWaits } from '@/engine/phases/refusal'
import type { Clock, UploadResponse } from '@/engine/types'
import type { UploadOptions } from '@/engine/upload/phase'
import type { UploadRequest, UploadStreams } from '@/engine/upload/streams'
import { NO_HOLD, type PreparationTurn, type TurnHold } from '@/engine/upload/turn'
import type { UploadLedger } from '@/engine/upload/watermark'

// The upload streams' requests (measurement.md sections 3 and 7.2): each stream sends sized
// requests back to back, or early once the browser's issue gap has shown, taking the preparation
// turn for a large body, within the data cap and the server's in-flight bound. The phase owns the
// ledger and decides what each answer means.

const TIMEOUT_MS = 30_000

/** A request in flight. */
export interface InFlight {
  request: UploadRequest
  controller: AbortController
  /** Set once the phase has ended the request itself. */
  closed: boolean
}

/** What a stream's requests read and report of their phase. */
export interface UploadIssueHost {
  readonly clock: Clock
  readonly options: UploadOptions
  readonly streams: UploadStreams
  readonly turn: PreparationTurn
  readonly ledger: UploadLedger
  /** The requests in flight; the phase closes those left at its end. */
  readonly inFlight: Set<InFlight>
  /** The streams waiting out a rate-limit refusal (measurement.md section 4). */
  readonly waits: RateLimitWaits
  /** Whether the stream still issues: the phase issues and the stream is within the count. */
  issues(stream: number): boolean
  /** The bytes sent so far in the phase. */
  dataUsed(): number
  /** The data cap allows no further request. */
  capped(): void
  /** A request the phase has not closed ended: its answer, or null without one. */
  settled(flight: InFlight, response: UploadResponse | null): void
}

/**
 * One stream: requests back to back, or early (measurement.md section 3), while the phase issues
 * and the stream is within the count and the server's in-flight bound. After a rate-limit refusal
 * the stream waits it out first (section 4).
 */
export async function uploadLoop(host: UploadIssueHost, stream: number): Promise<void> {
  let early = false
  while (host.issues(stream)) {
    const wait = host.waits.before(stream)
    if (wait !== null && ((await wait) === 'idle' || !host.issues(stream))) {
      return
    }
    let size = nextSize(host, stream)
    let hold = NO_HOLD
    if (size !== null && host.turn.waits(size)) {
      hold = await host.turn.take()
      if (!host.issues(stream)) {
        hold.release()
        return
      }
      size = nextSize(host, stream)
    }
    if (size === null) {
      hold.release()
      host.capped()
      return
    }
    if (wait !== null) {
      host.waits.issued()
    }
    const first = deferred<number>()
    const done = request(host, stream, size, hold, early, first.resolve)
    const watched = { firstByte: first.promise, done, expectedMs: host.streams.expectedMs(stream, size), tailMs: host.streams.tailMs }
    early = (await issuesEarly(host.clock, host.streams.leadMs, watched)) && host.inFlight.size < inFlightLimit(host.ledger.protocol, serverBound(host.options.limits.maxStreamsPerClient, host.options.streamCap))
    if (!early) {
      await done
    }
  }
}

function nextSize(host: UploadIssueHost, stream: number): number | null {
  return host.streams.nextSize(stream, host.options.limits.maxUploadBytes, budget(host))
}

/** What the data cap still allows after data used and the bytes still to send in flight. */
function budget(host: UploadIssueHost): number | null {
  let pending = 0
  for (const flight of host.inFlight) {
    pending += flight.request.size - flight.request.sent
  }
  return dataBudget(host.options, host.dataUsed(), pending)
}

/**
 * Sends one request: `hold` is its hold on the preparation turn (measurement.md section 7.2),
 * `early` whether it went before the stream's previous answer (section 3); `firstByte` hears of
 * the first byte sent, or of the send when the browser reports no progress, for the next early.
 */
async function request(host: UploadIssueHost, stream: number, size: number, hold: TurnHold, early: boolean, firstByte: (at: number) => void): Promise<void> {
  const { clock } = host
  const sentAt = clock.now()
  const issued = host.streams.issue(host.ledger.send(sentAt), stream, size, sentAt, early)
  const flight: InFlight = { request: issued, controller: new AbortController(), closed: false }
  host.inFlight.add(flight)
  const timeout = clock.setTimer(TIMEOUT_MS, () => flight.controller.abort())
  if (host.turn.dropped) {
    firstByte(sentAt)
  }
  const progress = (sent: number): void => {
    if (issued.sent === 0 && sent > 0) {
      firstByte(clock.now())
    }
    issued.sent = Math.max(issued.sent, Math.min(sent, size))
    hold.progress(sent)
  }
  let response: UploadResponse | null = null
  hold.sent()
  try {
    response = await host.options.transport.upload(size, progress, flight.controller.signal)
  } catch {
    // Aborted, timed out, or a network error.
  }
  clock.clearTimer(timeout)
  hold.release()
  if (!flight.closed) {
    host.settled(flight, response)
  }
}
