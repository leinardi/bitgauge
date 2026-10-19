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

import { Ring, type RingCell } from '@/engine/continuous/ring'
import { type BucketSink, type Cell, percentile } from '@/engine/stats/buckets'
import { BUCKET_MS } from '@/engine/stats/units'

// A Continuous direction's retention (measurement.md section 15): the native 100 ms cells from the
// steady start enter a ring of 6000, every ten make an hour-tier 1 s cell, sixty of those a
// day-tier 1 min cell and ten of those a long-tier 10 min cell, each tier a ring allocated at its
// full length up front, each cell the exact sums of its finer cells' bytes and known time. The
// run-wide numbers are running aggregates over the fully known 1 s cells, so nothing grows with
// the run's length.

/** The rings' lengths: 10 min of native cells, 60 min of 1 s cells, 24 h of 1 min cells, 7 days of 10 min cells. */
export const RING_LENGTHS = { native: 6000, hour: 3600, day: 1440, long: 1008 } as const

export type Tier = keyof typeof RING_LENGTHS
export type CoarseTier = Exclude<Tier, 'native'>

/** A coarse cell closed, as the live sample carries it. */
export interface ClosedCell extends RingCell {
  tier: CoarseTier
}

/** How many cells of the finer tier one cell of each coarse tier sums. */
const FOLD: Record<CoarseTier, number> = { hour: 10, day: 60, long: 10 }
const COARSER: Record<CoarseTier, CoarseTier | null> = { hour: 'day', day: 'long', long: null }

/** A 1 s cell is fully known when all ten of its native cells are. */
const SECOND_MS = 1000
/** The direction is measured from three fully known 1 s cells on; the hourly p90 needs as many in the hour ring. */
export const MEASURED_SECONDS = 3
const PEAK_PERCENTILE = 90

/** The run-wide aggregates over the fully known 1 s cells since the steady start, in bytes per second. */
export interface Aggregates {
  /** How many fully known 1 s cells exist, and their bytes. */
  seconds: number
  bytes: number
  minBytes: number | null
  maxBytes: number | null
  /** The population coefficient of variation of their bytes, from running sums; null below two or at a zero mean. */
  variation: number | null
  /** The p90 of the fully known 1 s cells in the hour ring, null with fewer than three. */
  peakLastHourBytes: number | null
}

interface Open {
  bytes: number
  knownMs: number
  count: number
}

function empty(): Open {
  return { bytes: 0, knownMs: 0, count: 0 }
}

export class Retention implements BucketSink {
  readonly rings: Record<Tier, Ring> = {
    native: new Ring(RING_LENGTHS.native),
    hour: new Ring(RING_LENGTHS.hour),
    day: new Ring(RING_LENGTHS.day),
    long: new Ring(RING_LENGTHS.long),
  }
  /** The native index (the phase's bucket) of the steady start; null before it. */
  first: number | null = null
  /** The coarse cells still being summed. */
  private readonly open: Record<CoarseTier, Open> = { hour: empty(), day: empty(), long: empty() }
  /** The coarse cells closed since the last drain. */
  private closed: ClosedCell[] = []
  private seconds = 0
  private bytes = 0
  private squares = 0
  private minBytes: number | null = null
  private maxBytes: number | null = null
  /** The hourly p90, read again only when asked after a fully known 1 s cell closed. */
  private peak: number | null = null
  private peakStale = false

  /** The steady start: the native cells appended from here on begin at bucket `first`. */
  begin(first: number): void {
    this.first ??= first
  }

  /** Appends native cells in order; null is an unknown cell, never zero. */
  append(...cells: Cell[]): void {
    for (const cell of cells) {
      const knownMs = cell === null ? 0 : BUCKET_MS
      const bytes = cell ?? 0
      this.rings.native.push({ bytes, knownMs })
      this.fold('hour', bytes, knownMs)
    }
  }

  /** The native cells from bucket `from` to `to` (exclusive); null where unknown or no longer kept. */
  values(from: number, to: number): Cell[] {
    const first = this.first ?? 0
    const values: Cell[] = []
    for (let bucket = from; bucket < to; bucket++) {
      const cell = this.rings.native.at(bucket - first)
      values.push(cell === null || cell.knownMs === 0 ? null : cell.bytes)
    }
    return values
  }

  /** The bucket after the last native cell appended. */
  get end(): number {
    return (this.first ?? 0) + this.rings.native.total
  }

  /** The coarse cells closed since the last call, in order. */
  drain(): ClosedCell[] {
    const closed = this.closed
    this.closed = []
    return closed
  }

  /** The tier's cell still being summed, with what its finer tiers hold and have not handed on; null when there is none. */
  partial(tier: CoarseTier): RingCell | null {
    const tiers: readonly CoarseTier[] = tier === 'hour' ? ['hour'] : tier === 'day' ? ['day', 'hour'] : ['long', 'day', 'hour']
    const opens = tiers.map((open) => this.open[open])
    if (opens.every((open) => open.count === 0)) {
      return null
    }
    return { bytes: opens.reduce((sum, open) => sum + open.bytes, 0), knownMs: opens.reduce((sum, open) => sum + open.knownMs, 0) }
  }

  aggregates(): Aggregates {
    const { seconds, bytes } = this
    let variation: number | null = null
    if (seconds > 0 && bytes > 0) {
      const mean = bytes / seconds
      variation = Math.sqrt(Math.max(0, this.squares / seconds - mean * mean)) / mean
    }
    if (this.peakStale) {
      this.peakStale = false
      const known = this.rings.hour
        .cells()
        .filter((kept) => kept.knownMs === SECOND_MS)
        .map((kept) => kept.bytes)
      this.peak = known.length < MEASURED_SECONDS ? null : percentile(known, PEAK_PERCENTILE)
    }
    return { seconds, bytes, minBytes: this.minBytes, maxBytes: this.maxBytes, variation, peakLastHourBytes: this.peak }
  }

  /** The rings' allocated lengths, which never change, and the cells pending a drain. */
  footprint(): { retentionCells: number; retentionPending: number } {
    const cells = Object.values(this.rings).reduce((sum, ring) => sum + ring.length, 0)
    return { retentionCells: cells, retentionPending: this.closed.length }
  }

  private fold(tier: CoarseTier, bytes: number, knownMs: number): void {
    const open = this.open[tier]
    open.bytes += bytes
    open.knownMs += knownMs
    open.count++
    if (open.count < FOLD[tier]) {
      return
    }
    const cell = { bytes: open.bytes, knownMs: open.knownMs }
    this.open[tier] = empty()
    this.rings[tier].push(cell)
    this.closed.push({ tier, ...cell })
    if (tier === 'hour') {
      this.second(cell)
    }
    const coarser = COARSER[tier]
    if (coarser !== null) {
      this.fold(coarser, cell.bytes, cell.knownMs)
    }
  }

  /** A 1 s cell closed: the hour ring changed, and a fully known one joins the run-wide aggregates. */
  private second(cell: RingCell): void {
    this.peakStale = true
    if (cell.knownMs !== SECOND_MS) {
      return
    }
    this.seconds++
    this.bytes += cell.bytes
    this.squares += cell.bytes * cell.bytes
    this.minBytes = Math.min(this.minBytes ?? cell.bytes, cell.bytes)
    this.maxBytes = Math.max(this.maxBytes ?? cell.bytes, cell.bytes)
  }
}
