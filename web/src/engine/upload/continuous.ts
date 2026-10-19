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

import { DataUsedNotices } from '@/engine/continuous/dataUsed'
import { Retention } from '@/engine/continuous/retention'
import { BUCKET_MS } from '@/engine/stats/units'
import type { FailureGap, UploadLedger } from '@/engine/upload/watermark'
import { overlapsGap } from '@/engine/upload/window'

// A Continuous upload's retention (measurement.md sections 7.5 and 15): native cells enter it only
// once confirmed, below the window end, a cell overlapping a failure gap as unknown. Once the ramp
// has settled, what the retention holds is released from the ledger and the grid, and a closed
// request's failure gap is kept for the events, the last 100 of them.

const MAX_GAPS = 100

export class ContinuousUpload {
  readonly retention = new Retention()
  readonly usedNotices = new DataUsedNotices()
  private readonly ledger: UploadLedger
  /** The failure gaps of the requests released, oldest first, at most 100. */
  private gaps: FailureGap[] = []
  /** The next cell to hand on; null before the steady start. */
  private next: number | null = null

  constructor(ledger: UploadLedger) {
    this.ledger = ledger
  }

  /** The steady start: cells from `cell`, the warm-up end's, go to the retention. */
  begin(cell: number): void {
    this.retention.begin(cell)
    this.next ??= cell
  }

  /**
   * Hands on every cell that has become confirmed: before the cell holding the window end. With
   * `release`, the ledger's confirmed requests and the grid's cells before it go, and so do the
   * closed requests whose gap lies before it, `at` being the client instant now.
   */
  feed(at: number, release: boolean): void {
    const windowEnd = this.ledger.windowEnd()
    if (this.next === null || windowEnd === null) {
      return
    }
    const end = Math.floor(windowEnd / BUCKET_MS)
    const gaps = this.ledger.failureGaps()
    for (; this.next < end; this.next++) {
      this.retention.append(overlapsGap(this.next, gaps) ? null : this.ledger.grid.bytes(this.next))
    }
    if (release) {
      this.ledger.release(this.next, at)
      this.ledger.grid.release(this.next)
      this.gaps = [...this.gaps, ...this.ledger.releaseGaps(this.next * BUCKET_MS)].slice(-MAX_GAPS)
    }
  }

  /** The failure gaps of the direction's events: the last 100, released or still in the ledger. */
  failureGaps(): FailureGap[] {
    return [...this.gaps, ...this.ledger.failureGaps()].slice(-MAX_GAPS)
  }

  /** The gaps kept for the events, with the retention's lengths, which the footprint test reads. */
  footprint(): Record<string, number> {
    return { uploadGaps: this.gaps.length, ...this.retention.footprint() }
  }
}
