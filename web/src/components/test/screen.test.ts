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

// The Test screen's derivations: the state of ui/screens.md section 1 from the run's view, the
// phase steps per phase event, the gauge's input in each phase, and the tiles live and after.

import { describe, expect, it } from 'vitest'

import { gaugeInput, phaseSteps, type RunView, screenState, screenTiles } from '@/components/test/screen'
import type { Wording } from '@/components/test/wording'
import type { DirectionLive, PhaseView } from '@/composables/useRunState'
import type { PhaseName, TestSettings } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { resultFixture } from '@/test/fixtures'

const context: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }
const NB = '\u00a0'

const SETTINGS: TestSettings = {
  preset: 'standard',
  phases: ['idle', 'download', 'upload'],
  streams: { mode: 'auto', fixed: 3, max: 6 },
  download: { minMs: 10_000, maxMs: 20_000 },
  upload: { minMs: 15_000, maxMs: 25_000 },
  dataCapBytes: null,
  units: 'bits',
  warmup: 'auto',
  pingCount: 20,
  overheadCompensationPercent: 0,
}

/** A fixture field the test relies on. */
function present<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('missing fixture field')
  }
  return value
}

function live(overrides: Partial<DirectionLive>): DirectionLive {
  return { firstBucket: 0, values: [], windowEnd: null, gauge: 0, sending: null, steady: null, warmupEnd: null, start: null, sendingTrace: [], ...overrides }
}

function phases(states: Partial<Record<PhaseName, PhaseView['state']>>): Record<PhaseName, PhaseView> {
  const view = (name: PhaseName): PhaseView => ({ state: states[name] ?? 'pending' })
  return { info: view('info'), idle: view('idle'), download: view('download'), upload: view('upload') }
}

function run(overrides: Partial<RunView>): RunView {
  return { status: 'running', phase: null, phases: phases({}), live: { download: null, upload: null }, idle: null, dataUsedBytes: 0, result: null, error: null, ...overrides }
}

describe('screenState', () => {
  it('is idle, running, or by the result done, cancelled or error', () => {
    expect(screenState(run({ status: 'idle' }))).toBe('idle')
    expect(screenState(run({}))).toBe('running')
    expect(screenState(run({ status: 'ended', result: resultFixture() }))).toBe('done')
    expect(screenState(run({ status: 'ended', result: resultFixture({ status: 'partial' }) }))).toBe('cancelled')
    expect(screenState(run({ status: 'ended', result: resultFixture({ status: 'error' }) }))).toBe('error')
    expect(screenState(run({ status: 'ended', error: { code: 'internal', phase: null, partial: false } }))).toBe('error')
  })
})

describe('phaseSteps', () => {
  it('shows every configured phase pending, with the durations, between runs', () => {
    const steps = phaseSteps(run({ status: 'idle', phases: phases({ idle: 'finished' }) }), SETTINGS, 'en')
    expect(steps).toEqual([
      { phase: 'idle', state: 'pending' },
      { phase: 'download', state: 'pending', estimate: { minMs: 10_000, maxMs: 20_000 } },
      { phase: 'upload', state: 'pending', estimate: { minMs: 15_000, maxMs: 25_000 } },
    ])
    expect(phaseSteps(run({ status: 'idle' }), { ...SETTINGS, phases: ['upload', 'download'] }, 'en').map((step) => step.phase)).toEqual(['upload', 'download'])
  })

  it('counts idle latency by its pings, and a direction by its time against the duration', () => {
    const idle = phaseSteps(run({ phases: phases({ info: 'finished', idle: 'started' }), idle: { pings: 5, count: 20 } }), SETTINGS, 'en')
    expect(idle[0]).toEqual({ phase: 'idle', state: 'active', progress: 0.25 })
    const download = phaseSteps(run({ phases: phases({ idle: 'finished', download: 'started' }), live: { download: live({ values: new Array(40).fill(1) }), upload: null } }), SETTINGS, 'en')
    expect(download[1]).toEqual({ phase: 'download', state: 'active', progress: 0.2, leftMs: 6000 })
    const upload = live({ start: 100, sendingTrace: [{ cell: 260, bitsPerSecond: 1e8 }] })
    const steps = phaseSteps(run({ phases: phases({ upload: 'started' }), live: { download: null, upload } }), SETTINGS, 'en')
    expect(steps[2]).toEqual({ phase: 'upload', state: 'active', progress: 16_000 / 25_000 })
    // Before a request has confirmed, the upload's place on the grid is unknown.
    expect(phaseSteps(run({ phases: phases({ upload: 'started' }), live: { download: null, upload: live({}) } }), SETTINGS, 'en')[2]).toEqual({ phase: 'upload', state: 'active', progress: 0 })
  })

  it('gives finished phases their values from the result', () => {
    const steps = phaseSteps(run({ status: 'ended', phases: phases({ idle: 'finished', download: 'finished', upload: 'finished' }), result: resultFixture() }), SETTINGS, 'en')
    expect(steps.map((step) => [step.state, step.value?.replaceAll(NB, ' ')])).toEqual([
      ['done', '3.1 ms'],
      ['done', '612 Mbit/s'],
      ['done', '438 Mbit/s'],
    ])
  })

  it('marks a stopped direction cancelled with what it covered, a capped one capped and an error failed', () => {
    const base = resultFixture()
    const stopped = resultFixture({
      status: 'partial',
      upload: { ...present(base.upload), status: 'partial' },
      notices: [{ code: 'stopped-early', direction: 'upload', coveredMs: 3600 }],
    })
    const all = phases({ idle: 'finished', download: 'finished', upload: 'finished' })
    expect(phaseSteps(run({ status: 'ended', phases: all, result: stopped }), SETTINGS, 'en')[2]).toEqual({ phase: 'upload', state: 'cancelled', progress: 1, coveredMs: 3600 })
    const capped = resultFixture({ download: { ...present(base.download), events: [{ code: 'data-cap', atMs: 8000 }] } })
    expect(phaseSteps(run({ status: 'ended', phases: all, result: capped }), SETTINGS, 'en')[1]).toEqual({ phase: 'download', state: 'capped', progress: 1 })
    const failed = resultFixture({ status: 'error', upload: { status: 'error', streams: 4, bytes: 1, events: [{ code: 'error', atMs: 3000, notice: 'network-changed' }], confirmedRequests: 0 } })
    expect(phaseSteps(run({ status: 'ended', phases: all, result: failed }), SETTINGS, 'en')[2]).toEqual({ phase: 'upload', state: 'failed', progress: 1 })
    expect(phaseSteps(run({ status: 'ended', phases: phases({ download: 'failed', upload: 'skipped' }) }), SETTINGS, 'en').slice(1)).toEqual([
      { phase: 'download', state: 'failed', progress: 1 },
      { phase: 'upload', state: 'skipped' },
    ])
  })

  it('marks a phase still started after the run cancelled: a stop during idle latency', () => {
    const steps = phaseSteps(run({ status: 'ended', phases: phases({ idle: 'started', download: 'skipped', upload: 'skipped' }), error: { code: 'internal', phase: null, partial: false } }), SETTINGS, 'en')
    expect(steps[0]).toEqual({ phase: 'idle', state: 'cancelled' })
  })
})

describe('gaugeInput', () => {
  it('reads milliseconds during idle latency, the download rate with its peak, and the upload sending', () => {
    expect(gaugeInput(run({ phase: 'idle', idle: { pings: 3, count: 20, rttMs: 3.2, medianMs: 3.1 } }), context)).toMatchObject({ mode: 'ms', value: 3.2, label: 'Idle latency' })
    const download = live({ values: [1, 2, 3], gauge: 9e7, steady: { avgBitsPerSecond: 8e7, peakBitsPerSecond: 9.5e7 } })
    expect(gaugeInput(run({ phase: 'download', live: { download, upload: null } }), context)).toEqual({ mode: 'rate', direction: 'download', value: 9e7, peak: 9.5e7, inner: null, label: 'Download', at: 300 })
    const upload = live({ sending: 4e7, gauge: 3e7, sendingTrace: [{ cell: 12.5, bitsPerSecond: 4e7 }] })
    expect(gaugeInput(run({ phase: 'upload', live: { download: null, upload } }), context)).toMatchObject({ direction: 'upload', value: 4e7, label: 'Upload · sending', at: 1250 })
  })

  it('shows nothing while connecting or between runs, and the headlines once a result is in', () => {
    expect(gaugeInput(run({ phase: 'info' }), context)).toMatchObject({ value: null, label: 'Ready' })
    expect(gaugeInput(run({ status: 'idle', result: resultFixture() }), context).value).toBeNull()
    expect(gaugeInput(run({ status: 'ended', result: resultFixture() }), context)).toMatchObject({ direction: 'download', value: 612e6, peak: 641e6, inner: 438e6 })
    const uploadOnly = resultFixture({ download: { status: 'skipped', streams: 0, bytes: 0, events: [] } })
    expect(gaugeInput(run({ status: 'ended', result: uploadOnly }), context)).toMatchObject({ direction: 'upload', value: 438e6, inner: null, label: 'Upload' })
  })
})

describe('screenTiles', () => {
  it('shows the live numbers while running: warming up, the ping counter and the running median, data used', () => {
    const view = run({ phase: 'download', idle: { pings: 20, count: 20, medianMs: 3.1 }, live: { download: live({ steady: null }), upload: null }, dataUsedBytes: 1_500_000 })
    const { main, more } = screenTiles(view, SETTINGS, context)
    expect(main.map((tile) => [tile.label, tile.number, tile.live])).toEqual([
      ['Download', null, true],
      ['Upload', null, false],
      ['Idle latency', '3.1', true],
      ['Jitter', null, false],
    ])
    expect(main[2]?.lines[0]?.text).toBe('ping 20 of 20')
    expect(more.map((tile) => tile.number)).toEqual(['1.5', null])
  })

  it('shows the result after a run, and nothing between runs', () => {
    const done = screenTiles(run({ status: 'ended', result: resultFixture(), dataUsedBytes: 1_300_000_000 }), SETTINGS, context)
    expect(done.main.map((tile) => tile.number)).toEqual(['612', '438', '3.1', '0.4'])
    expect(done.more.map((tile) => tile.number)).toEqual(['1.3', '28.6'])
    expect(done.packetLoss.lines[0]?.text).toBe('not measured')
    const idle = screenTiles(run({ status: 'idle', result: resultFixture(), idle: { pings: 2, count: 20 }, dataUsedBytes: 5 }), SETTINGS, context)
    expect([...idle.main, ...idle.more].every((tile) => tile.number === null && !tile.live)).toBe(true)
  })

  it('shows no live number once a run has ended without a result', () => {
    const view = run({ status: 'ended', idle: { pings: 4, count: 20, medianMs: 3 }, live: { download: live({ steady: { avgBitsPerSecond: 1e8, peakBitsPerSecond: 1e8 } }), upload: null }, error: { code: 'internal', phase: null, partial: false } })
    expect(screenTiles(view, SETTINGS, context).main.every((tile) => tile.number === null)).toBe(true)
  })
})
