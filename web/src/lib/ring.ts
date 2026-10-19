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

// A fixed-length ring of a run's live values (frontend.md section 6): allocated whole, it never
// grows; once full, each new value overwrites the oldest. Values are addressed by an absolute
// index that keeps counting past the overwritten ones, since an upload's cells start far from 0
// on the server grid.

export class FixedRing<T> {
  readonly capacity: number
  private readonly slots: T[]
  private first: number
  private end: number
  private overwritten = false

  constructor(capacity: number, firstIndex = 0) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError(`ring capacity ${capacity}`)
    }
    this.capacity = capacity
    this.slots = new Array<T>(capacity)
    this.first = firstIndex
    this.end = firstIndex
  }

  /** The absolute index of the oldest value held. */
  get firstIndex(): number {
    return this.first
  }

  /** One past the absolute index of the newest value. */
  get endIndex(): number {
    return this.end
  }

  get length(): number {
    return this.end - this.first
  }

  /** The lowest index not yet overwritten, -Infinity until the ring has overwritten any value. */
  get evictedBefore(): number {
    return this.overwritten ? this.first : Number.NEGATIVE_INFINITY
  }

  /** Empties the ring and starts its indices at `firstIndex`; nothing is overwritten yet. */
  restart(firstIndex: number): void {
    this.first = firstIndex
    this.end = firstIndex
    this.overwritten = false
  }

  /** Appends at the end index, overwriting the oldest value once the ring is full. */
  push(value: T): void {
    this.slots[this.slot(this.end)] = value
    this.end++
    if (this.end - this.first > this.capacity) {
      this.first++
      this.overwritten = true
    }
  }

  /**
   * Writes `value` at an absolute index: over a value held, or past the end with `hole` in every
   * index between. An index already overwritten is dropped.
   */
  put(index: number, value: T, hole: T): void {
    if (index < this.first) {
      return
    }
    if (index < this.end) {
      this.slots[this.slot(index)] = value
      return
    }
    // A gap longer than the ring only overwrites holes with holes; skip to its last capacity.
    if (index - this.end > this.capacity) {
      this.first = index - this.capacity
      this.end = this.first
      this.overwritten = true
    }
    while (this.end < index) {
      this.push(hole)
    }
    this.push(value)
  }

  /** The value at an absolute index, or undefined outside the values held. */
  at(index: number): T | undefined {
    return index >= this.first && index < this.end ? this.slots[this.slot(index)] : undefined
  }

  /** The values held, oldest first. */
  toArray(): T[] {
    const values = new Array<T>(this.length)
    for (let index = this.first; index < this.end; index++) {
      values[index - this.first] = this.slots[this.slot(index)] as T
    }
    return values
  }

  private slot(index: number): number {
    return ((index % this.capacity) + this.capacity) % this.capacity
  }
}
