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
import { type DirectionLive, type LiveRings, liveRings, record } from '@/composables/runLive'
import { useContinuousSeries } from '@/composables/useContinuousSeries'
import { useLoadedSeries } from '@/composables/useLoadedSeries'
import type { EngineEvent } from '@/engine/messages'
import { FixedRing } from '@/lib/ring'
import { continuousSettings, continuousStream } from '@/test/continuous'

function live(overrides: Partial<DirectionLive>): DirectionLive {
  return { firstBucket: 0, values: [], windowEnd: null, gauge: 0, sending: null, steady: null, continuous: null, warmupEnd: null, start: null, sendingTrace: [], streams: 1, phaseMs: 0, ...overrides }
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

  it('spans an upload with no confirmed request yet over its elapsed time, with its marks inside', () => {
    // 20 s of download, then 25 s of upload whose requests have not confirmed (QA-98): no cell, no
    // P_start and no sending line yet, only the phase's time and its Extended mark.
    const download = live({ values: Array.from({ length: 200 }, () => 125_000), phaseMs: 20_003 })
    const upload = live({ firstBucket: 0, values: [], start: null, phaseMs: 25_000 })
    const model = buildChart({ order: ['download', 'upload'], live: { download, upload }, units: 'bits', events: { upload: [{ code: 'extended', atMs: 15_000 }] } })
    expect(model.separators).toEqual([20])
    expect(model.end).toBeCloseTo(45)
    const [x, , received, sending] = model.data
    expect(x.at(-1)).toBeCloseTo(45)
    expect(received.every((value) => value === null)).toBe(true)
    expect(sending.every((value) => value === null)).toBe(true)
    expect(model.marks).toEqual([{ at: 35, code: 'extended' }])
    expect(model.marks[0]?.at).toBeLessThanOrEqual(model.end)
  })

  it('leaves a download and a confirmed upload on their cells, whatever the client phase time', () => {
    // The client's phase time runs past the last bucket boundary (a sample is sent just after a
    // bucket closes) and, on upload, ahead of P_start; neither adds an empty tail.
    const upload = live({ firstBucket: 9001, values: [10_000, 20_000], start: 9000.4, sendingTrace: [{ cell: 9003.7, bitsPerSecond: 3e6 }] })
    const before = buildChart({ order: ['upload'], live: { download: null, upload }, units: 'bits' })
    expect(buildChart({ order: ['upload'], live: { download: null, upload: { ...upload, phaseMs: 1250 } }, units: 'bits' })).toEqual(before)
    const download = live({ values: [125_000, null, 250_000] })
    const built = buildChart({ order: ['download'], live: { download, upload: null }, units: 'bits' })
    expect(buildChart({ order: ['download'], live: { download: { ...download, phaseMs: 303 }, upload: null }, units: 'bits' })).toEqual(built)
    // Before a finished download, an unconfirmed upload starts at its boundary, 0.3 s.
    const both = buildChart({ order: ['download', 'upload'], live: { download: { ...download, phaseMs: 303 }, upload: live({ phaseMs: 1000 }) }, units: 'bits' })
    expect(xs(both.separators)).toEqual([0.3])
    expect(both.end).toBeCloseTo(1.3)
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
    // The elapsed time, 121 cells from P_start's, floors the segment from the oldest cell held,
    // not from P_start: the same axis.
    const timed = buildChart({ order: ['upload'], live: { download: null, upload: { ...live, phaseMs: 12_100 } }, units: 'bits', loaded: { upload: loaded } })
    expect(timed.data[0]).toEqual(x)
    expect(timed.end).toBe(model.end)
  })

  it("keeps the upload's leading unknown cell one cell short of eviction", () => {
    const { live } = fed('upload', 9001, 9001 + CAPACITY, 9000)
    expect(live.evictedBefore).toBeUndefined()
    const [x, , received] = buildChart({ order: ['upload'], live: { download: null, upload: live }, units: 'bits' }).data
    expect(x[0]).toBe(0)
    expect(received.slice(0, 2)).toEqual([null, 8e5])
  })
})

describe('buildChart for a Continuous run', () => {
  type Built = ReturnType<typeof buildChart>
  /** The run fed through the live rings and the tier rings, the chart built at each of `seconds`. */
  function run(direction: 'download' | 'upload', seconds: number[], gaps: [number, number][] = []): Map<number, Built> {
    const continuous = useContinuousSeries()
    const loaded = useLoadedSeries(continuous.ping)
    const rings = liveRings(continuousSettings(direction), direction)
    let live: DirectionLive | null = null
    const built = new Map<number, Built>()
    continuousStream({ direction, seconds: Math.max(...seconds), stepS: 60, gaps }, (event) => {
      loaded.apply(event)
      continuous.apply(event)
      if (event.type === 'sample') {
        live = record(live, rings, event)
      }
    }, (elapsed) => {
      if (seconds.includes(elapsed)) {
        built.set(elapsed, buildChart({ order: [direction], live: { download: null, upload: null, [direction]: live }, units: 'bits', continuous: continuous.series.value }))
      }
    })
    return built
  }
  const SAMPLED = [9 * 60, 59 * 60, 23 * 3600, 8 * 24 * 3600]

  it('keeps every built array of an 8-day download at most 2001 entries, sampled at 9 min, 59 min, 23 h and 8 days', () => {
    const built = run('download', SAMPLED)
    expect([...built.keys()]).toEqual(SAMPLED)
    for (const [elapsed, model] of built) {
      for (const column of model.data) {
        expect(column.length).toBeLessThanOrEqual(2001)
      }
      expect(model.latency.length).toBeLessThanOrEqual(2001)
      // A coarse tier ends at its last closed cell: at most one 10 min long-tier cell behind.
      expect(elapsed - model.end).toBeGreaterThanOrEqual(-0.1)
      expect(elapsed - model.end).toBeLessThan(600)
    }
    // After a day the long ring has dropped its oldest cells: the chart starts at the oldest kept.
    const last = built.get(8 * 24 * 3600)
    expect(last?.start).toBeGreaterThan(0)
    expect(last?.data[0][0]).toBe(last?.start)
    expect(built.get(9 * 60)?.start).toBe(0)
  })

  it('keeps an 8-day upload with failure gaps at most 2001 entries per array, its gaps unknown', () => {
    // Two failure gaps: in the first minutes, and late on the 8th day.
    const gaps: [number, number][] = [[1200, 1500], [6_900_000, 6_906_000]]
    const built = run('upload', SAMPLED, gaps)
    for (const model of built.values()) {
      const [x, , received, sending] = model.data
      expect(x.length).toBeLessThanOrEqual(2001)
      expect(received.length).toBeLessThanOrEqual(2001)
      expect(sending.length).toBeLessThanOrEqual(2001)
      expect(model.latency.length).toBeLessThanOrEqual(2001)
    }
    // At 9 min, natively drawn, the first gap's cells are unknown; the chart starts at P_start.
    const early = built.get(9 * 60)
    const [x, , received] = early?.data ?? [[], [], [], []]
    expect(x[0]).toBe(0)
    const inGap = x.findIndex((at) => at >= 125 && at < 145)
    expect(received[inGap]).toBeNull()
  })

  it('re-bins a tier by summed bytes over summed known time, unknown when none is known', () => {
    const continuous = useContinuousSeries()
    continuous.apply({ type: 'settings', scope: 'run', settings: continuousSettings('download') })
    continuous.apply({ type: 'phase', phase: 'download', state: 'started', notices: [] })
    // 3600 hour cells: 2 per point; one pair half known, one pair unknown.
    const cells = Array.from({ length: 3600 }, (_, index) => (index < 2 ? { tier: 'hour' as const, bytes: index === 0 ? 125_000 : 0, knownMs: index === 0 ? 1000 : 500 } : index < 4 ? { tier: 'hour' as const, bytes: 0, knownMs: 0 } : { tier: 'hour' as const, bytes: 250_000, knownMs: 1000 }))
    const sample = { type: 'sample' as const, direction: 'download' as const, fromBucket: 0, values: [], gauge: 0, streams: 1, phaseMs: 0, dataUsedBytes: 0, warmupEndBucket: 0, cells, continuous: { elapsedMs: 59 * 60_000, dataBytes: 0 } }
    continuous.apply(sample)
    const live: DirectionLive = { firstBucket: 0, values: [], windowEnd: null, gauge: 0, sending: null, steady: null, continuous: null, warmupEnd: 0, start: null, sendingTrace: [], streams: 1, phaseMs: 0 }
    const model = buildChart({ order: ['download'], live: { download: live, upload: null }, units: 'bits', continuous: continuous.series.value })
    const [x, rates] = model.data
    expect(x.length).toBe(1801)
    // (125 000 + 0) bytes × 8 over 1.5 s of known time.
    expect(rates[0]).toBeCloseTo((125_000 * 8) / 1.5)
    expect(rates[1]).toBeNull()
    expect(rates[2]).toBeCloseTo((500_000 * 8) / 2)
    expect(x[1]).toBeCloseTo(2)
  })
})
