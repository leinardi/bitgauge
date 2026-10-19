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

/**
 * A request's ledger entry. A request without telemetry carries its lower bound's latest server
 * end so far, and an ended one its upper bound's earliest server start so far: each confirmation
 * updates them, so a released confirmed entry is never needed to compute them again.
 */
type Entry =
  | { state: 'in-flight'; sentAt: number; lbEnd: number | null }
  | { state: 'confirmed'; sentAt: number; doneAt: number; telemetry: ConfirmedTelemetry }
  | { state: 'ended'; sentAt: number; endedAt: number; lbEnd: number | null; ubStart: number | null }

type Confirmed = Extract<Entry, { state: 'confirmed' }>

function serverEnd(entry: Confirmed): number {
  return entry.telemetry.startMs + entry.telemetry.durationMs
}

function later(bound: number | null, value: number): number {
  return bound === null ? value : Math.max(bound, value)
}

function earlier(bound: number | null, value: number): number {
  return bound === null ? value : Math.min(bound, value)
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
  /** The entries kept, by id in send order: every one until a release drops confirmed ones. */
  private readonly entries = new Map<RequestId, Entry>()
  private sent = 0
  /** The requests in flight when the phase stopped issuing, by stream; empty until then. */
  private readonly drain: RequestId[][] = []
  private confirmedCount = 0
  /** P_start and the latest server end over every confirmed request, released ones included. */
  private earliestStart: number | null = null
  private latestEnd: number | null = null
  /** The released confirmed requests' latest server end and latest client done. */
  private released: { latestEnd: number; doneAt: number } | null = null

  /** Records a request sent at client instant `sentAt` (t_send) and returns its id. */
  send(sentAt: number): RequestId {
    let lbEnd = this.released !== null && this.released.doneAt <= sentAt ? this.released.latestEnd : null
    for (const confirmed of this.confirmedEntries()) {
      if (confirmed.doneAt <= sentAt) {
        lbEnd = later(lbEnd, serverEnd(confirmed))
      }
    }
    const id = this.sent++
    this.entries.set(id, { state: 'in-flight', sentAt, lbEnd })
    return id
  }

  /** Records the telemetry of request `id`, received at client instant `doneAt` (t_done). */
  confirm(id: RequestId, doneAt: number, telemetry: ConfirmedTelemetry): void {
    const entry = this.inFlight(id)
    this.grid.add(telemetry)
    const confirmed: Confirmed = { state: 'confirmed', sentAt: entry.sentAt, doneAt, telemetry }
    this.entries.set(id, confirmed)
    this.confirmedCount++
    this.earliestStart = earlier(this.earliestStart, telemetry.startMs)
    this.latestEnd = later(this.latestEnd, serverEnd(confirmed))
    for (const other of this.entries.values()) {
      if (other.state !== 'confirmed' && doneAt <= other.sentAt) {
        other.lbEnd = later(other.lbEnd, serverEnd(confirmed))
      }
      if (other.state === 'ended' && entry.sentAt >= other.endedAt) {
        other.ubStart = earlier(other.ubStart, telemetry.startMs)
      }
    }
  }

  /**
   * Records that request `id` ended without telemetry at client instant `endedAt` (t_end):
   * aborted, timed out, answered with an error status, or rejected by validation.
   */
  end(id: RequestId, endedAt: number): void {
    const entry = this.inFlight(id)
    let ubStart: number | null = null
    for (const confirmed of this.confirmedEntries()) {
      if (confirmed.sentAt >= endedAt) {
        ubStart = earlier(ubStart, confirmed.telemetry.startMs)
      }
    }
    this.entries.set(id, { state: 'ended', sentAt: entry.sentAt, endedAt, lbEnd: entry.lbEnd, ubStart })
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

  /**
   * Drops the confirmed requests no decision reads again: those whose every cell lies before
   * server cell `cell`, done by client instant `at` and sent before it, and not drained at a halt.
   * The caller promises that no window counts a request with a cell before `cell` from here on, and
   * that every later send or end happens at or after `at`. Their bounds, P_start, M_end and the
   * confirmed count keep what they gave; the grid keeps their bytes (UploadGrid.release drops those).
   */
  release(cell: number, at: number): void {
    const drained = new Set(this.drain.flat())
    for (const [id, entry] of this.entries) {
      if (entry.state !== 'confirmed' || drained.has(id)) {
        continue
      }
      const lastCell = entry.telemetry.firstBucket + entry.telemetry.buckets.length - 1
      if (lastCell < cell && entry.doneAt <= at && entry.sentAt < at) {
        this.released = { latestEnd: later(this.released?.latestEnd ?? null, serverEnd(entry)), doneAt: later(this.released?.doneAt ?? null, entry.doneAt) }
        this.entries.delete(id)
      }
    }
  }

  /**
   * Continuous only: drops the closed requests whose failure gap ends by `beforeMs` on the server
   * timeline, every cell of it already handed on, and returns their gaps for the direction's
   * events. A closed request's bounds no longer move once its gap lies before the window end.
   */
  releaseGaps(beforeMs: number): FailureGap[] {
    const gaps: FailureGap[] = []
    for (const [id, entry] of this.entries) {
      const endMs = entry.state === 'ended' ? this.upperBound(id) : null
      const startMs = endMs === null ? null : this.lowerBound(id)
      if (endMs !== null && startMs !== null && endMs <= beforeMs) {
        gaps.push({ startMs, endMs })
        this.entries.delete(id)
      }
    }
    return gaps
  }

  /** How many requests confirmed, released ones included. */
  get confirmedRequests(): number {
    return this.confirmedCount
  }

  /** The telemetry of the confirmed requests kept, in send order. */
  confirmed(): ConfirmedTelemetry[] {
    return this.confirmedEntries().map((entry) => entry.telemetry)
  }

  /** P_start: the earliest first byte over the confirmed requests; null before the first. */
  phaseStart(): number | null {
    return this.earliestStart
  }

  /**
   * M_end_so_far (M_end once the phase and its grace are over); null before the first. After the
   * stop, the instant the first stream fell quiet: the smallest, over the streams with requests in
   * flight at the stop, of the latest server end among those of them that confirmed; the maximum
   * over every confirmed request while none of them has, or when none was in flight.
   */
  measurementEnd(): number | null {
    if (this.latestEnd === null) {
      return null
    }
    const quiet = this.drain
      .filter((ids) => ids !== undefined)
      .map((ids) => ids.map((id) => this.entries.get(id)).filter((entry): entry is Confirmed => entry?.state === 'confirmed').map(serverEnd))
      .filter((stream) => stream.length > 0)
      .map((stream) => Math.max(...stream))
    return quiet.length === 0 ? this.latestEnd : Math.min(...quiet)
  }

  /**
   * lb(u): the latest server end among the confirmed requests done on the client by the time u
   * was sent, or P_start without one. Null for a request with telemetry, or before any.
   */
  lowerBound(id: RequestId): number | null {
    const entry = this.entries.get(id)
    if (entry === undefined || entry.state === 'confirmed' || this.earliestStart === null) {
      return null
    }
    return entry.lbEnd === null ? this.earliestStart : Math.max(this.earliestStart, entry.lbEnd)
  }

  /**
   * ub(u), HTTP/2 and HTTP/3 only: the earliest server start among the confirmed requests sent
   * at or after u ended on the client. Null while undefined.
   */
  upperBound(id: RequestId): number | null {
    const entry = this.entries.get(id)
    if (entry?.state !== 'ended' || !allowsUpperBound(this.protocol)) {
      return null
    }
    return entry.ubStart
  }

  /** Whether request `id` is open: without telemetry, and in flight or with no upper bound. */
  isOpen(id: RequestId): boolean {
    const entry = this.entries.get(id)
    if (entry === undefined || entry.state === 'confirmed') {
      return false
    }
    return entry.state === 'in-flight' || this.upperBound(id) === null
  }

  /** The failure gaps [lb(u), ub(u)) of the closed requests, in send order. */
  failureGaps(): FailureGap[] {
    const gaps: FailureGap[] = []
    for (const [id, entry] of this.entries) {
      const endMs = entry.state === 'ended' ? this.upperBound(id) : null
      const startMs = endMs === null ? null : this.lowerBound(id)
      if (endMs !== null && startMs !== null) {
        gaps.push({ startMs, endMs })
      }
    }
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
    for (const id of this.entries.keys()) {
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

  /** The entries and grid cells kept, which the footprint test reads. */
  footprint(): { uploadEntries: number; uploadCells: number } {
    return { uploadEntries: this.entries.size, uploadCells: this.grid.footprint() }
  }

  private confirmedEntries(): Confirmed[] {
    return [...this.entries.values()].filter((entry): entry is Confirmed => entry.state === 'confirmed')
  }

  private inFlight(id: RequestId): Extract<Entry, { state: 'in-flight' }> {
    const entry = this.entries.get(id)
    if (entry?.state !== 'in-flight') {
      throw new Error(`upload request ${id} is not in flight`)
    }
    return entry
  }
}
