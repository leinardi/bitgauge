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

import type { ResultSeries } from '@/engine/messages'

/** Admission and defensive rendering check; bounded uploads may exclude a trailing <100 ms. */
export function validSeriesExtent(series: ResultSeries, uploadEdge = true): boolean {
  const { firstCellMs, warmupEndMs, endMs, bucketMs, values, knownMs } = series
  if (![firstCellMs, warmupEndMs, endMs, bucketMs].every((value) => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER)
    || bucketMs < 100 || values.length > 2000 || endMs < firstCellMs || warmupEndMs > endMs) return false
  const span = endMs - firstCellMs
  const full = values.length * bucketMs
  // Upload timelines subtract a fractional server origin independently from both endpoints.
  // Allow only floating-point subtraction error, not an additional measured interval.
  const error = Number.EPSILON * Math.max(firstCellMs, endMs, full) * 4
  if (!Number.isSafeInteger(full) || (values.length > 0 && span <= full - bucketMs)
    || (span > full + error && (!uploadEdge || span - full >= 100 + error))) return false
  if (knownMs !== undefined && (knownMs.length !== values.length || knownMs.some((ms, index) =>
    !Number.isFinite(ms) || ms < 0 || ms > Math.min(bucketMs, span - index * bucketMs) + error))) return false
  return true
}
