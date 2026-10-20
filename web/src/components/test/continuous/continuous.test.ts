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

// @vitest-environment jsdom

// The Continuous live view's words (ui/screens.md section 1, ui/flows.md section 7): a dash, never
// 0, until the engine sends a rate; the run-wide numbers and the last minute's loaded latency;
// the elapsed time against the run length with its end time, or alone; the result's numbers once
// the run is done, and a stop in the warm-up with no number.

import { describe, expect, it } from 'vitest'

import { type ContinuousInput, continuousView } from '@/components/test/continuous/continuous'
import type { Wording } from '@/components/test/wording'
import type { DirectionLive } from '@/composables/runLive'
import type { DirectionResult } from '@/engine/messages'
import { createAppI18n } from '@/i18n'

const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }
const MINUTE = 60_000

function live(patch: Partial<DirectionLive> = {}): DirectionLive {
  return { firstBucket: 0, values: [], windowEnd: null, gauge: 934e6, sending: null, steady: null, continuous: { elapsedMs: 42 * MINUTE + 18_000, dataBytes: 290e9 }, warmupEnd: 62, start: null, sendingTrace: [], streams: 6, phaseMs: 0, ...patch }
}

const input = (patch: Partial<ContinuousInput> = {}): ContinuousInput => ({ direction: 'download', units: 'bits', live: live(), result: null, dataUsedBytes: 290e9, idleMedianMs: 3.1, resolutionMs: 0.1, overheadPercent: 0, nowMs: Date.parse('2026-10-12T14:44:00Z'), ...patch })
const numbers = (view: ReturnType<typeof continuousView>) => view.tiles.map((tile) => [tile.label, tile.number, tile.unit, tile.lines.map((line) => line.text).join(' | ')])

describe('continuousView', () => {
  it('reads a dash, never 0, until three fully known 1 s cells, and says why', () => {
    const warming = continuousView(input({ live: live({ warmupEnd: null, continuous: { elapsedMs: 4000, dataBytes: 1e6 } }) }), wording)
    expect(numbers(warming).slice(1, 3)).toEqual([
      ['Average', null, '', 'starts after warm-up'],
      ['Peak · p90, last hour', null, '', 'starts after warm-up'],
    ])
    const steady = continuousView(input({ live: live({ continuous: { elapsedMs: 12_000, dataBytes: 1e6 } }) }), wording)
    expect(steady.tiles[1]?.number).toBeNull()
    expect(steady.tiles[1]?.lines[0]?.text).toBe('after 3 s of fully known data')
    expect(steady.session[1]?.value).toBeNull()
  })

  it('shows the current rate, the run-wide average, the p90 of the last hour with the maximum, the last minute’s loaded latency and the data rate', () => {
    const view = continuousView(input({ live: live({ continuous: { elapsedMs: 42 * MINUTE + 18_000, dataBytes: 290e9, avgBitsPerSecond: 921e6, minBitsPerSecond: 702e6, maxBitsPerSecond: 941e6, peakLastHourBitsPerSecond: 936e6, loadedLastMinuteMedianMs: 21 } }) }), wording)
    expect(numbers(view)).toEqual([
      ['Current', '934', 'Mbit/s', 'last 0.5 s'],
      ['Average', '921', 'Mbit/s', 'run-wide, since warm-up ended'],
      ['Peak · p90, last hour', '936', 'Mbit/s', '1 s cells · max 941'],
      ['Loaded latency', '21', 'ms', 'last-minute median'],
      ['Data used', '290', 'GB', '≈ 6.86\u00a0GB/min'],
    ])
    expect(view.tiles[0]?.pill?.text).toBe('Live')
    expect(view.session.map((row) => [row.label, row.sub, row.value])).toEqual([
      ['Elapsed', 'no run length set', '42:18'],
      ['Min / max', 'download, run-wide, fully known 1 s cells', '702 / 941 Mbit/s'],
      ['Idle latency', 'measured at start', '3.1\u00a0ms'],
      ['Packet loss', "Browsers can't see packet loss over TCP", undefined],
    ])
  })

  it('reads the elapsed time against the run length with its end time', () => {
    const view = continuousView(input({ runLengthMs: 2 * 60 * MINUTE }), wording)
    const end = new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(new Date(Date.parse('2026-10-12T14:44:00Z') - (42 * MINUTE + 18_000) + 2 * 60 * MINUTE))
    expect(view.session[0]?.sub).toBe(`of 2:00:00 · ends ${end}`)
  })

  it('reads an upload’s client progress as its current rate', () => {
    const view = continuousView(input({ direction: 'upload', live: live({ gauge: 0, sending: 426e6 }) }), wording)
    expect(numbers(view)[0]).toEqual(['Current · sending', '426', 'Mbit/s', 'client progress, last 0.5 s'])
    expect(view.session[1]?.sub).toBe('upload, run-wide, fully known 1 s cells')
  })

  it('shows a done run’s result: average, p90 with the maximum, minimum, the last hour’s loaded latency', () => {
    const result: DirectionResult = {
      status: 'measured',
      bitsPerSecond: 921e6,
      peakBitsPerSecond: 936e6,
      minBitsPerSecond: 702e6,
      maxBitsPerSecond: 941e6,
      windowMs: 2_530_000,
      streams: 6,
      bytes: 290e9,
      events: [],
      confidence: { level: 'low', reasons: ['unstable'] },
      loadedLatency: { source: 'websocket', samples: 8000, skippedTicks: 0, lost: 0, medianMs: 21, p90Ms: 27, increaseMs: 18, series: [] },
    }
    const view = continuousView(input({ result, runLengthMs: 2 * 60 * MINUTE }), wording)
    expect(numbers(view)).toEqual([
      ['Average', '921', 'Mbit/s', 'run-wide, since warm-up ended | low confidence · unstable'],
      ['Peak · p90, last hour', '936', 'Mbit/s', '1 s cells · max 941'],
      ['Minimum', '702', 'Mbit/s', 'run-wide, 1 s cells'],
      ['Loaded latency', '21', 'ms', 'median, last hour'],
      ['Data used', '290', 'GB', '≈ 6.86\u00a0GB/min'],
    ])
    expect(view.session[0]).toMatchObject({ label: 'Duration', sub: 'planned 2:00:00', value: '42:18' })
  })

  it('shows a stop in the warm-up without a number, insufficient data', () => {
    const result: DirectionResult = { status: 'insufficient-data', streams: 4, bytes: 184e6, events: [] }
    const view = continuousView(input({ result, live: live({ warmupEnd: null, continuous: { elapsedMs: 6200, dataBytes: 184e6 } }), dataUsedBytes: 184e6 }), wording)
    expect(view.tiles.slice(0, 4).map((tile) => [tile.number, tile.lines[0]?.text])).toEqual([
      [null, 'starts after warm-up'],
      [null, 'starts after warm-up'],
      [null, 'starts after warm-up'],
      [null, 'median, last hour'],
    ])
    expect(view.session[0]).toMatchObject({ label: 'Duration', value: '0:06' })
  })
})
