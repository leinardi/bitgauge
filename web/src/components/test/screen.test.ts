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

import { phaseSteps, type RunView, screenState, screenTiles } from '@/components/test/screen/states'
import { gaugeInput } from '@/components/test/screen/view'
import type { Wording } from '@/components/test/wording'
import type { DirectionLive } from '@/composables/runLive'
import type { PhaseView } from '@/composables/useRunState'
import type { DirectionResult, PhaseName, Result, TestSettings } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { continuousSettings } from '@/test/continuous'
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
  return { firstBucket: 0, values: [], windowEnd: null, gauge: 0, sending: null, steady: null, continuous: null, warmupEnd: null, start: null, sendingTrace: [], streams: 1, phaseMs: 0, ...overrides }
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
      { phase: 'idle', state: 'pending', estimate: { aboutMs: 2000 } },
      { phase: 'download', state: 'pending', estimate: { minMs: 10_000, maxMs: 20_000 } },
      { phase: 'upload', state: 'pending', estimate: { minMs: 15_000, maxMs: 25_000 } },
    ])
    expect(phaseSteps(run({ status: 'idle' }), { ...SETTINGS, phases: ['upload', 'download'] }, 'en').map((step) => step.phase)).toEqual(['upload', 'download'])
  })

  it('counts idle latency by its pings, and a direction by its time against the duration', () => {
    const idle = phaseSteps(run({ phases: phases({ info: 'finished', idle: 'started' }), idle: { path: 'websocket', phaseMs: 0, pings: 5, count: 20 } }), SETTINGS, 'en')
    expect(idle[0]).toEqual({ phase: 'idle', state: 'active', progress: 0.25, pings: { n: 5, count: 20 } })
    const download = phaseSteps(run({ phases: phases({ idle: 'finished', download: 'started' }), live: { download: live({ phaseMs: 4000 }), upload: null } }), SETTINGS, 'en')
    expect(download[1]).toEqual({ phase: 'download', state: 'active', progress: 0.2, leftMs: 6000 })
    // Past its minimum the phase extends, and the time left runs to its maximum; an upload counts
    // its time before any request has confirmed.
    const steps = phaseSteps(run({ phases: phases({ upload: 'started' }), live: { download: null, upload: live({ phaseMs: 16_000 }) } }), SETTINGS, 'en')
    expect(steps[2]).toEqual({ phase: 'upload', state: 'active', progress: 16_000 / 25_000, leftMs: 9000 })
    // Before its first sample, the phase's time is unknown.
    expect(phaseSteps(run({ phases: phases({ upload: 'started' }) }), SETTINGS, 'en')[2]).toEqual({ phase: 'upload', state: 'active', progress: 0 })
  })

  it('gives a direction finished mid-run its headline, or insufficient data, and a failed phase how long it ran', () => {
    const view = phases({ idle: 'finished', download: 'finished', upload: 'started' })
    view.download = { state: 'finished', result: { status: 'measured', bitsPerSecond: 612e6, streams: 6, bytes: 1, events: [] } }
    const mid = phaseSteps(run({ phases: view }), SETTINGS, 'en')
    expect(mid[1]?.value?.replaceAll(NB, ' ')).toBe('612 Mbit/s')
    view.download = { state: 'finished' }
    expect(phaseSteps(run({ phases: view }), SETTINGS, 'en')[1]).toEqual({ phase: 'download', state: 'done', insufficient: true })
    view.download = { state: 'failed', ranMs: 6400 }
    expect(phaseSteps(run({ status: 'ended', phases: view }), SETTINGS, 'en')[1]).toEqual({ phase: 'download', state: 'failed', progress: 1, interruptedMs: 6400 })
  })

  it('gives finished phases their values from the result', () => {
    const steps = phaseSteps(run({ status: 'ended', phases: phases({ idle: 'finished', download: 'finished', upload: 'finished' }), result: resultFixture() }), SETTINGS, 'en')
    expect(steps.map((step) => [step.state, step.value?.replaceAll(NB, ' ')])).toEqual([
      ['done', '3.1 ms'],
      ['done', '612 Mbit/s'],
      ['done', '438 Mbit/s'],
    ])
  })

  it('marks a stopped direction cancelled with when it stopped, a capped one capped and an error failed', () => {
    const base = resultFixture()
    const stopped = resultFixture({
      status: 'partial',
      upload: { ...present(base.upload), status: 'partial', events: [{ code: 'cancelled', atMs: 9000 }] },
      notices: [{ code: 'stopped-early', direction: 'upload', coveredMs: 3600 }],
    })
    const all = phases({ idle: 'finished', download: 'finished', upload: 'finished' })
    expect(phaseSteps(run({ status: 'ended', phases: all, result: stopped }), SETTINGS, 'en')[2]).toEqual({ phase: 'upload', state: 'cancelled', progress: 1, stoppedAtMs: 9000 })
    // Stopped at 3.1 s before a long enough window: insufficient data, still cancelled at 3.1 s, not at its 0 s window.
    const { bitsPerSecond: _rate, peakBitsPerSecond: _peak, uncompensatedBitsPerSecond: _plain, ...numberless } = present(base.upload)
    const early = resultFixture({
      status: 'partial',
      upload: { ...numberless, status: 'insufficient-data', events: [{ code: 'cancelled', atMs: 3100 }] },
      notices: [{ code: 'stopped-early', direction: 'upload', coveredMs: 0 }],
    })
    expect(phaseSteps(run({ status: 'ended', phases: all, result: early }), SETTINGS, 'en')[2]).toEqual({ phase: 'upload', state: 'cancelled', progress: 1, stoppedAtMs: 3100 })
    const capped = resultFixture({ download: { ...present(base.download), events: [{ code: 'data-cap', atMs: 8000 }] } })
    expect(phaseSteps(run({ status: 'ended', phases: all, result: capped }), SETTINGS, 'en')[1]).toEqual({ phase: 'download', state: 'capped', progress: 1 })
    // Capped before a steady window: still capped, not "done · insufficient data".
    const { bitsPerSecond: _capRate, peakBitsPerSecond: _capPeak, uncompensatedBitsPerSecond: _capPlain, ...uncapped } = present(base.download)
    const cappedEarly = resultFixture({ download: { ...uncapped, status: 'insufficient-data', events: [{ code: 'data-cap', atMs: 73 }] } })
    expect(phaseSteps(run({ status: 'ended', phases: all, result: cappedEarly }), SETTINGS, 'en')[1]).toEqual({ phase: 'download', state: 'capped', progress: 1 })
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

describe('a Continuous run', () => {
  const figures = (elapsedMs: number) => live({ phaseMs: elapsedMs, continuous: { elapsedMs, dataBytes: 1e9 } })

  it('runs idle latency and its one direction, with no countdown and no maximum: its elapsed time, against the run length when set', () => {
    const view = run({ phases: phases({ idle: 'finished', download: 'started' }), live: { download: figures(2_538_000), upload: null } })
    expect(phaseSteps(view, continuousSettings('download'), 'en')).toEqual([
      { phase: 'idle', state: 'done' },
      { phase: 'download', state: 'active', continuous: { elapsedMs: 2_538_000 } },
    ])
    expect(phaseSteps(view, continuousSettings('download', 7_200_000), 'en')[1]).toEqual({ phase: 'download', state: 'active', continuous: { elapsedMs: 2_538_000, runLengthMs: 7_200_000 }, progress: 2_538_000 / 7_200_000 })
    const upload = run({ phases: phases({ idle: 'finished', upload: 'started' }), live: { download: null, upload: figures(60_000) } })
    expect(phaseSteps(upload, continuousSettings('upload'), 'en').map((step) => step.phase)).toEqual(['idle', 'upload'])
  })

  it('shows the run-wide average and the p90 of the last hour on the gauge, a dash until they come', () => {
    const early = gaugeInput(run({ phase: 'download', live: { download: live({ gauge: 5e8, warmupEnd: 60, continuous: { elapsedMs: 9000, dataBytes: 1e8 } }), upload: null } }), { ...context, units: 'bits', server: 'NAS' })
    expect(early.note).toBe('avg so far — · peak —')
    const later = gaugeInput(run({ phase: 'download', live: { download: live({ gauge: 5e8, warmupEnd: 60, continuous: { elapsedMs: 90_000, dataBytes: 1e9, avgBitsPerSecond: 9.21e8, peakLastHourBitsPerSecond: 9.36e8 } }), upload: null } }), { ...context, units: 'bits', server: 'NAS' })
    expect([later.note, later.peak, later.basis]).toEqual(['avg so far 921 · peak 936', 9.36e8, 'tick p90, last hour'])
  })

  it('reads a done run where it stopped, and its gauge the session average with the p90 of the last hour', () => {
    const fixture = resultFixture()
    const result: Result = { ...fixture, settings: continuousSettings('download'), download: { ...fixture.download!, bitsPerSecond: 9.21e8, peakBitsPerSecond: 9.36e8 } }
    const view = run({ status: 'ended', phases: phases({ idle: 'finished', download: 'finished' }), live: { download: figures(2_538_000), upload: null }, result })
    expect(phaseSteps(view, continuousSettings('download'), 'en')[1]).toEqual({ phase: 'download', state: 'done', continuous: { elapsedMs: 2_538_000 } })
    const gauge = gaugeInput(view, { ...context, units: 'bits', server: 'NAS' })
    expect([gauge.label, gauge.value, gauge.note, gauge.basis]).toEqual(['Average', 9.21e8, 'peak 936 · p90, last hour', 'session average'])
  })
})

describe('a stop during idle latency that kept its samples', () => {
  it('shows idle latency cancelled at its pings, the gauge in ms, the latency tiles partial and the directions skipped', () => {
    const fixture = resultFixture({ status: 'partial' })
    const skipped: DirectionResult = { status: 'skipped', streams: 0, bytes: 0, events: [] }
    const rest: Result = { ...fixture, download: skipped, upload: { ...skipped, confirmedRequests: 0 } }
    const view = run({
      status: 'ended',
      phases: phases({ info: 'finished', idle: 'finished', download: 'skipped', upload: 'skipped' }),
      idle: { path: 'websocket', phaseMs: 0, pings: 12, count: 20, medianMs: 3.1 },
      result: rest,
    })
    expect(phaseSteps(view, SETTINGS, 'en')).toEqual([
      { phase: 'idle', state: 'cancelled', progress: 0.6, pings: { n: 12, count: 20 } },
      { phase: 'download', state: 'skipped' },
      { phase: 'upload', state: 'skipped' },
    ])
    expect(gaugeInput(view, { ...context, units: 'bits', server: 'Basement NAS' })).toMatchObject({ mode: 'ms', value: rest.idle?.medianMs, text: { title: 'Cancelled' } })
    const { main } = screenTiles(view, SETTINGS, context)
    expect(main.map((tile) => tile.lines[0]?.text)).toEqual(['skipped', 'skipped', `median of ${rest.idle?.samples.length} pings · first of 12 discarded · WebSocket`, 'mean of consecutive differences'])
    expect(main.map((tile) => tile.pill?.text ?? null)).toEqual([null, null, 'Partial — stopped early', 'Partial — stopped early'])
  })
})

describe('gaugeInput', () => {
  const gaugeContext = { ...context, units: 'bits', server: 'Basement NAS' } as const

  it('reads milliseconds during idle latency, the download rate with its peak, and the upload sending', () => {
    expect(gaugeInput(run({ phase: 'idle', idle: { path: 'websocket', phaseMs: 0, pings: 3, count: 20, rttMs: 3.2, medianMs: 3.1 } }), gaugeContext)).toMatchObject({ mode: 'ms', value: 3.2, label: 'Latency', note: 'median 3.1 · ping 3 of 20', text: null })
    expect(gaugeInput(run({ phase: 'idle', idle: { path: 'websocket', phaseMs: 0, pings: 1, count: 20, rttMs: 3.2 } }), gaugeContext).note).toBe('ping 1 of 20')
    const download = live({ values: [1, 2, 3], gauge: 9e7, steady: { avgBitsPerSecond: 8e7, peakBitsPerSecond: 9.5e7 } })
    expect(gaugeInput(run({ phase: 'download', live: { download, upload: null } }), gaugeContext)).toEqual({
      mode: 'rate',
      direction: 'download',
      value: 9e7,
      peak: 9.5e7,
      inner: null,
      label: 'Download',
      at: 300,
      note: 'avg so far 80.0 · peak 95.0',
      innerLabel: null,
      text: null,
    })
    const upload = live({ sending: 4e7, gauge: 3e7, steady: null, sendingTrace: [{ cell: 12.5, bitsPerSecond: 4e7 }] })
    expect(gaugeInput(run({ phase: 'upload', live: { download: null, upload } }), gaugeContext)).toMatchObject({ direction: 'upload', value: 4e7, label: 'Upload · sending', at: 1250, note: 'warming up' })
  })

  it('reads Ready between runs, Connecting… during the info phase, and the headlines once a result is in', () => {
    expect(gaugeInput(run({ status: 'idle', result: resultFixture() }), gaugeContext)).toMatchObject({
      value: null,
      text: { title: 'Ready', message: 'Press Enter to start', touchMessage: 'Tap Start test to begin', detail: null, icon: null },
    })
    // Until the server's default settings arrive, Start waits, and the gauge says so.
    expect(gaugeInput(run({ status: 'idle' }), { ...gaugeContext, waiting: true }).text).toEqual({
      title: 'Waiting for the server',
      message: "Waiting for the server's default settings.",
      touchMessage: null,
      detail: null,
      icon: null,
    })
    expect(gaugeInput(run({ phase: 'info' }), gaugeContext).text).toMatchObject({ title: 'Connecting…', message: 'Basement NAS · reading server info' })
    expect(gaugeInput(run({ status: 'ended', result: resultFixture() }), gaugeContext)).toMatchObject({ direction: 'download', value: 612e6, peak: 641e6, inner: 438e6, innerLabel: `438${NB}Mbit/s upload`, text: null })
    const uploadOnly = resultFixture({ download: { status: 'skipped', streams: 0, bytes: 0, events: [] } })
    expect(gaugeInput(run({ status: 'ended', result: uploadOnly }), gaugeContext)).toMatchObject({ direction: 'upload', value: 438e6, inner: null, innerLabel: null, label: 'Upload' })
  })

  it('reads Cancelled after a stop, over the final arc with the partial upload inside', () => {
    const stopped = gaugeInput(run({ status: 'ended', result: resultFixture({ status: 'partial' }) }), gaugeContext)
    expect(stopped).toMatchObject({ direction: 'download', value: 612e6, inner: 438e6, innerLabel: null })
    expect(stopped.text).toEqual({ title: 'Cancelled', message: 'Partial results · not saved', touchMessage: null, detail: null, icon: 'cancelled' })
    // Kept in history by the user, it reads saved as partial.
    expect(gaugeInput(run({ status: 'ended', result: resultFixture({ status: 'partial' }) }), { ...gaugeContext, kept: true }).text?.message).toBe('Partial results · saved as partial')
    const early = resultFixture({ status: 'partial', download: { status: 'insufficient-data', streams: 2, bytes: 1, events: [] }, upload: { status: 'skipped', streams: 0, bytes: 0, events: [], confirmedRequests: 0 } })
    expect(gaugeInput(run({ status: 'ended', result: early, live: { download: live({ gauge: 5e5 }), upload: null } }), gaugeContext)).toMatchObject({ value: 5e5, inner: null })
  })

  it('reads the direction that ran when it has no number: an upload-only run stopped, or ended by the cap', () => {
    const base = resultFixture()
    const { bitsPerSecond: _rate, peakBitsPerSecond: _peak, ...bare } = present(base.upload)
    const uploadOnly: Result['settings'] = { ...base.settings, phases: ['idle', 'upload'] }
    const stopped = resultFixture({ status: 'partial', settings: uploadOnly, download: undefined, upload: { ...bare, status: 'insufficient-data', events: [{ code: 'cancelled', atMs: 900 }] } })
    expect(gaugeInput(run({ status: 'ended', result: stopped, live: { download: null, upload: live({ gauge: 2e6 }) } }), gaugeContext)).toMatchObject({ direction: 'upload', value: 2e6, inner: null, text: { title: 'Cancelled' } })
    const capped = resultFixture({ settings: uploadOnly, download: undefined, upload: { ...bare, status: 'insufficient-data', events: [{ code: 'data-cap', atMs: 900 }] } })
    expect(gaugeInput(run({ status: 'ended', result: capped }), gaugeContext)).toMatchObject({ direction: 'upload', value: null, label: 'Upload', text: null })
    // A stop during the upload after a download with insufficient data: the upload, not the
    // download's last sample.
    const { bitsPerSecond: _d, peakBitsPerSecond: _dp, ...downNone } = present(base.download)
    const afterDownload = resultFixture({ status: 'partial', download: { ...downNone, status: 'insufficient-data' }, upload: { ...bare, status: 'insufficient-data', events: [{ code: 'cancelled', atMs: 900 }] } })
    expect(gaugeInput(run({ status: 'ended', result: afterDownload, live: { download: live({ gauge: 9e7 }), upload: live({ gauge: 3e6 }) } }), gaugeContext)).toMatchObject({ direction: 'upload', value: 3e6, inner: null })
    // Both directions ran without a number: the last of the order.
    const neither = resultFixture({ download: { ...downNone, status: 'insufficient-data' }, upload: { ...bare, status: 'insufficient-data' } })
    expect(gaugeInput(run({ status: 'ended', result: neither }), gaugeContext)).toMatchObject({ direction: 'upload', value: null, label: 'Upload' })
  })

  it('reads Connection lost after an error, with the phase and the last thing measured', () => {
    const download = live({ gauge: 5.75e8 })
    const lost = run({ status: 'ended', live: { download, upload: null }, error: { code: 'requests-failed', phase: 'download', partial: false } })
    expect(gaugeInput(lost, gaugeContext).text).toEqual({ title: 'Connection lost', message: 'Error during download', touchMessage: null, detail: `last sample 575${NB}Mbit/s`, icon: 'error' })
    const early = run({ status: 'ended', idle: { path: 'websocket', phaseMs: 0, pings: 12, count: 20 }, error: { code: 'network-changed', phase: 'idle', partial: false } })
    expect(gaugeInput(early, gaugeContext).text).toMatchObject({ message: 'Error during latency', detail: '12 of 20 pings' })
    const internal = run({ status: 'ended', error: { code: 'internal', phase: null, partial: false } })
    expect(gaugeInput(internal, gaugeContext).text).toMatchObject({ title: 'Connection lost', message: null, detail: null })
  })
})

describe('screenTiles', () => {
  it('shows the live numbers while running, a finished phase’s result at once, and the direction up next', () => {
    const view = run({
      phase: 'download',
      phases: { ...phases({ info: 'finished', download: 'started' }), idle: { state: 'finished', idle: { path: 'websocket', lossPercent: 0, minMs: 2.4, medianMs: 3.1, p90Ms: 4.1, jitterMs: 0.8, samples: [] } } },
      idle: { path: 'websocket', phaseMs: 0, pings: 20, count: 20, medianMs: 3.1 },
      live: { download: live({ steady: null }), upload: null },
      dataUsedBytes: 1_500_000,
    })
    const { main, more } = screenTiles(view, SETTINGS, context)
    expect(main.map((tile) => [tile.label, tile.number ?? tile.word, tile.pill?.text ?? null, tile.lines[0]?.text ?? null])).toEqual([
      ['Download', 'warming up', 'Live', null],
      ['Upload', null, null, 'up next'],
      ['Idle latency', '3.1', null, 'min 2.4 · p90 4.1 ms · WebSocket · 0.0\u00a0% probe timeouts'],
      ['Jitter', '0.8', null, 'mean of consecutive differences'],
    ])
    expect(more.map((tile) => tile.number)).toEqual(['1.5', null])
    // While idle latency runs, both latency tiles are live with the statistics so far.
    const latency = screenTiles(run({ phase: 'idle', idle: { path: 'websocket', phaseMs: 0, pings: 14, count: 20, medianMs: 3.1, minMs: 2.4, p90Ms: 4.1, jitterMs: 0.8, lossPercent: 0 } }), SETTINGS, context)
    expect(latency.main.slice(2).map((tile) => [tile.number, tile.pill?.text])).toEqual([
      ['3.1', 'Live'],
      ['0.8', 'Live'],
    ])
  })

  it('shows the result after a run, and nothing between runs', () => {
    const done = screenTiles(run({ status: 'ended', result: resultFixture(), dataUsedBytes: 1_300_000_000 }), SETTINGS, context)
    expect(done.main.map((tile) => tile.number)).toEqual(['612', '438', '3.1', '0.4'])
    expect(done.more.map((tile) => tile.number)).toEqual(['1.3', '28.6'])
    const idle = screenTiles(run({ status: 'idle', result: resultFixture(), idle: { path: 'websocket', phaseMs: 0, pings: 2, count: 20 }, dataUsedBytes: 5 }), SETTINGS, context)
    expect([...idle.main, ...idle.more].every((tile) => tile.number === null && tile.pill === null)).toBe(true)
  })

  it('qualifies data used and the duration on the Test card: so far, elapsed, not saved, saved as error once kept', () => {
    const before = screenTiles(run({ phase: 'idle' }), SETTINGS, context, 800)
    expect(before.more.map((tile) => [tile.number, tile.lines[0]?.text])).toEqual([
      [null, undefined],
      ['0.8', 'elapsed'],
    ])
    const download = screenTiles(run({ phase: 'download', dataUsedBytes: 1_500_000 }), SETTINGS, context, 4200)
    expect(download.more.map((tile) => [tile.number, tile.lines[0]?.text])).toEqual([
      ['1.5', 'so far'],
      ['4.2', 'elapsed'],
    ])
    const short = phases({ download: 'finished' })
    short.download = { state: 'finished', result: { status: 'insufficient-data', streams: 1, bytes: 900_000, events: [] } }
    const upload = screenTiles(run({ phase: 'upload', phases: short, dataUsedBytes: 1_200_000 }), SETTINGS, context, 9000)
    expect(upload.more[0]?.lines[0]?.text).toBe('so far · download 900\u00a0kB')
    const failed = screenTiles(run({ status: 'ended', error: { code: 'server-unreachable', phase: 'upload', partial: true }, dataUsedBytes: 1_200_000 }), SETTINGS, context, 9000)
    expect(failed.more.map((tile) => [tile.number, tile.lines[0]?.text])).toEqual([
      ['1.2', 'not saved'],
      ['9.0', undefined],
    ])
    // Kept in history by the user, it reads saved as error.
    const kept = screenTiles(run({ status: 'ended', error: { code: 'server-unreachable', phase: 'upload', partial: true }, dataUsedBytes: 1_200_000, result: resultFixture({ status: 'error' }) }), SETTINGS, context, 9000, true)
    expect(kept.more[0]?.lines[0]?.text).toBe('saved as error')
  })

  it('shows no live number once a run has ended without a result', () => {
    const view = run({ status: 'ended', idle: { path: 'websocket', phaseMs: 0, pings: 4, count: 20, medianMs: 3 }, live: { download: live({ steady: { avgBitsPerSecond: 1e8, peakBitsPerSecond: 1e8 } }), upload: null }, error: { code: 'internal', phase: null, partial: false } })
    expect(screenTiles(view, SETTINGS, context).main.every((tile) => tile.number === null)).toBe(true)
  })
})
