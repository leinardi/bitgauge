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

// The live chart's data from the run's live state: bucket rates with null gaps, segments in run
// order, the upload's sending line placed by the engine's offset, the warm-up bands, separators and
// the result's event marks.

import { describe, expect, it } from 'vitest'

import { buildChart } from '@/components/chart/series'
import { type DirectionLive, type LiveRings, record } from '@/composables/runLive'
import type { EngineEvent } from '@/engine/messages'
import { FixedRing } from '@/lib/ring'

function live(overrides: Partial<DirectionLive>): DirectionLive {
  return { firstBucket: 0, values: [], windowEnd: null, gauge: 0, sending: null, steady: null, warmupEnd: null, start: null, sendingTrace: [], streams: 1, phaseMs: 0, ...overrides }
}

/** Rounds x to the millisecond, so floating sums compare. */
const xs = (values: number[]) => values.map((value) => Math.round(value * 1000) / 1000)

describe('buildChart', () => {
  it('draws download buckets as rates from their start, a gap as nulls, the last bucket held to its end', () => {
    const model = buildChart({ order: ['download'], live: { download: live({ values: [125_000, null, 250_000] }), upload: null }, units: 'bits' })
    const [x, download, received, sending] = model.data
    expect(xs(x)).toEqual([0, 0.1, 0.2, 0.3])
    // 125 kB in 100 ms is 10 Mbit/s.
    expect(download).toEqual([1e7, null, 2e7, 2e7])
    expect(received).toEqual([null, null, null, null])
    expect(sending).toEqual([null, null, null, null])
    expect(model.end).toBeCloseTo(0.3)
    expect(model.separators).toEqual([])
  })

  it('draws bytes per second in bytes mode', () => {
    const model = buildChart({ order: ['download'], live: { download: live({ values: [125_000] }), upload: null }, units: 'bytes' })
    expect(model.data[1]).toEqual([1.25e6, 1.25e6])
  })

  it('places upload cells from P_start and the sending values in the cells the engine put them in', () => {
    const upload = live({
      firstBucket: 9001,
      values: [10_000, 20_000],
      start: 9000.4,
      sendingTrace: [
        { cell: 8999.9, bitsPerSecond: 1e6 },
        { cell: 9002.3, bitsPerSecond: 2e6 },
        { cell: 9003.7, bitsPerSecond: 3e6 },
      ],
    })
    const model = buildChart({ order: ['upload'], live: { download: null, upload }, units: 'bits' })
    const [x, download, received, sending] = model.data
    // Cell 9000 (P_start's cell) is x = 0; a sending value before it is not drawn.
    expect(xs(x)).toEqual([0, 0.1, 0.2, 0.3, 0.4])
    expect(download).toEqual([null, null, null, null, null])
    expect(received).toEqual([null, 8e5, 1.6e6, 1.6e6, null])
    expect(sending).toEqual([null, null, 2e6, 3e6, 3e6])
  })

  it('runs the directions as segments in run order, one shared x at their boundary', () => {
    const download = live({ values: [125_000, 125_000], warmupEnd: 1 })
    const upload = live({ firstBucket: 500, values: [12_500], start: 500 })
    for (const order of [['download', 'upload'], ['upload', 'download']] as const) {
      const model = buildChart({ order, live: { download, upload }, units: 'bits' })
      const [x, down, received] = model.data
      expect([...x].sort((a, b) => a - b)).toEqual(x)
      expect(new Set(x).size).toBe(x.length)
      expect(model.separators).toHaveLength(1)
      const boundary = x.indexOf(model.separators[0] ?? -1)
      expect(boundary).toBeGreaterThan(0)
      // At the boundary the first segment holds its last value and the second begins.
      if (order[0] === 'download') {
        expect(down[boundary]).toBe(1e7)
        expect(received[boundary]).toBe(1e6)
      } else {
        expect(received[boundary]).toBe(1e6)
        expect(down[boundary]).toBe(1e7)
      }
    }
  })

  it('places the loaded latency on each segment: download from its phase start, upload from its cell, none before the segment', () => {
    const download = live({ values: [125_000, 125_000, 125_000] })
    const upload = live({ firstBucket: 9000, values: [12_500, 12_500], start: 9000 })
    const loaded = { download: [{ at: 0.5, ms: 12 }, { at: 2.5, ms: 14 }], upload: [{ at: 8999.5, ms: 30 }, { at: 9001.5, ms: 40 }] }
    const model = buildChart({ order: ['download', 'upload'], live: { download, upload }, units: 'bits', loaded })
    const boundary = model.separators[0] ?? 0
    expect(model.latency.map((sample) => [Math.round(sample.at * 100) / 100, sample.ms])).toEqual([
      [0.05, 12],
      [0.25, 14],
      [Math.round((boundary + 0.15) * 100) / 100, 40],
    ])
    expect(buildChart({ order: ['download'], live: { download, upload: null }, units: 'bits' }).latency).toEqual([])
  })

  it('bands the warm-up up to its end, or up to the latest bucket while it lasts', () => {
    const download = live({ values: [1, 2, 3, 4], warmupEnd: 2 })
    const upload = live({ firstBucket: 100, values: [1, 2], start: 100 })
    const model = buildChart({ order: ['download', 'upload'], live: { download, upload }, units: 'bits' })
    expect(model.warmup.map((span) => xs([span.from, span.to]))).toEqual([
      [0, 0.2],
      [0.4, 0.6],
    ])
  })

  it('marks the result\'s events from each phase start, gaps excepted', () => {
    const download = live({ values: [1, 2, 3] })
    const upload = live({ firstBucket: 50, values: [1, 2], start: 50.5 })
    const model = buildChart({
      order: ['download', 'upload'],
      live: { download, upload },
      units: 'bits',
      events: {
        download: [{ code: 'extended', atMs: 200 }],
        upload: [
          { code: 'cancelled', atMs: 100 },
          { code: 'failure-gap', startMs: 0, endMs: 100 },
        ],
      },
    })
    expect(model.marks.map((mark) => ({ ...mark, at: Math.round(mark.at * 1000) / 1000 }))).toEqual([
      { at: 0.2, code: 'extended' },
      // Upload: the segment starts at 0.3 s on cell 50; P_start is half a cell later.
      { at: 0.45, code: 'cancelled' },
    ])
  })

  it('is empty before the first sample', () => {
    const model = buildChart({ order: ['download', 'upload'], live: { download: null, upload: null }, units: 'bits' })
    expect(model.data).toEqual([[], [], [], []])
    expect(model.end).toBe(0)
  })
})

describe('buildChart over live rings that rolled over', () => {
  type Sample = Extract<EngineEvent, { type: 'sample' }>
  const CAPACITY = 50
  const rings = (): LiveRings => ({ buckets: new FixedRing(CAPACITY), trace: new FixedRing(CAPACITY) })
  const sample = (overrides: Partial<Sample>): Sample => ({ type: 'sample', direction: 'download', fromBucket: 0, values: [], gauge: 0, streams: 1, phaseMs: 0, dataUsedBytes: 0, ...overrides })

  /** A direction fed one bucket per sample, from `from` to `to` exclusive, with a sending point and a ping each. */
  function fed(direction: 'download' | 'upload', from: number, to: number, start: number | null) {
    const own = rings()
    let live: DirectionLive | null = null
    const loaded = []
    for (let bucket = from; bucket < to; bucket++) {
      const upload = direction === 'upload' ? { sendingBucket: bucket + 0.5, sending: 8e6, ...(start === null ? {} : { startBucket: start }) } : {}
      live = record(live, own, sample({ direction, fromBucket: bucket, values: [10_000], warmupEndBucket: from + 5, ...upload }))
      loaded.push({ at: bucket + 0.5, ms: 20 })
    }
    return { live: live as DirectionLive, loaded }
  }

  it('builds a download past its capacity from the oldest bucket held, on its elapsed time', () => {
    const { live, loaded } = fed('download', 0, 120, null)
    expect(live.firstBucket).toBe(70)
    const model = buildChart({ order: ['download'], live: { download: live, upload: null }, units: 'bits', loaded: { download: loaded } })
    for (const column of model.data) {
      expect(column.length).toBeLessThanOrEqual(CAPACITY + 2)
    }
    expect(model.latency.length).toBeLessThanOrEqual(CAPACITY + 2)
    expect(model.data[0][0]).toBeCloseTo(7)
    expect(model.latency[0]?.at).toBeCloseTo(7.05)
    // The warm-up ended at bucket 5, long overwritten: its band is clipped to what is held.
    expect(model.warmup[0]?.to).toBeCloseTo(7)
  })

  it('builds an upload past its capacity, starting far from 0, from the oldest cell held', () => {
    const { live, loaded } = fed('upload', 9001, 9121, 9000)
    const model = buildChart({ order: ['upload'], live: { download: null, upload: live }, units: 'bits', loaded: { upload: loaded } })
    const [x, , received, sending] = model.data
    for (const column of model.data) {
      expect(column.length).toBeLessThanOrEqual(CAPACITY + 2)
    }
    expect(model.latency.length).toBeLessThanOrEqual(CAPACITY + 2)
    // The oldest cell held is 9071: 7.1 s after P_start's cell.
    expect(x[0]).toBeCloseTo(7.1)
    expect(received[0]).toBe(8e5)
    expect(sending.filter((value) => value !== null).length).toBeLessThanOrEqual(CAPACITY + 1)
  })

  it("keeps the upload's leading unknown cell one cell short of eviction", () => {
    const { live } = fed('upload', 9001, 9001 + CAPACITY, 9000)
    expect(live.evictedBefore).toBeUndefined()
    const [x, , received] = buildChart({ order: ['upload'], live: { download: null, upload: live }, units: 'bits' }).data
    expect(x[0]).toBe(0)
    expect(received.slice(0, 2)).toEqual([null, 8e5])
  })
})
