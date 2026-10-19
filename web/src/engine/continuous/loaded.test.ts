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

// Loaded latency under Continuous (measurement.md section 15): per-second medians in an hour ring,
// the run-wide aggregates, the last minute for the live view, the last hour for the result and
// its grade, and the restart at a source switch.

import { describe, expect, it } from 'vitest'

import { continuousLoadedResult, LoadedSeconds } from '@/engine/continuous/loaded'
import { bufferbloat } from '@/engine/latency/grade'
import type { LoadedOutcome, LoadedSample } from '@/engine/latency/loaded'
import type { LoadedSource } from '@/engine/messages'

const CONTEXT = { idleMedianMs: 20, idleSource: 'websocket' as const, settleMs: 1000, hasWindow: true, reservation: false }

/** Three pings a second, 300 ms apart, from `fromMs` for `seconds` seconds, each RTT from `rtt(atMs)`. */
function pings(fromMs: number, seconds: number, rtt: (atMs: number) => number, source: LoadedSource = 'websocket'): LoadedSample[] {
  return Array.from({ length: seconds * 3 }, (_, index) => {
    const atMs = fromMs + Math.floor(index / 3) * 1000 + (index % 3) * 300
    return { atMs, rttMs: rtt(atMs), loaded: true, inFlight: 3, source }
  })
}

function outcome(sources: LoadedSource[], counters = { skippedTicks: 0, lost: 0 }): LoadedOutcome {
  return { samples: [], ...counters, maxInFlight: 3, sources }
}

describe('the per-second medians', () => {
  it('keep an hour ring and the run-wide aggregates, and nothing per sample beyond the open second', () => {
    const seconds = new LoadedSeconds(1000, () => ({ skippedTicks: 0, lost: 0 }))
    // Two hours: 100 ms under load for the first, 40 ms for the second.
    seconds.append(...pings(1000, 7200, (atMs) => (atMs < 3_601_000 ? 100 : 40)))
    expect(seconds.footprint()).toBeLessThanOrEqual(2 * 3600 + 3)
    seconds.flush()
    expect(seconds.footprint()).toBe(2 * 3600)
    expect(seconds.hour()).toHaveLength(3600)
    expect(seconds.hour().every((ping) => ping.rttMs === 40)).toBe(true)
    expect(seconds.aggregates()).toEqual({ minMs: 40, averageMs: expect.closeTo(70, 1) as number, maxMs: 100 })
    expect(seconds.lastMinuteMedianMs()).toBe(40)
    expect(seconds.samples).toBe(7200 * 3)
  })

  it('leave out the pings before slow start ends and those sent with nothing in flight', () => {
    const seconds = new LoadedSeconds(1000, () => ({ skippedTicks: 0, lost: 0 }))
    seconds.append({ atMs: 900, rttMs: 500, loaded: true, inFlight: 3, source: 'websocket' }, { atMs: 1100, rttMs: 500, loaded: false, inFlight: 0, source: 'websocket' }, ...pings(1200, 5, () => 60))
    seconds.flush()
    expect(seconds.samples).toBe(15)
    expect(seconds.aggregates().maxMs).toBe(60)
  })

  it('give the result the last hour’s median, p90 and increase, which the grade reads', () => {
    const seconds = new LoadedSeconds(1000, () => ({ skippedTicks: 0, lost: 0 }))
    seconds.append(...pings(1000, 3700, (atMs) => (atMs < 101_000 ? 900 : atMs % 1000 < 200 ? 50 : 60)))
    const loaded = continuousLoadedResult(seconds, outcome(['websocket'], { skippedTicks: 2, lost: 1 }), CONTEXT)
    if ('status' in loaded) {
      throw new Error('not measured')
    }
    // The first 100 s of 900 ms fell out of the hour ring.
    expect(loaded).toMatchObject({ source: 'websocket', samples: 3700 * 3, skippedTicks: 2, lost: 1, medianMs: 60, p90Ms: 60, increaseMs: 40 })
    expect(loaded.series).toHaveLength(3600)
    expect(bufferbloat(loaded, undefined, true)).toEqual({ grade: 'B', basis: 'download', increaseMs: 40 })
  })

  it('restart from the later source’s first sample on HTTP/2, counters included', () => {
    let counters = { skippedTicks: 0, lost: 0 }
    const seconds = new LoadedSeconds(1000, () => counters)
    seconds.append(...pings(1000, 60, () => 300))
    counters = { skippedTicks: 4, lost: 3 }
    seconds.append(...pings(61_000, 30, () => 70, 'http-h2'))
    const loaded = continuousLoadedResult(seconds, outcome(['websocket', 'http-h2'], { skippedTicks: 6, lost: 3 }), CONTEXT)
    expect(loaded).toMatchObject({ source: 'http-h2', samples: 90, skippedTicks: 2, lost: 0, medianMs: 70 })
    expect(seconds.aggregates().maxMs).toBe(70)
  })

  it('break the reservation at a switch on HTTP/1.1, with no grade', () => {
    const seconds = new LoadedSeconds(1000, () => ({ skippedTicks: 0, lost: 0 }))
    seconds.append(...pings(1000, 60, () => 300), ...pings(61_000, 30, () => 70, 'http-h1-reserved'))
    const loaded = continuousLoadedResult(seconds, outcome(['websocket', 'http-h1-reserved']), { ...CONTEXT, reservation: true })
    expect(loaded).toMatchObject({ status: 'unavailable', reason: 'reservation-broken', source: 'http-h1-reserved' })
    expect(bufferbloat(loaded, undefined, true)).toBeUndefined()
  })

  it('are unavailable without a steady window, or with fewer than 10 samples', () => {
    const seconds = new LoadedSeconds(1000, () => ({ skippedTicks: 0, lost: 0 }))
    seconds.append(...pings(1000, 3, () => 70))
    expect(continuousLoadedResult(seconds, outcome(['websocket']), CONTEXT)).toMatchObject({ status: 'unavailable', reason: 'insufficient-samples', samples: 9 })
    expect(continuousLoadedResult(seconds, outcome(['websocket']), { ...CONTEXT, hasWindow: false })).toMatchObject({ status: 'unavailable', reason: 'no-steady-window' })
    expect(continuousLoadedResult(seconds, outcome([]), CONTEXT)).toMatchObject({ status: 'unavailable', reason: 'no-probe-path' })
  })
})
