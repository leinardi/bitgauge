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

import type { DirectionEvent, FailureCode, NoticeCode } from '@/engine/messages'
import type { UploadTelemetry } from '@/engine/types'
import { cellOf } from '@/engine/upload/grid'
import type { FailureGap, UploadLedger } from '@/engine/upload/watermark'

// Where the upload's two timelines meet: the validation of an answer's telemetry (measurement.md
// section 7.3) and the events of section 17, which sit on the server timeline from P_start.

/** An event the phase saw on the client clock. */
export interface ClientEvent {
  code: 'extended' | 'data-cap' | 'cancelled' | 'error'
  at: number
  notice?: NoticeCode | FailureCode
}

/**
 * Whether telemetry confirms a request of `size` bytes: the same byte count, in whole counts that
 * add up to it from the cell of a finite first byte, and a finite read time (wire-protocol.md
 * section 4).
 */
export function validTelemetry(telemetry: UploadTelemetry, size: number): boolean {
  const whole = telemetry.buckets.every((bytes) => Number.isSafeInteger(bytes) && bytes >= 0)
  const sum = telemetry.buckets.reduce((total, bytes) => total + bytes, 0)
  return (
    telemetry.bytes === size &&
    whole &&
    sum === size &&
    Number.isSafeInteger(telemetry.firstBucket) &&
    Number.isFinite(telemetry.startMs) &&
    telemetry.firstBucket === cellOf(telemetry.startMs) &&
    Number.isFinite(telemetry.durationMs) &&
    telemetry.durationMs >= 0
  )
}

/**
 * The phase's events on the server timeline from P_start, failure gaps included. A client instant
 * is moved by the display offset of section 7.4; without a confirmed request there is no offset,
 * and it stays relative to the client start `startAt`. A Continuous upload passes the last 100
 * gaps, those its ledger released included.
 */
export function serverEvents(
  events: readonly ClientEvent[],
  startAt: number,
  ledger: UploadLedger,
  offset: number | null,
  gaps: readonly FailureGap[] = ledger.failureGaps(),
): DirectionEvent[] {
  const phaseStart = ledger.phaseStart() ?? 0
  const placed: DirectionEvent[] = events.map(({ code, at, notice }) => {
    const atMs = offset === null ? at - startAt : at - offset - phaseStart
    return code === 'error' ? { code, atMs, notice: notice ?? 'requests-failed' } : { code, atMs }
  })
  for (const gap of gaps) {
    placed.push({ code: 'failure-gap', startMs: gap.startMs - phaseStart, endMs: gap.endMs - phaseStart })
  }
  return placed
}
