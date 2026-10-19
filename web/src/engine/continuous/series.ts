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

import type { RingCell } from '@/engine/continuous/ring'
import type { Retention, Tier } from '@/engine/continuous/retention'
import type { ResultSeries } from '@/engine/messages'
import { BUCKET_MS } from '@/engine/stats/units'

// A Continuous direction's saved series (measurement.md sections 15 and 17): the run since the
// steady start from the finest tier whose ring still covers all of it, native, hour, day or long
// in that order, downsampled to at most 2000 points, each with its known time. A run longer than
// the long ring saves its last 7 days.

const MAX_POINTS = 2000
const ORDER: readonly Tier[] = ['native', 'hour', 'day', 'long']
/** Each tier's cell, in milliseconds. */
const CELL_MS: Record<Tier, number> = { native: BUCKET_MS, hour: 1000, day: 60_000, long: 600_000 }

/** The finest tier whose ring has dropped none of its cells since the steady start. */
export function savedTier(retention: Retention): Tier {
  return ORDER.find((tier) => retention.rings[tier].total <= retention.rings[tier].length) ?? 'long'
}

/**
 * The saved series, times from `originMs`: cell 0's start on download, P_start on the upload's
 * server timeline. Null before the steady start's first cell.
 */
export function savedSeries(retention: Retention, originMs = 0): ResultSeries | null {
  const first = retention.first
  const native = retention.rings.native
  if (first === null || native.total === 0) {
    return null
  }
  const tier = savedTier(retention)
  const ring = retention.rings[tier]
  const partial = tier === 'native' ? null : retention.partial(tier)
  const cells: RingCell[] = [...ring.cells(), ...(partial === null ? [] : [partial])]
  const group = Math.max(1, Math.ceil(cells.length / MAX_POINTS))
  const values: (number | null)[] = []
  const knownMs: number[] = []
  for (let index = 0; index < cells.length; index += group) {
    const points = cells.slice(index, index + group)
    const known = points.reduce((sum, cell) => sum + cell.knownMs, 0)
    values.push(known === 0 ? null : points.reduce((sum, cell) => sum + cell.bytes, 0))
    knownMs.push(known)
  }
  const startMs = first * BUCKET_MS - originMs
  return {
    bucketMs: group * CELL_MS[tier],
    firstCellMs: startMs + (ring.total - ring.size) * CELL_MS[tier],
    warmupEndMs: startMs,
    endMs: startMs + native.total * BUCKET_MS,
    values,
    knownMs,
  }
}
