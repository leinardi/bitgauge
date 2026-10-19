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

import type { Notice } from '@/engine/messages'

// The data-used notices of a Continuous run (measurement.md sections 15 and 16): one as the data
// used crosses 1 GB, 10 GB, 100 GB and every further tenfold step, emitted live and kept for the
// result, so a long run on a metered link is never silent.

const FIRST_THRESHOLD = 1e9
const STEP = 10

export class DataUsedNotices {
  /** Every notice raised, for the result: one per tenfold step, so a handful at most. */
  readonly raised: Notice[] = []
  private next = FIRST_THRESHOLD
  private pending: Notice[] = []

  /** The data used so far: each threshold it crossed raises its notice once. */
  update(bytes: number): void {
    while (bytes >= this.next) {
      const notice: Notice = { code: 'data-used', bytes: this.next }
      this.raised.push(notice)
      this.pending.push(notice)
      this.next *= STEP
    }
  }

  /** The notices raised since the last call, for the live sample. */
  drain(): Notice[] {
    const pending = this.pending
    this.pending = []
    return pending
  }
}
