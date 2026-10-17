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

// The live loaded latency on the chart's axes: download from its phase start, upload on the server
// grid by the sending line's display offset, pings before the offset kept until it is known.

import { describe, expect, it } from 'vitest'

import { useLoadedSeries } from '@/composables/useLoadedSeries'
import type { EngineEvent } from '@/engine/messages'

type Sample = Extract<EngineEvent, { type: 'sample' }>

const sample = (overrides: Partial<Sample>): Sample => ({ type: 'sample', direction: 'download', fromBucket: 0, values: [], gauge: 0, streams: 1, phaseMs: 0, dataUsedBytes: 0, ...overrides })

describe('useLoadedSeries', () => {
  it('places download pings in buckets from the phase start', () => {
    const loaded = useLoadedSeries()
    loaded.apply(sample({ loadedLatency: [{ atMs: 250, rttMs: 12 }, { atMs: 550, rttMs: 14 }] }))
    loaded.apply(sample({ phaseMs: 900, loadedLatency: [{ atMs: 850, rttMs: 16 }] }))
    expect(loaded.series.value.download).toEqual([
      { at: 2.5, ms: 12 },
      { at: 5.5, ms: 14 },
      { at: 8.5, ms: 16 },
    ])
    expect(loaded.series.value.upload).toEqual([])
  })

  it('places upload pings on the server grid by the sending line offset, holding the early ones until it is known', () => {
    const loaded = useLoadedSeries()
    loaded.apply(sample({ direction: 'upload', phaseMs: 400, loadedLatency: [{ atMs: 300, rttMs: 40 }] }))
    expect(loaded.series.value.upload).toEqual([])
    // At 1 s from the phase start, this sample sits at cell 9010.5 of the server grid: the phase
    // start falls at cell 9000.5.
    loaded.apply(sample({ direction: 'upload', phaseMs: 1000, sendingBucket: 9010.5, loadedLatency: [{ atMs: 900, rttMs: 44 }] }))
    expect(loaded.series.value.upload).toEqual([
      { at: 9003.5, ms: 40 },
      { at: 9009.5, ms: 44 },
    ])
  })

  it('ignores other events and starts afresh on reset', () => {
    const loaded = useLoadedSeries()
    loaded.apply({ type: 'idle', path: 'websocket', pings: 2, count: 20, rttMs: 3, phaseMs: 100 })
    loaded.apply(sample({ loadedLatency: [{ atMs: 100, rttMs: 9 }] }))
    loaded.apply(sample({ direction: 'upload', loadedLatency: [{ atMs: 100, rttMs: 9 }] }))
    loaded.reset()
    loaded.apply(sample({ direction: 'upload', phaseMs: 0, sendingBucket: 50 }))
    expect(loaded.series.value).toEqual({ download: [], upload: [] })
  })
})
