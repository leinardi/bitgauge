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

// The Test screen in every state of ui/screens.md section 1, driven by engine event fixtures
// replayed through a stubbed Worker: offline until GET /info answers, with Retry and Start
// disabled; idle with the connection info; running through info, idle latency, download and
// upload; done, cancelled and error, each with what it keeps and its one control. It starts the
// engine's Worker when it mounts, configures it with the server defaults under the page's base
// path as soon as they are known, and ends it on unmount.

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { getInfo, type Info } from '@/api/info'
import { useInfo } from '@/composables/useInfo'
import type { EngineEvent, Notice, PhaseName, PhaseState, Result } from '@/engine/messages'
import { settingsFromDefaults } from '@/lib/defaults'
import TestPage from '@/pages/TestPage.vue'
import { infoFixture, resultFixture } from '@/test/fixtures'
import { mountApp } from '@/test/mount'

vi.mock('@/api/info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/info')>()),
  getInfo: vi.fn(),
}))

class StubWorker extends EventTarget {
  static started: StubWorker[] = []
  readonly posted: unknown[] = []
  terminated = false

  constructor() {
    super()
    StubWorker.started.push(this)
  }

  postMessage(message: unknown): void {
    this.posted.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  emit(...events: EngineEvent[]): void {
    events.forEach((event) => this.dispatchEvent(new MessageEvent('message', { data: event })))
  }
}

const fixture = infoFixture({ server: { basePath: '/speed' } })
const INFO: Info = {
  ...fixture,
  defaults: { ...fixture.defaults, preset: 'quick', streams: { mode: 'fixed', fixed: 2, max: 8 }, units: 'bytes', warmup: 1500 },
}

const configure = { type: 'configure', settings: settingsFromDefaults(INFO.defaults), basePath: '/speed' }
const NB = '\u00a0'

/** A fixture field the test relies on. */
function present<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('missing fixture field')
  }
  return value
}

function phase(name: PhaseName, state: PhaseState, extra: { protocol?: string; streams?: number; notices?: Notice[]; ranMs?: number } = {}): EngineEvent {
  return { type: 'phase', phase: name, state, notices: [], ...extra }
}

/** The page with its Worker, the run started with Start, through info into idle latency. */
async function started() {
  vi.stubGlobal('Worker', StubWorker)
  const page = await mountApp(TestPage)
  const worker = StubWorker.started[0]
  if (worker === undefined) {
    throw new Error('no Worker')
  }
  worker.posted.length = 0
  await page.get('[data-testid="start-button"]').trigger('click')
  const emit = async (...events: EngineEvent[]) => {
    worker.emit(...events)
    await flushPromises()
  }
  return { page, worker, emit }
}

const text = (element: { text(): string }) => element.text().replaceAll(NB, ' ')
const tiles = (page: Awaited<ReturnType<typeof mountApp>>) => page.findAll('[data-testid="metric-tile"]').map(text)
const facts = (page: Awaited<ReturnType<typeof mountApp>>) => page.findAll('dl > div').map(text)

beforeAll(() => {
  const meta = document.createElement('meta')
  meta.name = 'bitgauge-base-path'
  meta.content = '/speed'
  document.head.append(meta)
})

afterEach(() => {
  StubWorker.started = []
  vi.unstubAllGlobals()
})

// The info state is shared by the module, so the order matters: first offline, then answered.
describe('the Test screen', () => {
  it('is offline until Retry reaches the server, then configures the Worker', async () => {
    vi.stubGlobal('Worker', StubWorker)
    vi.mocked(getInfo).mockRejectedValueOnce(new TypeError('network'))
    const page = await mountApp(TestPage)
    await useInfo().refresh()
    await flushPromises()
    const [worker] = StubWorker.started
    expect(StubWorker.started).toHaveLength(1)
    expect(worker?.posted).toEqual([])
    const alert = page.get('[role="alert"]')
    expect(alert.text()).toContain('Server unreachable')
    expect(page.get('[data-testid="connection-ip"]').text()).toContain('—')
    expect(page.find('[data-testid="settings-summary"]').exists()).toBe(false)
    expect(page.get('[data-testid="start-button"]').attributes('aria-disabled')).toBe('true')
    expect(page.get('[data-testid="start-reason"]').attributes('role')).toBe('tooltip')
    expect(page.get('[data-testid="start-reason"]').text()).toBe('Server unreachable — use Retry first')
    await page.get('[data-testid="start-button"]').trigger('click')
    expect(worker?.posted).toEqual([])
    // The gauge carries the state with the next automatic check and its own Retry; the phases and
    // the tiles stay, pending and empty, and the chart says what it waits for.
    const host = window.location.host
    expect(page.get('[data-testid="gauge-text"]').text()).toBe(`Server unreachable${host} didn't respond. Next check in 2 s. Retry`)
    expect(page.text()).toContain('Throughput Download Upload')
    expect(page.text()).toContain(`Nothing to measure yet. The chart fills in once ${host} responds.`)
    expect(page.findAll('[data-testid="phase-indicator"] li')).toHaveLength(3)
    expect(tiles(page)).toHaveLength(4)
    expect(facts(page)[0]).toBe('Data used—')
    vi.mocked(getInfo).mockClear()
    vi.mocked(getInfo).mockRejectedValueOnce(new TypeError('network'))
    await page.get('[data-testid="gauge-text"] button').trigger('click')
    await flushPromises()
    expect(getInfo).toHaveBeenCalledOnce()

    vi.mocked(getInfo).mockResolvedValueOnce(INFO)
    await alert.get('button').trigger('click')
    await flushPromises()
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(worker?.posted).toEqual([configure])

    page.unmount()
    expect(worker?.terminated).toBe(true)
  })

  it('shows the idle state with the connection info', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    expect(page.get('[data-testid="connection-ip"]').text()).toMatch(/192\.168\.1\.42\s*IPv4/)
    expect(page.get('[data-testid="connection-protocol"]').text()).toContain('not reported')
    expect(page.get('[data-testid="connection-streams"]').text()).toMatch(/2\s*fixed/)
    expect(page.get('[data-testid="context-label"]').text()).toBe('LAN')
    expect(page.get('[data-testid="context-label"]').attributes('aria-label')).toBe('Context: LAN, suggested')
    expect(page.get('[data-testid="settings-line"]').text()).toBe('Quick preset · 2 streams · No data cap')
    expect(page.text()).toContain('suggested')
    page.unmount()
  })

  it('configures at once when the defaults are already known', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    expect(StubWorker.started[0]?.posted).toEqual([configure])
    page.unmount()
  })

  it('shows the idle state: Start, pending phases with their durations, a Ready gauge and empty tiles', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    expect(page.get('[data-testid="start-button"]').text()).toContain('Start test')
    expect(page.findAll('[data-testid="phase-indicator"] li').map((step) => step.attributes('data-state'))).toEqual(['pending', 'pending', 'pending'])
    expect(page.get('[data-testid="gauge-text"]').text()).toContain('Ready')
    expect(page.find('[data-testid="result-bar"]').exists()).toBe(false)
    expect(page.find('[data-testid="download-json"]').exists()).toBe(false)
    // Before a run the Results show their empty tiles, with no sentence of their own.
    expect(page.text()).not.toContain('No test has run yet.')
    expect(tiles(page)).toHaveLength(4)
    // jsdom's user agent names no browser family this parser knows, so the row reads a dash.
    expect(facts(page)).toEqual(['Data used—', 'Duration—', 'Browser—'])
    page.unmount()
  })

  it('starts a run with the context label, says Connecting… on the step and the gauge, and turns Start into Stop', async () => {
    const { page, worker } = await started()
    expect(worker.posted).toEqual([{ type: 'start', override: { contextLabel: 'LAN' }, visible: true }])
    await flushPromises()
    expect(page.get('[data-testid="start-button"]').text()).toContain('Stop test')
    expect(page.get('[data-testid="phase-indicator"]').text()).toContain('Connecting…')
    expect(page.get('[data-testid="gauge-text"]').text()).toContain('Connecting…')
    page.unmount()
  })

  it('runs idle latency in milliseconds with the ping counter and the live median', async () => {
    const { page, emit } = await started()
    await emit(phase('info', 'started'), phase('info', 'finished', { protocol: 'HTTP/2' }), phase('idle', 'started'))
    await emit({ type: 'idle', path: 'websocket', phaseMs: 120, pings: 1, count: 20 }, { type: 'idle', path: 'websocket', phaseMs: 340, pings: 3, count: 20, rttMs: 3.2, medianMs: 3.1, minMs: 2.4, p90Ms: 4.1, jitterMs: 0.8, lossPercent: 0 })
    expect(page.get('[data-testid="gauge-number"]').text()).toBe('3.2')
    expect(page.get('[data-testid="gauge-label"]').text()).toBe('Latency')
    expect(page.get('[data-testid="gauge-note"]').text()).toBe('median 3.1 · ping 3 of 20')
    expect(page.get('[data-testid="gauge-caption"]').text()).toContain('ms')
    const idle = tiles(page)[2]
    expect(idle).toContain('Idle latency')
    expect(idle).toContain('3.1')
    expect(idle).toContain('Live')
    expect(idle).toContain('min 2.4 · p90 4.1 ms · WebSocket')
    expect(page.get('[data-testid="phase-indicator"] li[aria-current="step"]').text()).toContain('Idle latency')
    // The live chart is the latency samples chart until a direction draws.
    expect(page.find('[data-testid="throughput-chart"]').exists()).toBe(false)
    expect(page.get('[data-testid="latency-chart"]').attributes('aria-label')).toBe('Latency samples: Latency 3.2 ms, 0.3 s / ~2 s')
    page.unmount()
  })

  it('runs download and upload with the gauge, the protocol, the streams, the chart and data used', async () => {
    const { page, emit } = await started()
    await emit(phase('info', 'finished', { protocol: 'HTTP/2' }), phase('idle', 'finished'), phase('download', 'started', { protocol: 'h2' }))
    await emit({ type: 'sample', direction: 'download', fromBucket: 0, values: [1_250_000, 1_250_000], gauge: 1e8, streams: 4, phaseMs: 0, dataUsedBytes: 2_500_000 })
    expect(text(page.get('[data-testid="gauge-number"]'))).toBe('12.5')
    expect(page.get('[data-testid="connection-protocol"]').text()).toContain('HTTP/2')
    expect(page.get('[data-testid="connection-streams"]').text()).toContain('4')
    expect(tiles(page)[0]).toContain('warming up')
    expect(facts(page)[0]).toContain('2.5')
    expect(facts(page)[0]).toContain('so far')
    expect(facts(page)[1]).toContain('elapsed')
    expect(page.find('[data-testid="throughput-chart"]').exists()).toBe(true)
    await emit(phase('download', 'finished'), phase('upload', 'started', { streams: 2 }))
    await emit({ type: 'sample', direction: 'upload', fromBucket: 0, values: [], gauge: 0, streams: 2, phaseMs: 0, sending: 4e7, dataUsedBytes: 3_000_000 })
    expect(page.get('[data-testid="gauge-label"]').text()).toBe('Upload · sending')
    expect(text(page.get('[data-testid="gauge-number"]'))).toBe('5.00')
    page.unmount()
  })

  it('shows a complete result: metrics, the result bar with Download JSON, and Run again', async () => {
    const { page, emit } = await started()
    await emit(phase('info', 'finished'), phase('idle', 'finished'), phase('download', 'finished'), phase('upload', 'finished'))
    await emit({ type: 'result', result: resultFixture() })
    // jsdom has no IndexedDB: history is unavailable, and the bar says the result is not saved.
    expect(page.get('[data-testid="result-bar"]').text()).toContain('Test complete')
    expect(page.get('[data-testid="result-bar"]').text()).toContain('History is unavailable in this browser mode — results are not saved.')
    expect(page.findAll('button').filter((button) => button.text() === 'Download JSON')).toHaveLength(1)
    expect(page.get('[data-testid="start-button"]').text()).toContain('Run again')
    const [download, upload, idle, jitter] = tiles(page)
    expect(download).toContain('76.5MB/s')
    expect(upload).toContain('54.8MB/s')
    expect(idle).toContain('3.1ms')
    expect(jitter).toContain('0.4ms')
    expect(page.findAll('[data-testid="phase-indicator"] li').map((step) => step.attributes('data-state'))).toEqual(['done', 'done', 'done'])
    page.unmount()
  })

  it('keeps focus on the control when the run ends, and announces the result summary', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const host = document.body.appendChild(document.createElement('div'))
    const page = await mountApp(TestPage, '/', { attachTo: host })
    const worker = present(StubWorker.started[0])
    const button = page.get<HTMLButtonElement>('[data-testid="start-button"]')
    button.element.focus()
    await button.trigger('click')
    worker.emit(phase('info', 'started'))
    await flushPromises()
    // The polite region is written once its coalescing window has passed.
    await vi.waitFor(() => expect(page.get('[data-testid="live-region"]').text()).toBe('Connecting to the server'))
    worker.emit(phase('info', 'finished'), phase('idle', 'finished'), phase('download', 'finished'), phase('upload', 'finished'), { type: 'result', result: resultFixture() })
    await flushPromises()
    expect(button.text()).toContain('Run again')
    expect(document.activeElement).toBe(button.element)
    expect(page.get('[data-testid="result-summary"]').text()).toMatch(/^Test complete\. Download 76\.5 megabytes per second\./)
    expect(page.get('main').attributes('id')).toBe('main')
    page.unmount()
    host.remove()
  })

  it('shows a stopped run as Cancelled: partial, what the upload covered, insufficient data, not saved', async () => {
    const { page, worker, emit } = await started()
    await emit(phase('info', 'finished'), phase('idle', 'finished'), phase('download', 'finished'), phase('upload', 'started'))
    worker.posted.length = 0
    await page.get('[data-testid="start-button"]').trigger('click')
    expect(worker.posted).toEqual([{ type: 'stop' }])
    const base = resultFixture()
    const result: Result = {
      ...base,
      status: 'partial',
      download: { status: 'insufficient-data', streams: 6, bytes: 1, events: [] },
      upload: { ...present(base.upload), status: 'partial', events: [{ code: 'cancelled', atMs: 7400 }], series: { bucketMs: 100, firstCellMs: 4000, warmupEndMs: 4000, endMs: 7000, values: [1] } },
      notices: [{ code: 'stopped-early', direction: 'upload', coveredMs: 3000 }],
    }
    await emit(phase('upload', 'finished'), { type: 'result', result })
    const upload = tiles(page)[1] ?? ''
    expect(upload).toContain('Partial — stopped early')
    expect(upload).toContain(`based on a 6.1 s steady window · ${present(base.upload).confirmedRequests} requests`)
    expect(tiles(page)[0]).toContain('Insufficient data')
    expect(page.get('[data-testid="result-bar"]').text()).toContain('Partial results are not saved')
    expect(page.get('[data-testid="result-bar"]').text()).toContain('History is unavailable in this browser mode — results are not saved.')
    const notice = text(page.get('[data-testid="notice"]'))
    expect(notice).toContain('Partial — stopped early · upload based on a 3.0 s steady window')
    expect(notice).toContain(`Latency and download completed. Upload stopped at 7.4 s; in-flight requests were aborted, and the ${present(base.upload).confirmedRequests} requests confirmed by 7.0 s give the partial value.`)
    expect(page.findAll('[data-testid="phase-indicator"] li').map((step) => step.attributes('data-state'))).toEqual(['done', 'done', 'cancelled'])
    expect(page.get('[data-testid="start-button"]').text()).toContain('Run again')
    page.unmount()
  })

  it('returns to Idle when a stop leaves nothing measured', async () => {
    const { page, emit } = await started()
    await emit(phase('info', 'finished'), phase('idle', 'started'), { type: 'idle', path: 'websocket', phaseMs: 0, pings: 2, count: 20, rttMs: 3, medianMs: 3 })
    await page.get('[data-testid="start-button"]').trigger('click')
    await emit(phase('download', 'skipped'), phase('upload', 'skipped'))
    expect(page.get('[data-testid="start-button"]').text()).toContain('Start test')
    expect(page.find('[data-testid="result-bar"]').exists()).toBe(false)
    expect(page.find('[data-testid="notice"]').exists()).toBe(false)
    page.unmount()
  })

  it('shows an error with the phase, the kept phases, Download JSON and Retry, which runs again', async () => {
    const { page, worker, emit } = await started()
    await emit(phase('info', 'finished'), phase('idle', 'finished'), phase('download', 'started'))
    await emit({ type: 'error', code: 'requests-failed', messageKey: 'errors.requests-failed', phase: 'download', partial: true }, phase('download', 'failed', { ranMs: 6400 }), phase('upload', 'skipped'))
    const result = resultFixture({ status: 'error', download: { status: 'error', streams: 4, bytes: 1, events: [{ code: 'error', atMs: 6400, notice: 'requests-failed' }] }, upload: { status: 'skipped', streams: 0, bytes: 0, events: [], confirmedRequests: 0 } })
    await emit({ type: 'result', result })
    const failure = page.get('[data-testid="run-failure"]')
    expect(failure.attributes('role')).toBe('alert')
    expect(failure.text()).toContain('Connection to Basement NAS lost — 3 requests in a row failed during download')
    expect(failure.text()).toContain('Download stopped at 6.4\u00a0s. Latency finished before the error.')
    expect(tiles(page)[0]).toContain('error · 3 requests in a row failed')
    expect(tiles(page)[2]).toContain('3.1')
    expect(page.get('[data-testid="result-bar"]').text()).toContain('Partial results are not saved')
    expect(page.findAll('button').filter((button) => button.text() === 'Download JSON')).toHaveLength(1)
    const retry = page.get('[data-testid="start-button"]')
    expect(retry.text()).toContain('Retry test')
    worker.posted.length = 0
    await retry.trigger('click')
    expect(worker.posted).toEqual([{ type: 'start', override: { contextLabel: 'LAN' }, visible: true }])
    page.unmount()
  })

  it('shows an engine defect as a failed test with nothing to keep', async () => {
    const { page, worker } = await started()
    worker.dispatchEvent(new Event('error'))
    await flushPromises()
    expect(page.get('[data-testid="run-failure"]').text()).toContain('The test stopped because of an internal error.')
    expect(page.find('[data-testid="download-json"]').exists()).toBe(false)
    expect(page.get('[data-testid="start-button"]').text()).toContain('Retry test')
    page.unmount()
  })

  it('checks the server again when it became unreachable, and goes offline when GET /info fails', async () => {
    const { page, emit } = await started()
    vi.mocked(getInfo).mockClear()
    vi.mocked(getInfo).mockRejectedValueOnce(new TypeError('network'))
    await emit(phase('info', 'finished'), phase('idle', 'started'))
    await emit({ type: 'error', code: 'server-unreachable', messageKey: 'errors.server-unreachable', phase: 'idle', partial: false }, phase('idle', 'failed', { ranMs: 2000 }), phase('download', 'skipped'), phase('upload', 'skipped'))
    expect(getInfo).toHaveBeenCalledOnce()
    expect(page.get('[data-testid="run-failure"]').text()).toContain('server stopped responding')
    expect(page.text()).toContain('Server unreachable')
    expect(page.get('[data-testid="start-button"]').attributes('aria-disabled')).toBe('true')
    vi.mocked(getInfo).mockResolvedValueOnce(INFO)
    await useInfo().refresh()
    page.unmount()
  })

  it('checks the server again after a network change ended the run', async () => {
    const { page, emit } = await started()
    vi.mocked(getInfo).mockClear()
    vi.mocked(getInfo).mockRejectedValueOnce(new TypeError('network'))
    await emit(phase('info', 'finished'), phase('idle', 'started'))
    await emit({ type: 'error', code: 'network-changed', messageKey: 'errors.network-changed', phase: 'idle', partial: false }, phase('idle', 'failed', { ranMs: 1200 }), phase('download', 'skipped'), phase('upload', 'skipped'))
    expect(getInfo).toHaveBeenCalledOnce()
    expect(page.get('[data-testid="run-failure"]').text()).toContain('the network changed')
    expect(page.get('[data-testid="start-button"]').attributes('aria-disabled')).toBe('true')
    vi.mocked(getInfo).mockResolvedValueOnce(INFO)
    await useInfo().refresh()
    page.unmount()
  })
})
