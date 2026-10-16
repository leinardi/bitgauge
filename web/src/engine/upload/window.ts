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

import { MIN_UPLOAD_REQUESTS, MIN_WINDOW_MS, windowStable } from '@/engine/phases/window'
import { BucketSeries, percentile } from '@/engine/stats/buckets'
import { BUCKET_MS, bitsPerSecond, bucketRate } from '@/engine/stats/units'
import { cellOf, cellStart } from '@/engine/upload/grid'
import type { FailureGap, UploadLedger } from '@/engine/upload/watermark'

// The upload's confirmed series and its steady window (measurement.md sections 7.5 and 7.6). A
// cell is known only when it ends at or before the window end and overlaps no failure gap;
// every other cell is unknown, never zero. The headline counts only full cells, so the partial
// cells at either edge, and the edge cells of a gap, are left out of both bytes and time.

const PEAK_PERCENTILE = 90

/** Whether cell `cell` overlaps any of the failure gaps. */
function overlapsGap(cell: number, gaps: readonly FailureGap[]): boolean {
  const start = cellStart(cell)
  return gaps.some((gap) => start < gap.endMs && start + BUCKET_MS > gap.startMs)
}

/**
 * The evaluation series of measurement.md section 8.1: S_up from the cell of P_start up to the
 * window end, with the cells overlapping a failure gap unknown. Cells at or after the window end
 * are outside it, so unknown too. Null before the first confirmed request.
 */
export function confirmedSeries(ledger: UploadLedger): BucketSeries | null {
  const start = ledger.phaseStart()
  const windowEnd = ledger.windowEnd()
  if (start === null || windowEnd === null) {
    return null
  }
  const gaps = ledger.failureGaps()
  const series = new BucketSeries(cellOf(start))
  for (let cell = series.first; cell < Math.floor(windowEnd / BUCKET_MS); cell++) {
    series.append(overlapsGap(cell, gaps) ? null : ledger.grid.bytes(cell))
  }
  return series
}

/** The steady window W and what it measures. */
export interface UploadWindow {
  /** The cells of W, ascending: full cells inside the window, overlapping no failure gap. */
  cells: number[]
  /** Σ S_up over W. */
  bytes: number
  /** |W| × bucketMs. */
  windowMs: number
  /** The confirmed requests whose every telemetry cell is in W (measurement.md section 7.6). */
  confirmedInside: number
  /** Whether the minimum window holds; without it there is no number. */
  sufficient: boolean
  /** The headline; absent when the window is insufficient. */
  bitsPerSecond?: number
  /** The p90 of the cells' rates, labeled "peak"; absent when the window is insufficient. */
  peakBitsPerSecond?: number
}

/**
 * The steady window from `warmupEndMs` on the server timeline to the ledger's window end: W_end
 * for the live numbers, W_end_final once the phase and its grace are over. `endMs` can end it
 * earlier, never later, so no cell at or after W_end is ever counted. Before the first confirmed
 * request the window is empty.
 */
export function steadyWindow(ledger: UploadLedger, warmupEndMs: number, endMs?: number): UploadWindow {
  const windowEnd = ledger.windowEnd()
  const windowEndMs = windowEnd === null ? Number.NEGATIVE_INFINITY : Math.min(windowEnd, endMs ?? windowEnd)
  const gaps = ledger.failureGaps()
  const cells: number[] = []
  for (let cell = Math.ceil(warmupEndMs / BUCKET_MS); cell < Math.floor(windowEndMs / BUCKET_MS); cell++) {
    if (!overlapsGap(cell, gaps)) {
      cells.push(cell)
    }
  }

  const inWindow = new Set(cells)
  const confirmedInside = ledger
    .confirmed()
    .filter(
      (telemetry) =>
        telemetry.buckets.length > 0 &&
        telemetry.buckets.every((_, offset) => inWindow.has(telemetry.firstBucket + offset)),
    ).length

  const counts = cells.map((cell) => ledger.grid.bytes(cell))
  const bytes = counts.reduce((sum, count) => sum + count, 0)
  const windowMs = cells.length * BUCKET_MS
  const sufficient = windowMs >= MIN_WINDOW_MS && confirmedInside >= MIN_UPLOAD_REQUESTS
  const window: UploadWindow = { cells, bytes, windowMs, confirmedInside, sufficient }
  const peak = percentile(counts, PEAK_PERCENTILE)
  if (!sufficient || peak === null) {
    return window
  }
  return { ...window, bitsPerSecond: bitsPerSecond(bytes, windowMs), peakBitsPerSecond: bucketRate(peak) }
}

/**
 * The end condition on the confirmed window (measurement.md sections 5 and 8.4): the minimum
 * window holds, and its known cells, a failure gap's unknown, are stable at 500 ms.
 */
export function endConditionHolds(ledger: UploadLedger, warmupEndMs: number): boolean {
  const windowEnd = ledger.windowEnd()
  if (windowEnd === null || !steadyWindow(ledger, warmupEndMs).sufficient) {
    return false
  }
  const first = Math.ceil(warmupEndMs / BUCKET_MS)
  return windowStable(confirmedSeries(ledger)?.range(first, Math.max(first, Math.floor(windowEnd / BUCKET_MS))) ?? [])
}
