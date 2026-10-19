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

// A fixed-length ring of cells, each two exact sums: bytes and known time (measurement.md section
// 15). It is allocated at its full length when it is made and never grows: once full, each new
// cell replaces the oldest.

/** One retained cell: its bytes and the time its known finer cells cover. */
export interface RingCell {
  bytes: number
  knownMs: number
}

export class Ring {
  /** How many cells it holds at most, allocated up front. */
  readonly length: number
  private readonly bytes: Float64Array
  private readonly known: Float64Array
  /** The slot the next cell takes. */
  private head = 0
  private filled = 0
  /** Every cell ever pushed, those dropped included. */
  private pushed = 0

  constructor(length: number) {
    this.length = length
    this.bytes = new Float64Array(length)
    this.known = new Float64Array(length)
  }

  /** The cells it holds now. */
  get size(): number {
    return this.filled
  }

  /** Every cell ever pushed: the index after the newest, counting the dropped ones too. */
  get total(): number {
    return this.pushed
  }

  push(cell: RingCell): void {
    this.bytes[this.head] = cell.bytes
    this.known[this.head] = cell.knownMs
    this.head = (this.head + 1) % this.length
    this.filled = Math.min(this.filled + 1, this.length)
    this.pushed++
  }

  /** The cell pushed `index`-th (from 0), or null when it was dropped or never pushed. */
  at(index: number): RingCell | null {
    if (index < this.pushed - this.filled || index >= this.pushed) {
      return null
    }
    const slot = (this.head - (this.pushed - index) + this.length) % this.length
    return { bytes: this.bytes[slot] ?? 0, knownMs: this.known[slot] ?? 0 }
  }

  /** The cells it holds, oldest first. */
  cells(): RingCell[] {
    const cells: RingCell[] = []
    for (let index = this.pushed - this.filled; index < this.pushed; index++) {
      const cell = this.at(index)
      if (cell !== null) {
        cells.push(cell)
      }
    }
    return cells
  }
}
