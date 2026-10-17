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

// The Test screen's load card (ui/screens.md sections 1 and 6): pending rows and "graded after"
// before a run, live readings as the pings come, then the result's rows with their source and
// qualifiers and the grade with its basis; no grade without idle latency. The demo's LAN and VPN
// runs read the kit's grades, B and D.

import { describe, expect, it } from 'vitest'

import { type LoadInput, loadView } from '@/components/test/tiles'
import type { Wording } from '@/components/test/wording'
import { useLoadedSeries } from '@/composables/useLoadedSeries'
import { demoSession, ended, start } from '@/demo/test/play'
import type { DemoScenarioName } from '@/demo/scenarios'
import type { LoadedLatency, Result } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { resultFixture } from '@/test/fixtures'

const context: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }

const input = (overrides: Partial<LoadInput> = {}): LoadInput => ({
  status: 'idle',
  phases: ['idle', 'download', 'upload'],
  states: { download: 'pending', upload: 'pending' },
  pings: { download: [], upload: [] },
  idleMedianMs: null,
  result: null,
  ...overrides,
})

const measured = (overrides: Partial<Extract<LoadedLatency, { medianMs: number }>> = {}): LoadedLatency => ({ source: 'websocket', samples: 40, skippedTicks: 0, lost: 0, medianMs: 18.4, p90Ms: 24.2, increaseMs: 15.3, series: [], ...overrides })

function graded(download: LoadedLatency, upload: LoadedLatency, bufferbloat: Result['bufferbloat']): Result {
  const base = resultFixture()
  return { ...base, download: { ...base.download!, loadedLatency: download }, upload: { ...base.upload!, loadedLatency: upload }, ...(bufferbloat === undefined ? {} : { bufferbloat }) }
}

const rows = (view: ReturnType<typeof loadView>) => view?.rows.map(({ label, sub, value, live }) => [label, sub, value, live === true])

describe('the load card of the Test screen', () => {
  it('waits for a run: pending rows, graded after upload', () => {
    const view = loadView(input(), context)
    expect(view?.grade).toEqual({ grade: null, words: 'Graded after upload', basis: '' })
    expect(rows(view)).toEqual([
      ['During download', 'Pending', null, false],
      ['During upload', 'Pending', null, false],
    ])
    expect(loadView(input({ phases: ['idle', 'download'] }), context)?.grade?.words).toBe('Graded after download')
    expect(loadView(input({ phases: ['idle'] }), context)).toBeNull()
  })

  it('reads the pings live: the median and p90 so far, and the increase over the idle median', () => {
    const pings = { download: [10, 12, 14, 30, 16].map((ms, index) => ({ at: index, ms })), upload: [] }
    const view = loadView(input({ status: 'running', states: { download: 'started', upload: 'pending' }, pings, idleMedianMs: 3.1 }), context)
    expect(rows(view)).toEqual([
      ['During download', 'p90 24 · +11 ms vs idle', '14', true],
      ['During upload', 'Pending', null, false],
    ])
    expect(view?.grade?.grade).toBeNull()
    const noIdle = loadView(input({ status: 'running', phases: ['download', 'upload'], states: { download: 'started', upload: 'pending' }, pings }), context)
    expect(noIdle?.rows[0]?.sub).toBe('p90 24 · no idle latency')
    // Without idle latency there is nothing to grade against.
    expect(noIdle?.grade).toBeNull()
  })

  it('settles a finished direction while the next one runs, and reads no idle latency without an idle median', () => {
    const pings = { download: [{ at: 0, ms: 18 }], upload: [{ at: 9000, ms: 40 }] }
    const view = loadView(input({ status: 'running', states: { download: 'finished', upload: 'started' }, pings, idleMedianMs: null }), context)
    expect(rows(view)).toEqual([
      ['During download', 'p90 18 · no idle latency', '18', false],
      ['During upload', 'p90 40 · no idle latency', '40', true],
    ])
  })

  it('reads a run stopped during idle latency as never reaching its directions', () => {
    const view = loadView(input({ status: 'idle', stoppedEarly: true }), context)
    expect(rows(view)).toEqual([
      ['During download', 'Not run', null, false],
      ['During upload', 'Not run', null, false],
    ])
    expect(view?.grade?.words).toBe('Not graded — no loaded latency')
  })

  it('shows the result: the source, the increase, vs idle over the other path, and the grade with its basis', () => {
    const result = graded(measured(), measured({ source: 'http-h2', idleSource: 'websocket', medianMs: 42, p90Ms: 55, increaseMs: 38.9 }), { grade: 'B', basis: 'download+upload', increaseMs: 38.9 })
    const view = loadView(input({ status: 'ended', states: { download: 'finished', upload: 'finished' }, result }), context)
    expect(rows(view)).toEqual([
      ['During download · WebSocket', 'p90 24 · +15 ms vs idle', '18', false],
      ['During upload · HTTP/2 probe', 'p90 55 · +39 ms vs idle over WebSocket', '42', false],
    ])
    expect(view?.grade).toEqual({ grade: 'B', words: 'Mild bufferbloat', basis: 'Basis: worse of download and upload — upload +39 ms (download +15 ms)' })
  })

  it('says why a direction has no loaded latency, and that the increase needs idle latency', () => {
    const result = graded(measured({ increaseMs: undefined }), { status: 'unavailable', reason: 'reservation-broken', source: 'http-h1-reserved', samples: 3, skippedTicks: 0, lost: 0 }, undefined)
    const view = loadView(input({ status: 'ended', states: { download: 'finished', upload: 'finished' }, result }), context)
    expect(rows(view)).toEqual([
      ['During download · WebSocket', 'p90 24 · no idle latency', '18', false],
      ['During upload · HTTP/1.1 reserved', 'HTTP/1.1 reservation not held', null, false],
    ])
    expect(view?.grade).toEqual({ grade: null, words: 'Not graded', basis: 'Needs idle latency and the latency under load of a direction' })
  })

  it('reads a run that ended without a result as incomplete, and a direction it never reached as not run', () => {
    const pings = { download: [{ at: 0, ms: 12 }], upload: [] }
    const view = loadView(input({ status: 'ended', states: { download: 'failed', upload: 'pending' }, pings }), context)
    expect(rows(view)).toEqual([
      ['During download', 'Not measured: the test ended before its result', null, false],
      ['During upload', 'Not run', null, false],
    ])
    expect(view?.grade?.words).toBe('Not graded — test incomplete')
  })
})

describe('the demo on the load card', () => {
  async function played(name: DemoScenarioName): Promise<ReturnType<typeof loadView>> {
    const session = demoSession(name)
    const loaded = useLoadedSeries()
    start(session)
    for (let elapsed = 0; elapsed < 120_000 && !session.events.some((event) => event.type === 'result'); elapsed += 250) {
      await session.base.advance(250)
    }
    expect(ended(session.events)).toBe(true)
    session.events.forEach((event) => loaded.apply(event))
    const event = session.events.find((candidate) => candidate.type === 'result')
    const result = event?.type === 'result' ? event.result : null
    return loadView(input({ status: 'ended', states: { download: 'finished', upload: 'finished' }, pings: loaded.series.value, result }), context)
  }

  it('grades the LAN B and the VPN D, as the kit’s fixtures do', async () => {
    const lan = await played('complete')
    expect(lan?.grade).toMatchObject({ grade: 'B', words: 'Mild bufferbloat' })
    expect(lan?.rows.map((row) => row.label)).toEqual(['During download · WebSocket', 'During upload · WebSocket'])
    const vpn = await played('slowdone')
    expect(vpn?.grade).toMatchObject({ grade: 'D', words: 'High bufferbloat' })
  })
})
