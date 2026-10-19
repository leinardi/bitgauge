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

// The Continuous retention (measurement.md section 15) on synthetic cells: rings that keep exactly
// their length over 8 days, unknown and partly known cells, the saved series' tier at each boundary
// and beyond 7 days, and the running aggregates against a brute-force reference.

import { describe, expect, it } from 'vitest'

import { RING_LENGTHS, Retention } from '@/engine/continuous/retention'
import { Ring } from '@/engine/continuous/ring'
import { savedSeries, savedTier } from '@/engine/continuous/series'
import { percentile } from '@/engine/stats/buckets'

const NATIVE_PER_SECOND = 10
const NATIVE_PER_MINUTE = 600
const NATIVE_PER_DAY = 864_000

/** A retention whose steady start is bucket `first`, fed `count` cells of `value(index)`. */
function fed(count: number, value: (index: number) => number | null = () => 1000, first = 0): Retention {
  const retention = new Retention()
  retention.begin(first)
  for (let index = 0; index < count; index++) {
    retention.append(value(index))
    if (index % NATIVE_PER_DAY === 0) {
      retention.drain()
    }
  }
  return retention
}

describe('the ring', () => {
  it('is allocated at its length and drops its oldest cell once full', () => {
    const ring = new Ring(3)
    expect([ring.length, ring.size, ring.total]).toEqual([3, 0, 0])
    for (let index = 0; index < 5; index++) {
      ring.push({ bytes: index, knownMs: 100 })
    }
    expect([ring.length, ring.size, ring.total]).toEqual([3, 3, 5])
    expect(ring.cells().map((cell) => cell.bytes)).toEqual([2, 3, 4])
    expect([ring.at(1), ring.at(2)?.bytes, ring.at(4)?.bytes, ring.at(5)]).toEqual([null, 2, 4, null])
  })
})

describe('the retention over 8 days', () => {
  it('keeps every ring at exactly its length, the long ring the last 7 days', () => {
    const days = 8
    const retention = fed(days * NATIVE_PER_DAY)
    const { native, hour, day, long } = retention.rings
    expect([native.length, hour.length, day.length, long.length]).toEqual(Object.values(RING_LENGTHS))
    expect([native.size, hour.size, day.size, long.size]).toEqual([6000, 3600, 1440, 1008])
    expect([native.total, hour.total, day.total, long.total]).toEqual([days * NATIVE_PER_DAY, days * 86_400, days * 1440, days * 144])
    expect(retention.footprint()).toEqual({ retentionCells: 6000 + 3600 + 1440 + 1008, retentionPending: expect.any(Number) })
    // Each coarse cell is the exact sum of its finer cells: 10 min of 1000-byte native cells.
    expect(long.cells().every((cell) => cell.bytes === 6000 * 1000 && cell.knownMs === 600_000)).toBe(true)
    const { seconds, bytes, minBytes, maxBytes, variation } = retention.aggregates()
    expect([seconds, bytes, minBytes, maxBytes, variation]).toEqual([days * 86_400, days * 86_400 * 10_000, 10_000, 10_000, 0])
  })

  it('saves the last 7 days from the long ring beyond them', () => {
    const retention = fed(8 * NATIVE_PER_DAY, undefined, 37)
    expect(savedTier(retention)).toBe('long')
    const series = savedSeries(retention)
    expect(series?.bucketMs).toBe(600_000)
    expect(series?.values).toHaveLength(1008)
    expect(series?.warmupEndMs).toBe(3700)
    expect(series?.firstCellMs).toBe(3700 + NATIVE_PER_DAY * 100)
    expect(series?.endMs).toBe(3700 + 8 * NATIVE_PER_DAY * 100)
    expect(series?.knownMs?.every((known) => known === 600_000)).toBe(true)
  })
})

describe('the saved series’ tier', () => {
  const cases: [number, string, number][] = [
    [1, 'native', 100],
    [6000, 'native', 300],
    [6001, 'hour', 1000],
    [36_000, 'hour', 2000],
    [36_009, 'hour', 2000],
    [36_010, 'day', 60_000],
    [NATIVE_PER_DAY, 'day', 60_000],
    [NATIVE_PER_DAY + NATIVE_PER_MINUTE, 'long', 600_000],
    [7 * NATIVE_PER_DAY, 'long', 600_000],
  ]
  for (const [cells, tier, bucketMs] of cases) {
    it(`is ${tier} after ${cells} native cells, at most 2000 points of ${bucketMs} ms`, () => {
      const retention = fed(cells)
      expect(savedTier(retention)).toBe(tier)
      const series = savedSeries(retention)
      expect(series?.bucketMs).toBe(bucketMs)
      expect(series?.values.length).toBeLessThanOrEqual(2000)
      expect(series?.knownMs).toHaveLength(series?.values.length ?? -1)
      // The whole run since the steady start, the open coarse cell included: no byte left out.
      expect(series?.values.reduce<number>((sum, value) => sum + (value ?? 0), 0)).toBe(cells * 1000)
      expect(series?.knownMs?.reduce((sum, known) => sum + known, 0)).toBe(cells * 100)
      expect([series?.firstCellMs, series?.endMs]).toEqual([0, cells * 100])
    })
  }

  it('is null before the steady start’s first cell', () => {
    expect(savedSeries(new Retention())).toBeNull()
    expect(savedSeries(fed(0))).toBeNull()
  })
})

describe('unknown cells', () => {
  it('store their known time, never a zero rate, and only fully known 1 s cells count', () => {
    // The second second has two unknown native cells; the third is all unknown.
    const retention = fed(30, (index) => (index === 12 || index === 15 || index >= 20 ? null : 500))
    expect(retention.rings.hour.cells()).toEqual([
      { bytes: 5000, knownMs: 1000 },
      { bytes: 4000, knownMs: 800 },
      { bytes: 0, knownMs: 0 },
    ])
    expect(retention.values(10, 16)).toEqual([500, 500, null, 500, 500, null])
    expect(retention.aggregates()).toMatchObject({ seconds: 1, bytes: 5000, minBytes: 5000, maxBytes: 5000, peakLastHourBytes: null })
    // A coarse cell sums its finer cells' known time: the open minute holds 1.8 s of it.
    expect(retention.partial('day')).toEqual({ bytes: 9000, knownMs: 1800 })
    const series = savedSeries(retention)
    expect(series?.values.slice(10, 16)).toEqual([500, 500, null, 500, 500, null])
    expect(series?.knownMs?.slice(10, 16)).toEqual([100, 100, 0, 100, 100, 0])
  })

  it('give a downsampled point the sums of its cells, unknown only when none is known', () => {
    const retention = fed(20_010, (index) => (index < 10 || index % 10 === 3 ? null : 100))
    const series = savedSeries(retention)
    expect(series?.bucketMs).toBe(2000)
    // The first 2 s point: one unknown second, one with nine known cells.
    expect([series?.values[0], series?.knownMs?.[0]]).toEqual([900, 900])
    const empty = savedSeries(fed(6001, () => null))
    expect(empty?.values.every((value) => value === null)).toBe(true)
    expect(empty?.knownMs?.every((known) => known === 0)).toBe(true)
  })
})

describe('the running aggregates', () => {
  it('match a brute-force reference over the fully known 1 s cells', () => {
    // 90 s of varying cells, with unknown ones scattered through.
    const value = (index: number) => (index % 47 === 5 ? null : 1000 + ((index * 7919) % 1300))
    const count = 900
    const retention = fed(count, value)
    const seconds: number[] = []
    for (let second = 0; second < count / NATIVE_PER_SECOND; second++) {
      const cells = Array.from({ length: NATIVE_PER_SECOND }, (_, offset) => value(second * NATIVE_PER_SECOND + offset))
      if (cells.every((cell) => cell !== null)) {
        seconds.push(cells.reduce<number>((sum, cell) => sum + (cell ?? 0), 0))
      }
    }
    const sum = seconds.reduce((total, bytes) => total + bytes, 0)
    const mean = sum / seconds.length
    const deviation = Math.sqrt(seconds.reduce((total, bytes) => total + (bytes - mean) ** 2, 0) / seconds.length)
    const aggregates = retention.aggregates()
    expect(seconds.length).toBeLessThan(90)
    expect(aggregates.seconds).toBe(seconds.length)
    expect(aggregates.bytes).toBe(sum)
    expect(aggregates.minBytes).toBe(Math.min(...seconds))
    expect(aggregates.maxBytes).toBe(Math.max(...seconds))
    expect(aggregates.variation).toBeCloseTo(deviation / mean, 12)
    expect(aggregates.peakLastHourBytes).toBe(percentile(seconds, 90))
  })

  it('read the p90 over the last hour only, from three fully known 1 s cells', () => {
    expect(fed(29).aggregates().peakLastHourBytes).toBeNull()
    expect(fed(30).aggregates().peakLastHourBytes).toBe(10_000)
    // An hour of 2000-byte cells, then an hour of 1000-byte ones: the last hour alone.
    const retention = fed(72_000, (index) => (index < 36_000 ? 200 : 100))
    expect(retention.aggregates()).toMatchObject({ peakLastHourBytes: 1000, minBytes: 1000, maxBytes: 2000 })
  })
})

describe('the closed coarse cells', () => {
  it('are drained in order, each once', () => {
    const retention = fed(NATIVE_PER_MINUTE)
    const closed = retention.drain()
    expect(closed).toHaveLength(61)
    expect(closed.at(-1)).toEqual({ tier: 'day', bytes: 600_000, knownMs: 60_000 })
    expect(closed.slice(0, 2)).toEqual([
      { tier: 'hour', bytes: 10_000, knownMs: 1000 },
      { tier: 'hour', bytes: 10_000, knownMs: 1000 },
    ])
    expect(retention.drain()).toEqual([])
  })
})
