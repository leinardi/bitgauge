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

import { BUCKET_MS } from '@/engine/stats/units'
import type { ConfirmedTelemetry } from '@/engine/upload/watermark'

// Synthetic upload telemetry for the engine tests: what the server would report for a request
// whose bytes arrived at a steady rate.

/**
 * The telemetry of `bytes` read at a steady rate from `firstMs` (first byte) to `lastMs` (last
 * byte) on the server timeline. Each cell holds the whole bytes that had arrived by its end, less
 * those that had arrived by its start, so the counts are integers that add up to `bytes`.
 */
export function steadyTelemetry(firstMs: number, lastMs: number, bytes: number): ConfirmedTelemetry {
  const arrivedBy = (ms: number): number =>
    ms >= lastMs ? bytes : Math.floor((bytes * Math.max(0, ms - firstMs)) / (lastMs - firstMs))
  const firstBucket = Math.floor(firstMs / BUCKET_MS)
  const buckets: number[] = []
  for (let cell = firstBucket; cell < Math.ceil(lastMs / BUCKET_MS); cell++) {
    buckets.push(arrivedBy((cell + 1) * BUCKET_MS) - arrivedBy(cell * BUCKET_MS))
  }
  return { firstBucket, buckets, startMs: firstMs, durationMs: lastMs - firstMs }
}

/** Bytes in KiB. */
export function kib(bytes: number): number {
  return bytes / 1024
}
