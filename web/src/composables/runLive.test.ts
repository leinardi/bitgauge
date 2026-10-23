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

// The live rings of a run: sized from the direction's maximum plus the upload grace, so a bounded
// run fits whole, and overwriting the oldest bucket only past their capacity.

import { describe, expect, it } from 'vitest'

import { type DirectionLive, liveCapacity, liveRings, record, shownEvents, withSampleNotices } from '@/composables/runLive'
import { type EngineEvent, RING_LENGTHS, type TestSettings } from '@/engine/messages'
import { resultFixture } from '@/test/fixtures'

type Sample = Extract<EngineEvent, { type: 'sample' }>

const sample = (overrides: Partial<Sample>): Sample => ({ type: 'sample', direction: 'download', fromBucket: 0, values: [], gauge: 0, streams: 1, phaseMs: 0, dataUsedBytes: 0, ...overrides })

const LONGEST: TestSettings = {
  preset: 'extended',
  phases: ['idle', 'download', 'upload'],
  streams: { mode: 'auto', fixed: 3, max: 6 },
  download: { minMs: 600_000, maxMs: 600_000 },
  upload: { minMs: 600_000, maxMs: 600_000 },
  dataCapBytes: null,
  units: 'bits',
  warmup: 'auto',
  pingCount: 20,
  overheadCompensationPercent: 0,
}

const CONTINUOUS: TestSettings = { ...LONGEST, preset: 'continuous', download: { minMs: null, maxMs: null }, upload: { minMs: null, maxMs: null }, continuousDirection: 'download' }

describe('the live events', () => {
  it('gather the extension and the data cap as the samples raise them, and an event-only sample changes no value', () => {
    const rings = liveRings(LONGEST, 'download')
    let live = record(null, rings, sample({ values: [1000, 2000] }))
    live = record(live, rings, sample({ fromBucket: 2, values: [], events: [{ code: 'extended', atMs: 10_000 }] }))
    expect(live.values).toEqual([1000, 2000])
    live = record(live, rings, sample({ fromBucket: 2, values: [3000], events: [{ code: 'data-cap', atMs: 12_340 }] }))
    expect(live.values).toEqual([1000, 2000, 3000])
    expect(live.events).toEqual([
      { code: 'extended', atMs: 10_000 },
      { code: 'data-cap', atMs: 12_340 },
    ])
  })

  it('mark the chart live, until the events of the result replace them', () => {
    const rings = liveRings(LONGEST, 'download')
    const live = { download: record(null, rings, sample({ events: [{ code: 'extended', atMs: 10_000 }] })), upload: null }
    expect(shownEvents(live, null)).toEqual({ download: [{ code: 'extended', atMs: 10_000 }], upload: [] })
    const result = resultFixture()
    expect(shownEvents(live, result).download).toEqual(result.download?.events)
  })
})

describe('the live rings', () => {
  it('hold the maximum plus the 5 s grace in buckets, and a third of it in pings', () => {
    expect(liveCapacity(LONGEST, 'download')).toEqual({ buckets: 6050, pings: 2017 })
    expect(liveCapacity({ ...LONGEST, upload: { minMs: 15_000, maxMs: 25_000 } }, 'upload')).toEqual({ buckets: 300, pings: 100 })
    expect(liveCapacity(CONTINUOUS, 'upload')).toEqual({ buckets: RING_LENGTHS.native, pings: 2000 })
    // Before the run's settings arrive, the largest bounded maximum.
    expect(liveCapacity(null, 'download')).toEqual({ buckets: 6050, pings: 2017 })
  })

  it('fit a 600 s run and its grace exactly, and drop the oldest bucket past it', () => {
    const rings = liveRings(LONGEST, 'upload')
    let live: DirectionLive | null = null
    // An upload's cells start far from 0 on the server grid.
    for (let cell = 9000; cell < 9000 + 6050; cell += 10) {
      live = record(live, rings, sample({ direction: 'upload', fromBucket: cell, values: Array.from({ length: 10 }, () => 1000), sendingBucket: cell, sending: 8e6 }))
    }
    expect(live?.firstBucket).toBe(9000)
    expect(live?.values).toHaveLength(6050)
    expect(live?.evictedBefore).toBeUndefined()
    live = record(live, rings, sample({ direction: 'upload', fromBucket: 15_050, values: [2000] }))
    expect(live.firstBucket).toBe(9001)
    expect(live.values).toHaveLength(6050)
    expect(live.values.at(-1)).toBe(2000)
    expect(live.evictedBefore).toBe(9001)
    expect(live.sendingTrace).toHaveLength(605)
  })

  it('follow the samples until a bucket is known, and leave a hole unknown, never zero', () => {
    const rings = liveRings(LONGEST, 'upload')
    let live = record(null, rings, sample({ direction: 'upload', fromBucket: 0 }))
    live = record(live, rings, sample({ direction: 'upload', fromBucket: 9001, values: [5] }))
    live = record(live, rings, sample({ direction: 'upload', fromBucket: 9004, values: [7] }))
    expect(live.firstBucket).toBe(9001)
    expect(live.values).toEqual([5, null, null, 7])
  })
})

describe('a Continuous sample', () => {
  it('keeps its live figures until a later sample brings new ones', () => {
    const rings = liveRings(null, 'download')
    const figures = { elapsedMs: 12_000, dataBytes: 9e6, avgBitsPerSecond: 6e8 }
    let live = record(null, rings, sample({ continuous: figures }))
    expect(live.continuous).toEqual(figures)
    live = record(live, rings, sample({}))
    expect(live.continuous).toEqual(figures)
  })

  it('lists the notices it raised, the latest data-used one alone', () => {
    const lowered = { code: 'stream-limit', direction: 'download', streams: 3 } as const
    const kept = withSampleNotices([lowered, { code: 'data-used', bytes: 1e9 }], [{ code: 'data-used', bytes: 1e10 }])
    expect(kept).toEqual([lowered, { code: 'data-used', bytes: 1e10 }])
    expect(withSampleNotices(kept, undefined)).toEqual(kept)
    expect(withSampleNotices([], [{ code: 'data-used', bytes: 1e9 }, { code: 'data-used', bytes: 1e10 }])).toEqual([{ code: 'data-used', bytes: 1e10 }])
  })
})
