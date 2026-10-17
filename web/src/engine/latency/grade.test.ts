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

// A direction's loaded latency and the bufferbloat grade, measurement.md sections 11.2 to 11.4.

import { describe, expect, it } from 'vitest'

import { bufferbloat, gradeOf, type LoadedContext, loadedLatencyResult } from '@/engine/latency/grade'
import type { LoadedOutcome, LoadedSample } from '@/engine/latency/loaded'
import type { LoadedLatency, LoadedSource } from '@/engine/messages'

/** `count` loaded samples every 300 ms from `fromMs`, each `rttMs`, with `inFlight` requests and `source`. */
function samples(count: number, { fromMs = 1000, rttMs = 80, inFlight = 4, source = 'websocket' as LoadedSource } = {}): LoadedSample[] {
  return Array.from({ length: count }, (_, index) => ({ atMs: fromMs + index * 300, rttMs, loaded: inFlight > 0, inFlight, source }))
}

function outcome(list: LoadedSample[], extra: Partial<LoadedOutcome> = {}): LoadedOutcome {
  const sources = [...new Set(list.map((sample) => sample.source))]
  return { samples: list, skippedTicks: 0, lost: 0, maxInFlight: Math.max(0, ...list.map((sample) => sample.inFlight)), sources, ...extra }
}

const CONTEXT: LoadedContext = { idleMedianMs: 50, idleSource: 'websocket', settleMs: 600, hasWindow: true, reservation: false }

describe('a direction’s loaded latency', () => {
  it('is the median and p90 of the loaded samples after the first I_s, with the increase over idle', () => {
    const list = [...samples(2, { fromMs: 0, rttMs: 500 }), ...samples(1, { fromMs: 900, inFlight: 0, rttMs: 900 }), ...samples(10, { rttMs: 80 }), ...samples(2, { fromMs: 4000, rttMs: 120 })]
    const result = loadedLatencyResult(outcome(list, { skippedTicks: 2, lost: 1 }), CONTEXT)
    expect(result).toEqual({
      source: 'websocket',
      samples: 12,
      skippedTicks: 2,
      lost: 1,
      medianMs: 80,
      // Interpolated between ranks, as idle latency's p90 is.
      p90Ms: expect.closeTo(116, 9) as number,
      increaseMs: 30,
      series: [...samples(10), ...samples(2, { fromMs: 4000, rttMs: 120 })].map(({ atMs, rttMs }) => ({ atMs, rttMs })),
    })
  })

  it('reports no negative increase', () => {
    expect(loadedLatencyResult(outcome(samples(10, { rttMs: 40 })), CONTEXT)).toMatchObject({ increaseMs: 0 })
  })

  it('needs at least 10 counted samples on every source', () => {
    expect(loadedLatencyResult(outcome(samples(10)), CONTEXT)).toMatchObject({ samples: 10 })
    expect(loadedLatencyResult(outcome(samples(9), { lost: 3 }), CONTEXT)).toEqual({ status: 'unavailable', reason: 'insufficient-samples', source: 'websocket', samples: 9, skippedTicks: 0, lost: 3 })
    expect(loadedLatencyResult(outcome(samples(9, { source: 'http-h2' })), CONTEXT)).toMatchObject({ status: 'unavailable', reason: 'insufficient-samples', source: 'http-h2' })
  })

  it('has no number without a steady window', () => {
    expect(loadedLatencyResult(outcome(samples(20)), { ...CONTEXT, hasWindow: false })).toEqual({ status: 'unavailable', reason: 'no-steady-window', source: 'websocket', samples: 20, skippedTicks: 0, lost: 0 })
  })

  it('names no-probe-path when no ping could be sent', () => {
    expect(loadedLatencyResult(outcome([], { skippedTicks: 30 }), CONTEXT)).toEqual({ status: 'unavailable', reason: 'no-probe-path', samples: 0, skippedTicks: 30, lost: 0 })
  })

  describe('without an idle median', () => {
    it('keeps the median, p90 and series, without the increase or the idle source', () => {
      const result = loadedLatencyResult(outcome(samples(12, { source: 'http-h2' })), { ...CONTEXT, idleMedianMs: null, idleSource: 'websocket' })
      expect(result).toMatchObject({ source: 'http-h2', medianMs: 80, p90Ms: 80 })
      expect(result).not.toHaveProperty('increaseMs')
      expect(result).not.toHaveProperty('idleSource')
    })
  })

  describe('the idle source', () => {
    it('is recorded only when idle latency took another path', () => {
      expect(loadedLatencyResult(outcome(samples(10, { source: 'http-h2' })), CONTEXT)).toMatchObject({ idleSource: 'websocket' })
      expect(loadedLatencyResult(outcome(samples(10, { source: 'http-h3' })), { ...CONTEXT, idleSource: 'http' })).not.toHaveProperty('idleSource')
      expect(loadedLatencyResult(outcome(samples(10)), CONTEXT)).not.toHaveProperty('idleSource')
      expect(loadedLatencyResult(outcome(samples(10)), { ...CONTEXT, idleSource: 'http' })).toMatchObject({ idleSource: 'http' })
    })
  })

  describe('the HTTP/1.1 reservation', () => {
    const reserved = { ...CONTEXT, reservation: true }

    it('grades when it held for the whole direction', () => {
      expect(loadedLatencyResult(outcome(samples(10, { inFlight: 5, source: 'http-h1-reserved' })), reserved)).toMatchObject({ source: 'http-h1-reserved', samples: 10 })
    })

    it('is broken by more than 5 requests in flight at any sample, counted or not', () => {
      const list = [...samples(10, { inFlight: 5, source: 'http-h1-reserved' }), ...samples(1, { fromMs: 9000, inFlight: 6, source: 'http-h1-reserved' })]
      expect(loadedLatencyResult(outcome(list), reserved)).toEqual({ status: 'unavailable', reason: 'reservation-broken', source: 'http-h1-reserved', samples: 11, skippedTicks: 0, lost: 0 })
      // A sample in slow start does not count, but it still saw six requests in flight.
      const early = [...samples(1, { fromMs: 0, inFlight: 6, source: 'http-h1-reserved' }), ...samples(10, { inFlight: 5, source: 'http-h1-reserved' })]
      expect(loadedLatencyResult(outcome(early), reserved)).toMatchObject({ status: 'unavailable', reason: 'reservation-broken', samples: 10 })
    })

    it('is broken by a direction that did not run reserved', () => {
      expect(loadedLatencyResult(outcome(samples(12, { inFlight: 5, source: 'http-h1-reserved' })), CONTEXT)).toMatchObject({ status: 'unavailable', reason: 'reservation-broken' })
    })

    it('is broken by two sources in one direction', () => {
      const list = [...samples(10), ...samples(12, { fromMs: 5000, inFlight: 5, source: 'http-h1-reserved' })]
      expect(loadedLatencyResult(outcome(list), reserved)).toMatchObject({ status: 'unavailable', reason: 'reservation-broken', source: 'http-h1-reserved', samples: 12 })
    })
  })

  it('counts only the later source on HTTP/2 and HTTP/3', () => {
    const list = [...samples(10, { rttMs: 30 }), ...samples(11, { fromMs: 5000, rttMs: 90, source: 'http-h2' })]
    expect(loadedLatencyResult(outcome(list), CONTEXT)).toMatchObject({ source: 'http-h2', samples: 11, medianMs: 90, idleSource: 'websocket' })
    const few = [...samples(10, { rttMs: 30 }), ...samples(9, { fromMs: 5000, source: 'http-h3' })]
    expect(loadedLatencyResult(outcome(few), CONTEXT)).toMatchObject({ status: 'unavailable', reason: 'insufficient-samples', source: 'http-h3', samples: 9 })
  })
})

describe('the bufferbloat grade', () => {
  it('reads the thresholds of section 11.3 at every boundary', () => {
    const boundaries: [number, string][] = [
      [0, 'A+'],
      [4.99, 'A+'],
      [5, 'A'],
      [29.99, 'A'],
      [30, 'B'],
      [59.99, 'B'],
      [60, 'C'],
      [199.99, 'C'],
      [200, 'D'],
      [399.99, 'D'],
      [400, 'F'],
      [5000, 'F'],
    ]
    for (const [increase, grade] of boundaries) {
      expect([increase, gradeOf(increase)]).toEqual([increase, grade])
    }
  })

  const measured = (increaseMs?: number): LoadedLatency => ({ source: 'websocket', samples: 10, skippedTicks: 0, lost: 0, medianMs: 90, p90Ms: 99, ...(increaseMs === undefined ? {} : { increaseMs }), series: [] })
  const unavailable: LoadedLatency = { status: 'unavailable', reason: 'insufficient-samples', source: 'websocket', samples: 3, skippedTicks: 0, lost: 0 }

  it('takes the larger increase and names the basis', () => {
    expect(bufferbloat(measured(40), measured(220), true)).toEqual({ grade: 'D', basis: 'download+upload', increaseMs: 220 })
    expect(bufferbloat(measured(40), unavailable, true)).toEqual({ grade: 'B', basis: 'download', increaseMs: 40 })
    expect(bufferbloat(undefined, measured(3), true)).toEqual({ grade: 'A+', basis: 'upload', increaseMs: 3 })
  })

  it('is absent without idle latency or a gradable direction', () => {
    expect(bufferbloat(measured(40), measured(80), false)).toBeUndefined()
    expect(bufferbloat(measured(), measured(), true)).toBeUndefined()
    expect(bufferbloat(unavailable, undefined, true)).toBeUndefined()
    expect(bufferbloat(undefined, undefined, true)).toBeUndefined()
  })
})
