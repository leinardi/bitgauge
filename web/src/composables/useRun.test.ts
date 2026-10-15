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

// The run bridge over a stubbed Worker global replaying engine events: every event type lands in
// the right state, the end of a run is read from the event order (architecture.md section 4), and
// the page's visibility, network events and wake lock are handled during a run.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { getInfo } from '@/api/info'
import { useInfo } from '@/composables/useInfo'
import { useRun } from '@/composables/useRun'
import type { EngineEvent, MeasuringPhase, Notice, PhaseName, PhaseState, Preset, Result } from '@/engine/messages'
import { settingsFromDefaults } from '@/lib/defaults'
import { infoFixture } from '@/test/fixtures'

vi.mock('@/api/info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/info')>()),
  getInfo: vi.fn(),
}))

// A Worker global that records what the page posts, replays engine events, and raises the
// Worker's uncaught error.
class StubWorker extends EventTarget {
  static started: { url: string; options: WorkerOptions | undefined; worker: StubWorker }[] = []
  readonly posted: unknown[] = []
  terminated = false

  constructor(url: URL | string, options?: WorkerOptions) {
    super()
    StubWorker.started.push({ url: String(url), options, worker: this })
  }

  /** The Worker the page started last. */
  static get last(): StubWorker {
    const started = StubWorker.started.at(-1)
    if (started === undefined) {
      throw new Error('no Worker was started')
    }
    return started.worker
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

  /** The engine's uncaught error, as the page's Worker object reports it. */
  fail(): void {
    this.dispatchEvent(new Event('error'))
  }
}

const INFO = infoFixture({ server: { basePath: '/speed' } })
const SETTINGS = settingsFromDefaults(INFO.defaults)

function phase(name: PhaseName, state: PhaseState, extra: { protocol?: string; streams?: number; headlineBitsPerSecond?: number; notices?: Notice[] } = {}): EngineEvent {
  return { type: 'phase', phase: name, state, notices: [], ...extra }
}

function result(status: Result['status'], notices: Notice[] = []): Result {
  return { status, notices, dataUsedBytes: 4_000_000 } as Result
}

class Sentinel extends EventTarget {
  readonly release = vi.fn(() => Promise.resolve())
}

/** A Wake Lock API whose sentinels the test can inspect, and a connection whose type it can change. */
function browser(available = true) {
  const sentinels: Sentinel[] = []
  const request = vi.fn((type: string) => {
    expect(type).toBe('screen')
    const sentinel = new Sentinel()
    sentinels.push(sentinel)
    return Promise.resolve(sentinel)
  })
  const connection = Object.assign(new EventTarget(), { type: 'wifi', effectiveType: '4g' })
  Object.defineProperty(navigator, 'connection', { value: connection, configurable: true })
  if (available) {
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
  }
  return { sentinels, request, connection }
}

function setVisible(visible: boolean): void {
  Object.defineProperty(document, 'visibilityState', { value: visible ? 'visible' : 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

/** useRun inside a scope, with the Worker it started; `stop` ends both. */
function started(options: Parameters<typeof useRun>[0] = {}) {
  vi.stubGlobal('Worker', StubWorker)
  const scope = effectScope()
  const run = scope.run(() => useRun(options))
  if (run === undefined) {
    throw new Error('no run')
  }
  const worker = StubWorker.last
  worker.posted.length = 0
  return { run, worker, scope }
}

beforeAll(() => {
  const meta = document.createElement('meta')
  meta.name = 'bitgauge-base-path'
  meta.content = '/speed'
  document.head.append(meta)
})

afterEach(() => {
  StubWorker.started = []
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'wakeLock')
  Reflect.deleteProperty(navigator, 'connection')
  Reflect.deleteProperty(document, 'visibilityState')
})

describe('before the server defaults are known', () => {
  it('posts no configure and ignores start', () => {
    const { run, worker, scope } = started()
    run.start()
    expect(worker.posted).toEqual([])
    expect(run.status.value).toBe('idle')
    scope.stop()
  })
})

describe('useRun', () => {
  beforeAll(async () => {
    vi.mocked(getInfo).mockResolvedValue(INFO)
    await useInfo().refresh()
  })

  it('configures the Worker from the defaults with the URL override, under the base path', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const scope = effectScope()
    const run = scope.run(() => useRun({ override: (defaults) => ({ preset: 'quick', units: defaults.units === 'bits' ? 'bytes' : 'bits' }) }))
    expect(StubWorker.last.posted).toEqual([{ type: 'configure', settings: SETTINGS, override: { preset: 'quick', units: 'bytes' }, basePath: '/speed' }])
    expect(run?.defaults.value).toEqual(SETTINGS)
    scope.stop()
    expect(StubWorker.last.terminated).toBe(true)
  })

  it('takes the settings the engine resolved: the configured ones, then each run\'s', () => {
    const { run, worker, scope } = started()
    if (SETTINGS === null) {
      throw new Error('the fixture defaults run in v0.1')
    }
    expect(run.settings.value).toEqual(SETTINGS)
    const quick = { ...SETTINGS, preset: 'quick' as const, pingCount: 10 }
    worker.emit({ type: 'settings', scope: 'configured', settings: quick })
    expect(run.settings.value).toEqual(quick)
    // A run's settings come as it starts, and only then.
    worker.emit({ type: 'settings', scope: 'run', settings: SETTINGS })
    expect(run.runSettings.value).toBeNull()
    run.start({ ignoredParameters: ['cap'] })
    expect(worker.posted.at(-1)).toEqual({ type: 'start', override: { ignoredParameters: ['cap'] }, visible: true })
    const extended = { ...SETTINGS, preset: 'extended' as const }
    worker.emit({ type: 'settings', scope: 'run', settings: extended })
    expect(run.runSettings.value).toEqual(extended)
    expect(run.settings.value).toEqual(quick)
    worker.emit(phase('info', 'finished'), phase('idle', 'finished'), phase('download', 'finished'), phase('upload', 'finished'), { type: 'result', result: result('complete') })
    run.start()
    expect(run.runSettings.value).toBeNull()
    scope.stop()
  })

  it('starts with the labels and the visibility, once at a time', () => {
    const { run, worker, scope } = started()
    setVisible(false)
    worker.posted.length = 0
    run.start({ label: 'Office', contextLabel: 'VPN' })
    run.start()
    expect(worker.posted).toEqual([{ type: 'start', override: { label: 'Office', contextLabel: 'VPN' }, visible: false }])
    expect(run.status.value).toBe('running')
    scope.stop()
  })

  it('starts with a preset a notice offers', () => {
    const { run, worker, scope } = started()
    worker.posted.length = 0
    run.start({ contextLabel: '', preset: 'extended' })
    expect(worker.posted).toEqual([{ type: 'start', override: { contextLabel: '', preset: 'extended' }, visible: true }])
    scope.stop()
  })

  it('keeps the idle-latency progress, and clears it for the next run', () => {
    const { run, worker, scope } = started()
    run.start()
    expect(run.idle.value).toBeNull()
    worker.emit(phase('info', 'finished'), phase('idle', 'started'), { type: 'idle', pings: 1, count: 20 }, { type: 'idle', pings: 2, count: 20, rttMs: 3.2, medianMs: 3.2 })
    expect(run.idle.value).toEqual({ pings: 2, count: 20, rttMs: 3.2, medianMs: 3.2 })
    worker.emit(phase('idle', 'finished'), phase('download', 'skipped'), phase('upload', 'skipped'), { type: 'result', result: result('complete') })
    run.start()
    expect(run.idle.value).toBeNull()
    scope.stop()
  })

  it('applies phase events: state, protocol, streams, headline, the current phase and the notices so far', () => {
    const { run, worker, scope } = started()
    run.start()
    const notice: Notice = { code: 'websocket-unavailable' }
    worker.emit(phase('info', 'started'), phase('info', 'finished', { protocol: 'h2', notices: [notice] }), phase('download', 'started'), phase('download', 'finished', { streams: 4, headlineBitsPerSecond: 9.41e7 }))
    expect(run.phases.value.info).toEqual({ state: 'finished', protocol: 'h2' })
    expect(run.phases.value.download).toEqual({ state: 'finished', streams: 4, headlineBitsPerSecond: 9.41e7 })
    expect(run.phases.value.upload).toEqual({ state: 'pending' })
    expect(run.phase.value).toBe('download')
    expect(run.protocol.value).toBe('h2')
    expect(run.notices.value).toEqual([])
    worker.emit(phase('upload', 'started', { notices: [notice] }))
    expect(run.notices.value).toEqual([notice])
    expect(run.status.value).toBe('running')
    scope.stop()
  })

  it('writes sample ranges into each direction\'s series buffer with the live numbers', () => {
    const { run, worker, scope } = started()
    run.start()
    worker.emit({ type: 'sample', direction: 'download', fromBucket: 0, values: [1000, 2000], gauge: 120_000, streams: 1, phaseMs: 0, dataUsedBytes: 3000 })
    worker.emit({ type: 'sample', direction: 'download', fromBucket: 2, values: [null], gauge: 80_000, streams: 2, phaseMs: 0, steady: { avgBitsPerSecond: 90_000, peakBitsPerSecond: 150_000 }, dataUsedBytes: 3000 })
    expect(run.live.value.download).toEqual({ firstBucket: 0, values: [1000, 2000, null], windowEnd: null, gauge: 80_000, sending: null, steady: { avgBitsPerSecond: 90_000, peakBitsPerSecond: 150_000 }, warmupEnd: null, start: null, sendingTrace: [], streams: 2, phaseMs: 0 })
    expect(run.direction.value).toBe('download')

    // Upload cells arrive in batches on the server grid, far from 0; a hole between ranges is unknown.
    worker.emit({ type: 'sample', direction: 'upload', fromBucket: 9000, values: [10, 20, 30], windowEnd: 9003, gauge: 2400, streams: 1, phaseMs: 0, sending: 5000, startBucket: 8999.5, sendingBucket: 9004.2, dataUsedBytes: 3060 })
    worker.emit({ type: 'sample', direction: 'upload', fromBucket: 9004, values: [40], windowEnd: 9005, gauge: 3200, streams: 1, phaseMs: 0, sending: 5100, startBucket: 8999.5, sendingBucket: 9005.1, warmupEndBucket: 9002, dataUsedBytes: 3100 })
    expect(run.live.value.upload).toMatchObject({ firstBucket: 9000, values: [10, 20, 30, null, 40], windowEnd: 9005, gauge: 3200, sending: 5100, steady: null, warmupEnd: 9002, start: 8999.5 })
    expect(run.live.value.upload?.sendingTrace).toEqual([
      { cell: 9004.2, bitsPerSecond: 5000 },
      { cell: 9005.1, bitsPerSecond: 5100 },
    ])
    expect(run.direction.value).toBe('upload')
    expect(run.dataUsedBytes.value).toBe(3100)
    // A new record per sample, so that a component given it as a prop sees the change.
    const before = run.live.value
    worker.emit({ type: 'sample', direction: 'upload', fromBucket: 9005, values: [], gauge: 3200, streams: 1, phaseMs: 0, dataUsedBytes: 3100 })
    expect(run.live.value).not.toBe(before)
    expect(run.live.value.upload).not.toBe(before.upload)
    expect(run.live.value.download?.values).toHaveLength(3)
    scope.stop()
  })

  it('anchors the upload buffer at its first confirmed cell, after the empty samples before it', () => {
    const { run, worker, scope } = started()
    run.start()
    worker.emit({ type: 'sample', direction: 'upload', fromBucket: 0, values: [], gauge: 1e6, streams: 1, phaseMs: 0, sending: 1e6, dataUsedBytes: 10 })
    worker.emit({ type: 'sample', direction: 'upload', fromBucket: 0, values: [], gauge: 2e6, streams: 1, phaseMs: 0, sending: 2e6, dataUsedBytes: 20 })
    worker.emit({ type: 'sample', direction: 'upload', fromBucket: 2 ** 31, values: [10, 20], windowEnd: 2 ** 31 + 2, gauge: 2e6, streams: 1, phaseMs: 0, sending: 2e6, startBucket: 2 ** 31, sendingBucket: 2 ** 31 + 3, dataUsedBytes: 30 })
    worker.emit({ type: 'sample', direction: 'upload', fromBucket: 2 ** 31 + 2, values: [30], gauge: 2e6, streams: 1, phaseMs: 0, dataUsedBytes: 40 })
    expect(run.live.value.upload?.firstBucket).toBe(2 ** 31)
    expect(run.live.value.upload?.values).toEqual([10, 20, 30])
    scope.stop()
  })

  it('ends with the result and its notices', () => {
    const { run, worker, scope } = started()
    run.start()
    const notice: Notice = { code: 'page-hidden' }
    worker.emit(phase('idle', 'finished'), { type: 'result', result: result('complete', [notice]) })
    expect(run.status.value).toBe('ended')
    expect(run.result.value?.status).toBe('complete')
    expect(run.notices.value).toEqual([notice])
    expect(run.dataUsedBytes.value).toBe(4_000_000)
    scope.stop()
  })

  it('keeps the completed phases through an error with partial results, then shows its result', () => {
    const { run, worker, scope } = started()
    run.start()
    worker.emit(phase('info', 'finished'), phase('idle', 'finished'), phase('download', 'started'))
    worker.emit({ type: 'sample', direction: 'download', fromBucket: 0, values: [500], gauge: 40_000, streams: 1, phaseMs: 0, dataUsedBytes: 500 })
    worker.emit({ type: 'error', code: 'network-changed', messageKey: 'errors.network-changed', phase: 'download', partial: true })
    worker.emit(phase('download', 'failed'), phase('upload', 'skipped'))
    // The idle latency finished, so a result is still to come.
    expect(run.status.value).toBe('running')
    expect(run.phases.value.idle.state).toBe('finished')
    expect(run.error.value).toEqual({ code: 'network-changed', phase: 'download', partial: true })
    worker.emit({ type: 'result', result: result('error') })
    expect(run.status.value).toBe('ended')
    expect(run.phases.value.idle.state).toBe('finished')
    expect(run.live.value.download?.values).toEqual([500])
    expect(run.error.value?.partial).toBe(true)
    expect(run.result.value?.status).toBe('error')
    scope.stop()
  })

  it('ends with the error alone when nothing was kept', () => {
    const { run, worker, scope } = started()
    run.start()
    worker.emit(phase('info', 'started'))
    worker.emit({ type: 'error', code: 'server-unreachable', messageKey: 'errors.server-unreachable', phase: 'info', partial: false })
    worker.emit(phase('info', 'failed'), ...(['idle', 'download', 'upload'] as MeasuringPhase[]).map((name) => phase(name, 'skipped')))
    expect(run.status.value).toBe('ended')
    expect(run.result.value).toBeNull()
    expect(run.error.value).toEqual({ code: 'server-unreachable', phase: 'info', partial: false })
    scope.stop()
  })

  it('posts stop, and a stop during idle latency with too few samples returns to idle with nothing to keep', () => {
    const { run, worker, scope } = started()
    run.start()
    worker.emit(phase('info', 'finished'), phase('idle', 'started'))
    worker.posted.length = 0
    run.stop()
    expect(worker.posted).toEqual([{ type: 'stop' }])
    expect(run.status.value).toBe('running')
    worker.emit(phase('download', 'skipped'), phase('upload', 'skipped'))
    expect(run.status.value).toBe('idle')
    // Without a stop, an idle latency still started is not over.
    run.start()
    worker.emit(phase('download', 'skipped'), phase('upload', 'skipped'), phase('idle', 'started'))
    expect(run.status.value).toBe('running')
    scope.stop()
  })

  it('waits for the partial result of a stop during idle latency that kept its samples', () => {
    const { run, worker, scope } = started()
    run.start()
    worker.emit(phase('info', 'finished'), phase('idle', 'started'))
    run.stop()
    worker.emit(phase('idle', 'finished'), phase('download', 'skipped'), phase('upload', 'skipped'))
    expect(run.status.value).toBe('running')
    worker.emit({ type: 'result', result: result('partial') })
    expect(run.status.value).toBe('ended')
    expect(run.result.value?.status).toBe('partial')
    scope.stop()
  })

  it('shows a result that arrives after a stop already returned to idle', () => {
    const { run, worker, scope } = started()
    run.start()
    worker.emit(phase('download', 'skipped'), phase('upload', 'skipped'), phase('idle', 'started'))
    run.stop()
    expect(run.status.value).toBe('idle')
    worker.emit(phase('idle', 'finished'))
    expect(run.phases.value.idle.state).toBe('finished')
    expect(run.status.value).toBe('idle')
    worker.emit({ type: 'result', result: result('partial') })
    expect(run.status.value).toBe('ended')
    expect(run.result.value?.status).toBe('partial')
    // Once the next run begins, the last one's events no longer apply.
    run.start()
    worker.emit({ type: 'error', code: 'invalid-settings', messageKey: 'errors.invalid-settings', partial: false })
    worker.emit(phase('upload', 'finished'))
    expect(run.phases.value.upload.state).toBe('pending')
    scope.stop()
  })

  it('ends a start the Worker refuses with its error alone, and a retry starts again', async () => {
    const { request, sentinels } = browser()
    const { run, worker, scope } = started()
    run.start({ label: 'x'.repeat(65) })
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce())
    worker.emit({ type: 'error', code: 'invalid-settings', messageKey: 'errors.invalid-settings', partial: false })
    expect(run.status.value).toBe('ended')
    expect(run.error.value).toEqual({ code: 'invalid-settings', phase: null, partial: false })
    await vi.waitFor(() => expect(sentinels[0]?.release).toHaveBeenCalledOnce())
    worker.posted.length = 0
    run.start()
    expect(worker.posted).toEqual([{ type: 'start', visible: true }])
    expect(run.status.value).toBe('running')
    scope.stop()
  })

  it('ends a start at once after a refused configure, until the next configure', async () => {
    const preset = ref<Preset>('quick')
    const { run, worker, scope } = started({ override: () => ({ preset: preset.value }) })
    worker.emit({ type: 'error', code: 'invalid-settings', messageKey: 'errors.invalid-settings', partial: false })
    expect(run.status.value).toBe('idle')
    run.start()
    expect(worker.posted).toEqual([])
    expect(run.status.value).toBe('ended')
    expect(run.error.value).toEqual({ code: 'invalid-settings', phase: null, partial: false })

    preset.value = 'extended'
    await nextTick()
    expect(worker.posted).toEqual([{ type: 'configure', settings: SETTINGS, override: { preset: 'extended' }, basePath: '/speed' }])
    run.start()
    expect(worker.posted).toContainEqual({ type: 'start', visible: true })
    expect(run.status.value).toBe('running')
    scope.stop()
  })

  it('ends a run with no result on the engine\'s uncaught error, and the next run starts', () => {
    const { run, worker, scope } = started()
    run.start()
    worker.emit(phase('info', 'started'))
    worker.fail()
    expect(run.status.value).toBe('ended')
    expect(run.error.value).toEqual({ code: 'internal', phase: null, partial: false })
    expect(run.result.value).toBeNull()
    run.start()
    expect(run.status.value).toBe('running')
    scope.stop()
  })

  it('ends every start at once when the Worker failed outside a run', () => {
    const { run, worker, scope } = started()
    worker.fail()
    expect(run.error.value).toBeNull()
    run.start()
    expect(worker.posted).toEqual([])
    expect(run.status.value).toBe('ended')
    expect(run.error.value).toEqual({ code: 'internal', phase: null, partial: false })
    scope.stop()
  })

  it('forwards visibility changes', () => {
    const { worker, scope } = started()
    setVisible(false)
    setVisible(true)
    expect(worker.posted).toEqual([
      { type: 'visibility', visible: false },
      { type: 'visibility', visible: true },
    ])
    scope.stop()
    setVisible(false)
    expect(worker.posted).toHaveLength(2)
  })

  it('forwards the offline event and connection type changes, not the throughput estimates', () => {
    const { connection } = browser()
    const { worker, scope } = started()
    window.dispatchEvent(new Event('offline'))
    connection.effectiveType = '3g'
    connection.dispatchEvent(new Event('change'))
    connection.type = 'cellular'
    connection.dispatchEvent(new Event('change'))
    expect(worker.posted).toEqual([
      { type: 'network', event: 'offline' },
      { type: 'network', event: 'type-changed' },
    ])
    scope.stop()
    window.dispatchEvent(new Event('offline'))
    expect(worker.posted).toHaveLength(2)
  })

  it('holds the wake lock during a run, again once visible, and releases it at the end', async () => {
    const { sentinels, request } = browser()
    const { run, worker, scope } = started()
    run.start()
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce())
    await nextTick()
    // The browser releases the lock while the page is hidden; it is requested again once visible.
    const [first] = sentinels
    setVisible(false)
    first?.dispatchEvent(new Event('release'))
    setVisible(true)
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    worker.emit(phase('idle', 'finished'), { type: 'result', result: result('complete') })
    await nextTick()
    expect(sentinels[1]?.release).toHaveBeenCalledOnce()
    expect(first?.release).not.toHaveBeenCalled()
    scope.stop()
  })

  it('runs without a wake lock where the browser has none, or refuses it', async () => {
    browser(false)
    const { run, worker, scope } = started()
    run.start()
    expect(run.status.value).toBe('running')
    scope.stop()

    const { request } = browser()
    request.mockRejectedValueOnce(new DOMException('hidden', 'NotAllowedError'))
    const again = started()
    again.run.start()
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce())
    expect(again.worker.posted).toContainEqual({ type: 'start', visible: true })
    expect(worker.terminated).toBe(true)
    again.scope.stop()
  })
})
