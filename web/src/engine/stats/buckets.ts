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

// The 100 ms bucket series of one direction (measurement.md section 2) and the statistics over it.
// A cell is its byte count, or null while it is unknown: an upload cell at or after the window
// end, or inside a failure gap. Every statistic reads only the known cells; an unknown cell is
// skipped, never counted as zero, and a range with no known cell has no value (null).

/** A bucket's byte count, or null while it is unknown. */
export type Cell = number | null

/** The mean of the values, or null without any. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null
  }
  let sum = 0
  for (const value of values) {
    sum += value
  }
  return sum / values.length
}

/**
 * The q-th percentile of the values, interpolating linearly between the closest ranks
 * (measurement.md section 2), or null without any. q is in [0, 100].
 */
export function percentile(values: readonly number[], q: number): number | null {
  if (values.length === 0) {
    return null
  }
  if (!(q >= 0 && q <= 100)) {
    throw new RangeError(`percentile ${q} is outside [0, 100]`)
  }
  const sorted = [...values].sort((a, b) => a - b)
  const rank = ((sorted.length - 1) * q) / 100
  const below = Math.floor(rank)
  const lower = sorted[below] ?? 0
  const upper = sorted[Math.min(below + 1, sorted.length - 1)] ?? lower
  return lower + (rank - below) * (upper - lower)
}

/**
 * The coefficient of variation: the population standard deviation over the mean. Null without
 * values or with a mean of zero, where it has no value (measurement.md section 2).
 */
export function coefficientOfVariation(values: readonly number[]): number | null {
  const average = mean(values)
  if (average === null || average === 0) {
    return null
  }
  let squares = 0
  for (const value of values) {
    squares += (value - average) ** 2
  }
  return Math.sqrt(squares / values.length) / Math.abs(average)
}

/**
 * A run of consecutive cells starting at index `first`: on download the client bucket index from
 * the phase start, on upload the absolute server grid cell. Indexes outside the series are
 * unknown.
 */
export class BucketSeries {
  readonly first: number
  private readonly cells: Cell[] = []

  constructor(first = 0) {
    if (!Number.isSafeInteger(first)) {
      throw new RangeError(`first cell ${first} is not an integer`)
    }
    this.first = first
  }

  /** The index after the last cell. */
  get end(): number {
    return this.first + this.cells.length
  }

  /** Appends cells after the last one. */
  append(...cells: Cell[]): void {
    for (const cell of cells) {
      if (cell !== null && !(Number.isFinite(cell) && cell >= 0)) {
        throw new RangeError(`cell value ${cell} is not a byte count`)
      }
      this.cells.push(cell)
    }
  }

  /** The cell at index, null when it is unknown or outside the series. */
  at(index: number): Cell {
    return this.cells[index - this.first] ?? null
  }

  /** The cells with index in [from, to), null where unknown, outside the series included. */
  range(from: number, to: number): Cell[] {
    const cells: Cell[] = []
    for (let index = from; index < to; index++) {
      cells.push(this.at(index))
    }
    return cells
  }

  /** The known cells with index in [from, to), in order. */
  known(from: number, to: number): number[] {
    const values: number[] = []
    for (let index = Math.max(from, this.first); index < Math.min(to, this.end); index++) {
      const cell = this.at(index)
      if (cell !== null) {
        values.push(cell)
      }
    }
    return values
  }

  /** The last `count` known cells before index `before`, in order; fewer when there are not so many. */
  lastKnown(count: number, before: number = this.end): number[] {
    const values: number[] = []
    for (let index = Math.min(before, this.end) - 1; index >= this.first && values.length < count; index--) {
      const cell = this.at(index)
      if (cell !== null) {
        values.push(cell)
      }
    }
    return values.reverse()
  }

  /** The mean of the known cells in [from, to). */
  mean(from: number, to: number): number | null {
    return mean(this.known(from, to))
  }

  /** The p90 of the known cells in [from, to). */
  p90(from: number, to: number): number | null {
    return percentile(this.known(from, to), 90)
  }

  /** The coefficient of variation of the known cells in [from, to). */
  coefficientOfVariation(from: number, to: number): number | null {
    return coefficientOfVariation(this.known(from, to))
  }
}
