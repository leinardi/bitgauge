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

// Loaded latency in the result object, measurement.md sections 11.4, 11.5 and 17.

import { describe, expect, it } from 'vitest'

import type { LoadedSample } from '@/engine/latency/loaded'
import type { DirectionResult } from '@/engine/messages'
import { withLoaded } from '@/engine/result/loaded'

const MEASURED: DirectionResult = { status: 'measured', bitsPerSecond: 8e6, streams: 3, bytes: 1e6, events: [] }
const SKIPPED = { status: 'skipped' as const, streams: 0, bytes: 0, events: [], confirmedRequests: 0 }

describe('the stored series', () => {
  it('holds at most 2000 points, each on the timer resolution, averaged ones included', () => {
    // 4001 counted samples alternating 10.0 and 10.1 ms: a group's mean, 10.05 ms, is not on a 0.1 ms grid.
    const samples: LoadedSample[] = Array.from({ length: 4001 }, (_, index) => ({ atMs: 1000 + index * 300, rttMs: index % 2 === 0 ? 10 : 10.1, loaded: true, inFlight: 3, source: 'websocket' }))
    const outcome = { samples, skippedTicks: 0, lost: 0, maxInFlight: 3, sources: ['websocket' as const] }
    const { download } = withLoaded({ idle: null, upload: null, loaded: { download: { outcome, reserved: false, startAt: 0, seconds: null }, upload: null } }, MEASURED, SKIPPED, 0.1)
    const loaded = download.loadedLatency
    if (loaded === undefined || 'status' in loaded) {
      throw new Error('the direction should be measured')
    }
    expect(loaded.series.length).toBeLessThanOrEqual(2000)
    expect(loaded.series.every(({ rttMs }) => Math.abs(rttMs * 10 - Math.round(rttMs * 10)) < 1e-9)).toBe(true)
    expect(loaded.series[0]).toEqual({ atMs: 1000, rttMs: 10 })
  })
})
