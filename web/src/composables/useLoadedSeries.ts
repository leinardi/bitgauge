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

import { liveCapacity } from '@/composables/runLive'
import type { Direction, EngineEvent, LoadedPing, TestSettings } from '@/engine/messages'
import { FixedRing } from '@/lib/ring'

// The live loaded latency (ui/screens.md section 1): each direction's answered pings as the samples
// bring them, for the live chart's second axis and the Test screen's load card. A ping is placed on
// its direction's chart axis: download from its phase start, in buckets; upload on the server grid,
// in cells, by the display-only offset the engine gives the sending line (measurement.md section
// 7.4), so the latency lines up with the received series as the sending line does. Pings that come
// before the upload's first confirmed request wait for the offset. Each direction's pings are a
// fixed ring allocated at its phase start (frontend.md section 6). Display only: the result's
// loaded latency comes from the engine.

const BUCKET_MS = 100

export interface LoadedPoint {
  /** Where the ping was sent, on the direction's chart axis in buckets. */
  at: number
  /** Its round-trip time in ms. */
  ms: number
}

export type LoadedSeries = Record<Direction, readonly LoadedPoint[]>

const empty = (): LoadedSeries => ({ download: [], upload: [] })

/** `onPoint` hears each ping as it is placed, as a Continuous run's overlay rings take it. */
export function useLoadedSeries(onPoint?: (direction: Direction, point: LoadedPoint) => void) {
  const series = shallowRef<LoadedSeries>(empty())
  /** Upload pings answered before the offset was known. */
  let waiting: LoadedPing[] = []
  /** The run's settings, which size the rings; null until the run's settings event. */
  let settings: TestSettings | null = null
  let rings: Partial<Record<Direction, FixedRing<LoadedPoint>>> = {}

  const ring = (direction: Direction) => new FixedRing<LoadedPoint>(liveCapacity(settings, direction).pings)

  function place(direction: Direction, pings: readonly LoadedPing[], offsetCells: number): void {
    const own = (rings[direction] ??= ring(direction))
    for (const ping of pings) {
      const point = { at: ping.atMs / BUCKET_MS + offsetCells, ms: ping.rttMs }
      own.push(point)
      onPoint?.(direction, point)
    }
    series.value = { ...series.value, [direction]: own.toArray() }
  }

  return {
    series: series as Readonly<Ref<LoadedSeries>>,

    /** Clears the last run's pings for a new run. */
    reset(): void {
      series.value = empty()
      waiting = []
      settings = null
      rings = {}
    },

    /** Takes a sample's pings, allocating a direction's ring at its phase start; other events are ignored. */
    apply(event: EngineEvent): void {
      if (event.type === 'settings' && event.scope === 'run') {
        settings = event.settings
        return
      }
      if (event.type === 'phase' && event.state === 'started' && (event.phase === 'download' || event.phase === 'upload')) {
        rings[event.phase] = ring(event.phase)
        return
      }
      if (event.type !== 'sample') {
        return
      }
      const pings = event.loadedLatency ?? []
      if (event.direction === 'download') {
        if (pings.length > 0) {
          place('download', pings, 0)
        }
        return
      }
      if (event.sendingBucket === undefined) {
        waiting.push(...pings)
        return
      }
      // The sample's instant on the server grid, less its time from the phase start: where the
      // phase start falls on the grid, by the same offset as the sending line.
      const pending = [...waiting, ...pings]
      waiting = []
      if (pending.length > 0) {
        place('upload', pending, event.sendingBucket - event.phaseMs / BUCKET_MS)
      }
    },
  }
}
