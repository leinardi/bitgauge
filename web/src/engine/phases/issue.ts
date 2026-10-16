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

import type { Clock } from '@/engine/types'

// The issue gap and early issue of measurement.md section 3: a request's gap is the time its
// stream spent neither waiting for the network nor moving bytes, the browser's own cost per
// request. Once the largest gap seen exceeds 50 ms, a stream issues its next request by that gap
// before the current one's expected end, never before its first byte, instead of at its end.

/** Early issue begins once a gap this long has shown. */
export const ISSUE_GAP_MS = 50

/** The RTT the gap subtracts when idle latency was skipped. */
export const DEFAULT_RTT_MS = 100

/** Browsers open at most this many HTTP/1.1 connections to one host (measurement.md section 3). */
const HTTP1_CONNECTIONS = 6

/**
 * The most requests a phase keeps in flight, early ones included (section 3): the server's
 * per-client limit, and 6 unless the latest request reported HTTP/2 or HTTP/3, which multiplex one
 * connection. A request past the browser's connection limit would wait in the browser while its
 * client duration runs.
 */
export function inFlightLimit(protocol: string | null, serverMax: number): number {
  return protocol === 'h2' || protocol === 'h3' ? serverMax : Math.min(serverMax, HTTP1_CONNECTIONS)
}

/**
 * A request's issue gap: its client duration, counted from the later of its issue and the end of
 * the stream's previous request, minus its transfer time and the RTT; never below zero.
 */
export function issueGap(issuedAt: number, previousDoneAt: number | null, doneAt: number, transferMs: number, rttMs: number): number {
  const from = previousDoneAt === null ? issuedAt : Math.max(issuedAt, previousDoneAt)
  return Math.max(0, doneAt - from - transferMs - rttMs)
}

/** The largest issue gap seen in a phase, and whether it has turned the phase to early issue. */
export class IssueGaps {
  private largest = 0

  /** Whether streams issue their next request early. */
  get early(): boolean {
    return this.largest > ISSUE_GAP_MS
  }

  /** The lead of an early issue: the largest gap seen; null while the phase does not issue early. */
  get leadMs(): number | null {
    return this.early ? this.largest : null
  }

  record(gapMs: number): void {
    this.largest = Math.max(this.largest, gapMs)
  }
}

/** A request in flight, as the early issue of its successor watches it. */
export interface Watched {
  /** Resolves with the instant of its first byte: the first chunk, or the first byte reported sent. */
  firstByte: Promise<number>
  /** Settles when the request has ended, however it ended. */
  done: Promise<unknown>
  /** size / rate_s of its stream, or null when the rate is unknown. */
  expectedMs: number | null
  /** What the expected end adds after the transfer: the RTT on upload, nothing on download. */
  tailMs: number
}

/**
 * Whether the watched request's successor is to be issued early (measurement.md section 3): by
 * `leadMs` before the expected end, never before the first byte. Resolves at that instant with
 * true, or with false when the request ended first or the phase does not issue early.
 */
export async function issuesEarly(clock: Clock, leadMs: number | null, watched: Watched): Promise<boolean> {
  if (leadMs === null || watched.expectedMs === null) {
    return false
  }
  const first = await Promise.race([watched.firstByte, watched.done.then(() => null)])
  if (first === null) {
    return false
  }
  const at = Math.max(first, first + watched.tailMs + watched.expectedMs - leadMs)
  return !(await doneBefore(clock, at, watched.done))
}

/**
 * Resolves true when `done` settles, or false when the clock reaches `atMs` first, whichever
 * comes first.
 */
export function doneBefore(clock: Clock, atMs: number, done: Promise<unknown>): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = clock.setTimer(Math.max(0, atMs - clock.now()), () => resolve(false))
    void done.then(() => {
      clock.clearTimer(timer)
      resolve(true)
    })
  })
}

/** A promise with its resolver, for the first byte a request reports. */
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
