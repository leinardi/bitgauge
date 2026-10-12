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

// The upload aggregate on the server grid (measurement.md section 7.4): S_up[b] is the plain sum,
// over the confirmed requests, of their arrival counts for cell b. Cells are absolute grid
// indexes; cell k covers [100k, 100k + 100) ms on the server timeline. No split is ever estimated.

/** A confirmed request's arrival counts, as its telemetry reports them. */
export interface CellCounts {
  /** Absolute grid index of buckets[0]. */
  firstBucket: number
  /** Bytes read in each consecutive cell from firstBucket on. */
  buckets: readonly number[]
}

/** The cell holding the instant `ms` of the server timeline. */
export function cellOf(ms: number): number {
  return Math.floor(ms / BUCKET_MS)
}

/** The start of cell `cell` on the server timeline, in milliseconds. */
export function cellStart(cell: number): number {
  return cell * BUCKET_MS
}

/** S_up: the per-cell sum of the confirmed requests' counts. */
export class UploadGrid {
  private readonly sums = new Map<number, number>()

  /** Adds the counts of a newly confirmed request; invalid counts change nothing. */
  add(counts: CellCounts): void {
    if (!Number.isSafeInteger(counts.firstBucket)) {
      throw new RangeError(`firstBucket ${counts.firstBucket} is not an integer`)
    }
    const invalid = counts.buckets.find((bytes) => !(Number.isSafeInteger(bytes) && bytes >= 0))
    if (invalid !== undefined) {
      throw new RangeError(`bucket count ${invalid} is not a byte count`)
    }
    counts.buckets.forEach((bytes, offset) => {
      const cell = counts.firstBucket + offset
      this.sums.set(cell, (this.sums.get(cell) ?? 0) + bytes)
    })
  }

  /**
   * S_up[cell]: the bytes the confirmed requests counted in the cell. Zero where none counted,
   * which is a confirmed zero only for a cell the watermark has confirmed (watermark.ts).
   */
  bytes(cell: number): number {
    return this.sums.get(cell) ?? 0
  }
}
