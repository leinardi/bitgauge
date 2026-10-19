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

import { windowConditionHolds } from '@/engine/phases/window'
import { BUCKET_MS } from '@/engine/stats/units'

// The download steady window (measurement.md sections 5, 8.4 and 9.2): the full buckets from the
// end of warm-up to the end instant, and whether they meet the window condition.

/** The steady window: the full buckets from the end of warm-up to the end, in ms from the phase start. */
export interface DownloadWindow {
  fromMs: number
  toMs: number
  bytes: number
  /** The different requests that contributed bytes to it. */
  requests: number
}

/**
 * The steady window from the bucket `warmupEnd` to `endMs`, over `bytes` of each bucket, with
 * `contributors` the different requests that added bytes to a bucket range. It holds the full
 * buckets only: an end between two ticks, a stop or the data cap, leaves the last bucket partial,
 * and the window ends before it. Null before warm-up ended, or within the first bucket after it.
 */
export function downloadWindow(
  warmupEnd: number,
  endMs: number,
  bytes: (bucket: number) => number,
  contributors: (from: number, to: number) => number,
): (DownloadWindow & { holds: boolean }) | null {
  const to = Math.floor(endMs / BUCKET_MS)
  if (warmupEnd >= to) {
    return null
  }
  const fromMs = warmupEnd * BUCKET_MS
  const toMs = to * BUCKET_MS
  const requests = contributors(warmupEnd, to)
  let sum = 0
  for (let bucket = warmupEnd; bucket < to; bucket++) {
    sum += bytes(bucket)
  }
  return { fromMs, toMs, bytes: sum, requests, holds: windowConditionHolds('download', toMs - fromMs, requests) }
}
