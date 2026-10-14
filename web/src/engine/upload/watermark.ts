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

import { type CellCounts, UploadGrid } from '@/engine/upload/grid'

// The request ledger of one upload phase and the confirmed watermark (measurement.md section 7.5).
// Client instants (t_send, t_done, t_end) are on the engine's Clock; server instants (startMs,
// durationMs, the bounds, the watermark) are on the server grid's timeline. The two never mix: a
// client instant is only compared with another client instant, to order requests causally.

/** What the engine keeps of a confirmed request's telemetry (wire-protocol.md section 4). */
export interface ConfirmedTelemetry extends CellCounts {
  /** First byte read, on the server timeline. */
  startMs: number
  /** First to last byte read. */
  durationMs: number
}

/** The server interval a closed request's unknown activity is confined to: [startMs, endMs). */
export interface FailureGap {
  startMs: number
  endMs: number
}

type Entry =
  | { state: 'in-flight'; sentAt: number }
  | { state: 'confirmed'; sentAt: number; doneAt: number; telemetry: ConfirmedTelemetry }
  | { state: 'ended'; sentAt: number; endedAt: number }

type Confirmed = Extract<Entry, { state: 'confirmed' }>

function serverEnd(entry: Confirmed): number {
  return entry.telemetry.startMs + entry.telemetry.durationMs
}

/**
 * Whether the upload's protocol bounds an ended request from above: HTTP/2 and HTTP/3 only. On
 * HTTP/1.1, or when the browser does not report the protocol, there is no upper bound.
 */
export function allowsUpperBound(protocol: string): boolean {
  return protocol === 'h2' || protocol === 'h3'
}

export type RequestId = number

/** The requests of one upload phase, from their send to their telemetry or their end. */
export class UploadLedger {
  /** S_up over the confirmed requests. */
  readonly grid = new UploadGrid()
  /** The upload requests' nextHopProtocol; empty while unreported. */
  protocol = ''
  private readonly entries: Entry[] = []
  /** The requests in flight when the phase stopped issuing, by stream; empty until then. */
  private readonly drain: RequestId[][] = []

  /** Records a request sent at client instant `sentAt` (t_send) and returns its id. */
  send(sentAt: number): RequestId {
    this.entries.push({ state: 'in-flight', sentAt })
    return this.entries.length - 1
  }

  /** Records the telemetry of request `id`, received at client instant `doneAt` (t_done). */
  confirm(id: RequestId, doneAt: number, telemetry: ConfirmedTelemetry): void {
    const entry = this.inFlight(id)
    this.grid.add(telemetry)
    this.entries[id] = { state: 'confirmed', sentAt: entry.sentAt, doneAt, telemetry }
  }

  /**
   * Records that request `id` ended without telemetry at client instant `endedAt` (t_end):
   * aborted, timed out, answered with an error status, or rejected by validation.
   */
  end(id: RequestId, endedAt: number): void {
    const entry = this.inFlight(id)
    this.entries[id] = { state: 'ended', sentAt: entry.sentAt, endedAt }
  }

  /**
   * Records that the phase stopped issuing with these requests in flight, each with its stream:
   * the window ends where the first of their streams falls quiet (measurement.md section 7.5).
   */
  halt(inFlight: Iterable<{ id: RequestId; stream: number }>): void {
    for (const { id, stream } of inFlight) {
      ;(this.drain[stream] ??= []).push(id)
    }
  }

  /** The telemetry of the confirmed requests, in send order. */
  confirmed(): ConfirmedTelemetry[] {
    return this.confirmedEntries().map((entry) => entry.telemetry)
  }

  /** P_start: the earliest first byte over the confirmed requests; null before the first. */
  phaseStart(): number | null {
    const starts = this.confirmedEntries().map((entry) => entry.telemetry.startMs)
    return starts.length === 0 ? null : Math.min(...starts)
  }

  /**
   * M_end_so_far (M_end once the phase and its grace are over); null before the first. After the
   * stop, the instant the first stream fell quiet: the smallest, over the streams with requests in
   * flight at the stop, of the latest server end among those of them that confirmed; the maximum
   * over every confirmed request while none of them has, or when none was in flight.
   */
  measurementEnd(): number | null {
    const ends = this.confirmedEntries().map(serverEnd)
    if (ends.length === 0) {
      return null
    }
    const quiet = this.drain
      .filter((ids) => ids !== undefined)
      .map((ids) => ids.map((id) => this.entries[id]).filter((entry): entry is Confirmed => entry?.state === 'confirmed').map(serverEnd))
      .filter((stream) => stream.length > 0)
      .map((stream) => Math.max(...stream))
    return quiet.length === 0 ? Math.max(...ends) : Math.min(...quiet)
  }

  /**
   * lb(u): the latest server end among the confirmed requests done on the client by the time u
   * was sent, or P_start without one. Null for a request with telemetry, or before any.
   */
  lowerBound(id: RequestId): number | null {
    const entry = this.entries[id]
    if (entry === undefined || entry.state === 'confirmed') {
      return null
    }
    let bound = this.phaseStart()
    for (const confirmed of this.confirmedEntries()) {
      if (confirmed.doneAt <= entry.sentAt) {
        bound = Math.max(bound ?? Number.NEGATIVE_INFINITY, serverEnd(confirmed))
      }
    }
    return bound
  }

  /**
   * ub(u), HTTP/2 and HTTP/3 only: the earliest server start among the confirmed requests sent
   * at or after u ended on the client. Null while undefined.
   */
  upperBound(id: RequestId): number | null {
    const entry = this.entries[id]
    if (entry?.state !== 'ended' || !allowsUpperBound(this.protocol)) {
      return null
    }
    let bound: number | null = null
    for (const confirmed of this.confirmedEntries()) {
      if (confirmed.sentAt >= entry.endedAt) {
        bound = Math.min(bound ?? Number.POSITIVE_INFINITY, confirmed.telemetry.startMs)
      }
    }
    return bound
  }

  /** Whether request `id` is open: without telemetry, and in flight or with no upper bound. */
  isOpen(id: RequestId): boolean {
    const entry = this.entries[id]
    if (entry === undefined || entry.state === 'confirmed') {
      return false
    }
    return entry.state === 'in-flight' || this.upperBound(id) === null
  }

  /** The failure gaps [lb(u), ub(u)) of the closed requests, in send order. */
  failureGaps(): FailureGap[] {
    const gaps: FailureGap[] = []
    this.entries.forEach((entry, id) => {
      const endMs = entry.state === 'ended' ? this.upperBound(id) : null
      const startMs = endMs === null ? null : this.lowerBound(id)
      if (endMs !== null && startMs !== null) {
        gaps.push({ startMs, endMs })
      }
    })
    return gaps
  }

  /**
   * C: the smallest lower bound over the open requests, or M_end_so_far when none is open. Null
   * before the first confirmed request.
   */
  watermark(): number | null {
    const end = this.measurementEnd()
    if (end === null) {
      return null
    }
    let watermark = end
    for (let id = 0; id < this.entries.length; id++) {
      const bound = this.isOpen(id) ? this.lowerBound(id) : null
      if (bound !== null) {
        watermark = Math.min(watermark, bound)
      }
    }
    return watermark
  }

  /** W_end = min(C, M_end_so_far); after the phase and its grace, W_end_final. */
  windowEnd(): number | null {
    const watermark = this.watermark()
    const end = this.measurementEnd()
    return watermark === null || end === null ? null : Math.min(watermark, end)
  }

  private confirmedEntries(): Confirmed[] {
    return this.entries.filter((entry): entry is Confirmed => entry.state === 'confirmed')
  }

  private inFlight(id: RequestId): Extract<Entry, { state: 'in-flight' }> {
    const entry = this.entries[id]
    if (entry?.state !== 'in-flight') {
      throw new Error(`upload request ${id} is not in flight`)
    }
    return entry
  }
}
