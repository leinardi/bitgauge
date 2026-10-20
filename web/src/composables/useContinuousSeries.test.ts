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

// A Continuous run's tier rings (measurement.md section 15, frontend.md section 6): allocated at the
// phase start, fed by the samples' buckets and closed cells, the tier picked by the elapsed time,
// the overlay bins' true medians, and memory that never grows over an 8-day run.

import { describe, expect, it } from 'vitest'

import { OVERLAY_LENGTHS, tierFor, useContinuousSeries } from '@/composables/useContinuousSeries'
import { useLoadedSeries } from '@/composables/useLoadedSeries'
import { RING_LENGTHS } from '@/engine/messages'
import { continuousSettings, continuousStream } from '@/test/continuous'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

function fed() {
  const continuous = useContinuousSeries()
  const loaded = useLoadedSeries(continuous.ping)
  return {
    continuous,
    apply: (event: Parameters<typeof continuous.apply>[0]) => {
      loaded.apply(event)
      continuous.apply(event)
    },
  }
}

describe('the tier', () => {
  it('is native up to 10 min, hour up to 60 min, day up to 24 h, and long beyond', () => {
    expect([0, 10 * MINUTE, 10 * MINUTE + 1, HOUR, HOUR + 1, 24 * HOUR, 24 * HOUR + 1, 8 * 24 * HOUR].map(tierFor)).toEqual(['native', 'native', 'hour', 'hour', 'day', 'day', 'long', 'long'])
  })
})

describe('useContinuousSeries', () => {
  it('allocates nothing for a bounded run', () => {
    const { continuous, apply } = fed()
    apply({ type: 'settings', scope: 'run', settings: { ...continuousSettings('download'), preset: 'standard', download: { minMs: 10_000, maxMs: 20_000 } } })
    apply({ type: 'phase', phase: 'download', state: 'started', notices: [] })
    apply({ type: 'sample', direction: 'download', fromBucket: 0, values: [1], gauge: 0, streams: 1, phaseMs: 100, dataUsedBytes: 1 })
    expect(continuous.series.value).toBeNull()
  })

  it('feeds the native ring from the buckets and the coarse rings from the closed cells, unknown as null', () => {
    const { continuous, apply } = fed()
    apply({ type: 'settings', scope: 'run', settings: continuousSettings('upload') })
    apply({ type: 'phase', phase: 'upload', state: 'started', notices: [] })
    apply({
      type: 'sample',
      direction: 'upload',
      fromBucket: 9000,
      values: [10, null],
      gauge: 0,
      streams: 1,
      phaseMs: 200,
      dataUsedBytes: 10,
      warmupEndBucket: 9001,
      cells: [
        { tier: 'hour', bytes: 40, knownMs: 400 },
        { tier: 'hour', bytes: 0, knownMs: 0 },
      ],
      continuous: { elapsedMs: 11 * MINUTE, dataBytes: 10 },
    })
    const series = continuous.series.value
    expect(series?.direction).toBe('upload')
    expect(series?.base).toBe(9001)
    expect(series?.tier).toBe('hour')
    expect([series?.cells.native.firstIndex, series?.cells.native.toArray()]).toEqual([9000, [{ bytes: 10, knownMs: 100 }, null]])
    expect(series?.cells.hour.toArray()).toEqual([{ bytes: 40, knownMs: 400 }, null])
  })

  it('takes each overlay bin as the true median of its pings when it closes, never a median of medians', () => {
    const { continuous } = fed()
    continuous.apply({ type: 'settings', scope: 'run', settings: continuousSettings('download') })
    continuous.apply({ type: 'phase', phase: 'download', state: 'started', notices: [] })
    // One 2 s hour-tier bin (buckets 0 to 19): four pings of 100 ms, then three of 1 ms.
    for (const [at, ms] of [[1, 100], [3, 100], [5, 100], [7, 100], [9, 1], [11, 1], [13, 1]]) {
      continuous.ping('download', { at: at ?? 0, ms: ms ?? 0 })
    }
    continuous.ping('download', { at: 21, ms: 5 })
    const overlay = continuous.series.value?.overlay
    expect(overlay?.hour.toArray()).toEqual([{ at: 10, ms: 100 }])
    // The bin still open is not drawn; the native ring holds the raw pings.
    expect(overlay?.day.toArray()).toEqual([])
    expect(overlay?.native.length).toBe(8)
  })

  it('keeps every ring at its allocated length over an 8-day run, the same rings throughout', () => {
    const { continuous, apply } = fed()
    let first: unknown[] | null = null
    let checks = 0
    continuousStream({ direction: 'download', seconds: 8 * 24 * 3600, stepS: 600, pingS: 3 }, apply, () => {
      const series = continuous.series.value
      if (series === null) {
        return
      }
      const rings = [...Object.values(series.cells), ...Object.values(series.overlay)]
      first ??= rings
      expect(rings.every((ring, index) => ring === first?.[index])).toBe(true)
      for (const tier of ['native', 'hour', 'day', 'long'] as const) {
        expect(series.cells[tier].capacity).toBe(RING_LENGTHS[tier])
        expect(series.cells[tier].length).toBeLessThanOrEqual(RING_LENGTHS[tier])
        expect(series.overlay[tier].capacity).toBe(OVERLAY_LENGTHS[tier])
        expect(series.overlay[tier].length).toBeLessThanOrEqual(OVERLAY_LENGTHS[tier])
      }
      checks++
    })
    const series = continuous.series.value
    expect(checks).toBe(8 * 24 * 6)
    expect(series?.tier).toBe('long')
    // 8 days of 10 min cells overflow the 7-day long ring.
    expect(series?.cells.long.length).toBe(RING_LENGTHS.long)
    expect(series?.cells.long.evictedBefore).toBeGreaterThan(0)
    expect(series?.overlay.long.length).toBe(OVERLAY_LENGTHS.long)
  })
})
