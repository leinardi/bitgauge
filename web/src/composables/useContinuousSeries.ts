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

import { type Ref, shallowRef } from 'vue'

import type { LoadedPoint } from '@/composables/useLoadedSeries'
import { type Direction, type EngineEvent, RING_LENGTHS, type TestSettings } from '@/engine/messages'
import { continuousDirection } from '@/lib/continuous'
import { FixedRing } from '@/lib/ring'

// A Continuous run's live chart history (measurement.md section 15, frontend.md section 6): one
// fixed ring per retention tier at the engine's RING_LENGTHS, the native one fed by each sample's
// 100 ms buckets, the hour, day and long ones by the coarse cells the samples close, each cell its
// bytes and known time, unknown when none is known. Beside them, the loaded latency's overlay
// rings, fed in parallel from the direction's start: the raw pings, and 2 s, 1 min and 10 min
// bins whose value is the true median of their pings, taken as the bin closes from a scratch
// buffer of the open bin alone. Every ring is allocated whole at the phase start and never grows;
// the chart draws the tier the run's elapsed time picks. Display only.

export type Tier = keyof typeof RING_LENGTHS
type CoarseTier = Exclude<Tier, 'native'>

/** One retained cell: its bytes and the time its known native cells cover. */
export interface TierCell {
  bytes: number
  knownMs: number
}

/** How many native 100 ms buckets one cell of each tier covers. */
export const TIER_BUCKETS: Record<Tier, number> = { native: 1, hour: 10, day: 600, long: 6000 }

/** The overlay's rings: the native one keeps the raw pings, the others a bin of this many buckets each. */
export const OVERLAY_LENGTHS: Record<Tier, number> = { native: 2000, hour: 1800, day: 1440, long: 1008 }
const OVERLAY_BIN_BUCKETS: Record<CoarseTier, number> = { hour: 20, day: 600, long: 6000 }
/** The most pings an open bin holds: 10 min at the 300 ms cadence. */
const SCRATCH = 2000

const BUCKET_MS = 100
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** The tier the chart draws at an elapsed time: native up to 10 min, hour up to 60 min, day up to 24 h, long beyond. */
export function tierFor(elapsedMs: number): Tier {
  if (elapsedMs <= 10 * MINUTE_MS) {
    return 'native'
  }
  if (elapsedMs <= HOUR_MS) {
    return 'hour'
  }
  return elapsedMs <= 24 * HOUR_MS ? 'day' : 'long'
}

/** The exact median of the open bin's pings. */
function median(values: Float64Array, count: number): number {
  const sorted = values.slice(0, count).sort()
  const middle = Math.floor(count / 2)
  return count % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

/** A coarse overlay ring and the bin it is filling. */
class OverlayBins {
  readonly ring: FixedRing<LoadedPoint>
  private readonly scratch = new Float64Array(SCRATCH)
  private count = 0
  private bin: number | null = null

  constructor(
    length: number,
    private readonly buckets: number,
  ) {
    this.ring = new FixedRing(length)
  }

  add(point: LoadedPoint): void {
    const bin = Math.floor(point.at / this.buckets)
    // A ping of a later bin closes the open one; a late one joins the bin still open.
    if (this.bin !== null && bin > this.bin) {
      this.close()
    }
    this.bin ??= bin
    if (this.count < SCRATCH) {
      this.scratch[this.count++] = point.ms
    }
  }

  private close(): void {
    if (this.bin !== null && this.count > 0) {
      this.ring.push({ at: (this.bin + 0.5) * this.buckets, ms: median(this.scratch, this.count) })
    }
    this.bin = null
    this.count = 0
  }
}

/** What the chart reads of a Continuous direction: its tier rings, its overlay rings and where they sit. */
export interface ContinuousSeries {
  direction: Direction
  /** Since the phase start, as the last sample's live figures carried it. */
  elapsedMs: number
  /** The tier the chart draws now. */
  tier: Tier
  /** The steady start on the direction's bucket axis, where each coarse ring's cell 0 begins; null before it. */
  base: number | null
  /** The native ring by absolute bucket; the coarse rings by cell index from the steady start. */
  cells: Readonly<Record<Tier, FixedRing<TierCell | null>>>
  overlay: Readonly<Record<Tier, FixedRing<LoadedPoint>>>
}

function allocate(direction: Direction): { series: ContinuousSeries; bins: Record<CoarseTier, OverlayBins> } {
  const bins = { hour: new OverlayBins(OVERLAY_LENGTHS.hour, OVERLAY_BIN_BUCKETS.hour), day: new OverlayBins(OVERLAY_LENGTHS.day, OVERLAY_BIN_BUCKETS.day), long: new OverlayBins(OVERLAY_LENGTHS.long, OVERLAY_BIN_BUCKETS.long) }
  const cells = {
    native: new FixedRing<TierCell | null>(RING_LENGTHS.native),
    hour: new FixedRing<TierCell | null>(RING_LENGTHS.hour),
    day: new FixedRing<TierCell | null>(RING_LENGTHS.day),
    long: new FixedRing<TierCell | null>(RING_LENGTHS.long),
  }
  const overlay = { native: new FixedRing<LoadedPoint>(OVERLAY_LENGTHS.native), hour: bins.hour.ring, day: bins.day.ring, long: bins.long.ring }
  return { series: { direction, elapsedMs: 0, tier: 'native', base: null, cells, overlay }, bins }
}

export function useContinuousSeries() {
  const series = shallowRef<ContinuousSeries | null>(null)
  let settings: TestSettings | null = null
  let own: ReturnType<typeof allocate> | null = null

  /** A new view of the same rings, so a component given it as a prop sees the change. */
  function publish(): void {
    series.value = own === null ? null : { ...own.series }
  }

  function onSample(event: Extract<EngineEvent, { type: 'sample' }>): void {
    if (own === null || event.direction !== own.series.direction) {
      return
    }
    const { cells } = own.series
    if (cells.native.length === 0) {
      cells.native.restart(event.fromBucket)
    }
    event.values.forEach((bytes, index) => cells.native.put(event.fromBucket + index, bytes === null ? null : { bytes, knownMs: BUCKET_MS }, null))
    own.series.base ??= event.warmupEndBucket ?? null
    for (const cell of event.cells ?? []) {
      cells[cell.tier].push(cell.knownMs === 0 ? null : { bytes: cell.bytes, knownMs: cell.knownMs })
    }
    if (event.continuous !== undefined) {
      own.series.elapsedMs = event.continuous.elapsedMs
      own.series.tier = tierFor(event.continuous.elapsedMs)
    }
    publish()
  }

  return {
    series: series as Readonly<Ref<ContinuousSeries | null>>,

    /** Clears the last run's rings for a new run. */
    reset(): void {
      settings = null
      own = null
      series.value = null
    },

    /** Allocates the rings at the Continuous direction's phase start and feeds them its samples; other events are ignored. */
    apply(event: EngineEvent): void {
      if (event.type === 'settings' && event.scope === 'run') {
        settings = event.settings
      } else if (event.type === 'phase' && event.state === 'started' && event.phase === continuousDirection(settings)) {
        own = allocate(event.phase)
        publish()
      } else if (event.type === 'sample') {
        onSample(event)
      }
    },

    /** A loaded-latency ping placed on the direction's axis, into the raw ring and each tier's open bin. */
    ping(direction: Direction, point: LoadedPoint): void {
      if (own === null || direction !== own.series.direction) {
        return
      }
      own.series.overlay.native.push(point)
      Object.values(own.bins).forEach((bins) => bins.add(point))
    },
  }
}
