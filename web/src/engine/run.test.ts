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

// A run on the fake transport: the phase order, skips, stops, a hidden page, network changes,
// server restarts, the WebSocket-close sequence and the data cap (measurement.md section 1,
// edge-cases.md sections 2, 5, 6, 11 and 15, ui/flows.md sections 4 and 5).

import { describe, expect, it } from 'vitest'

import { type EngineEvent, type MeasuringPhase, validateResult } from '@/engine/messages'
import { Run } from '@/engine/run'
import type { RunReport } from '@/engine/run/report'
import type { RunSettings } from '@/engine/settings'
import { FakeClock } from '@/engine/test/fakeClock'
import { FakeTransport, type Scenario } from '@/engine/test/fakeTransport'
import type { Transport } from '@/engine/types'

/** 1 MB/s both ways and 50 ms RTT, on HTTP/2. */
const LINK: Scenario = { rate: () => 1_000_000, rttMs: 50, protocol: 'h2' }

/** Quick: three fixed streams, 5 s to 10 s per direction, 10 pings. */
const QUICK: RunSettings = {
  preset: 'quick',
  phases: ['idle', 'download', 'upload'],
  streams: { mode: 'fixed', fixed: 3, max: 6 },
  download: { minMs: 5000, maxMs: 10_000 },
  upload: { minMs: 5000, maxMs: 10_000 },
  dataCapBytes: null,
  units: 'bits',
  warmup: 'auto',
  pingCount: 10,
  overheadCompensationPercent: 0,
}

interface Harness {
  clock: FakeClock
  transport: FakeTransport
  run: Run
  /** Every event, with the instant it was emitted. */
  events: { at: number; event: EngineEvent }[]
  report: () => RunReport | null | undefined
}

function start(settings: Partial<RunSettings> = {}, scenario: Scenario = LINK, wrap?: (transport: FakeTransport) => Transport): Harness {
  const clock = new FakeClock()
  const transport = new FakeTransport(clock, scenario)
  const events: Harness['events'] = []
  const run = new Run({
    clock,
    transport: wrap?.(transport) ?? transport,
    settings: { ...QUICK, ...settings },
    visible: true,
    emit: (event) => events.push({ at: clock.now(), event }),
  })
  let report: RunReport | null | undefined
  void run.start().then((value) => {
    report = value
  })
  return { clock, transport, run, events, report: () => report }
}

/** Advances until the run has ended, at most 60 s, and returns its report. */
async function finish(harness: Harness): Promise<RunReport | null> {
  await harness.clock.advance(60_000)
  const report = harness.report()
  if (report === undefined) {
    throw new Error('the run did not end')
  }
  // A run with a report emits one result, and it validates; one without emits none.
  const results = harness.events.flatMap(({ event }) => (event.type === 'result' ? [event.result] : []))
  expect(results).toHaveLength(report === null ? 0 : 1)
  results.forEach((result) => expect(validateResult(result)).toEqual([]))
  return report
}

/** The phase events as `phase:state`. */
function phases(harness: Harness): string[] {
  return harness.events.flatMap(({ event }) => (event.type === 'phase' ? [`${event.phase}:${event.state}`] : []))
}

function errors(harness: Harness) {
  return harness.events.flatMap(({ event }) => (event.type === 'error' ? [event] : []))
}

/** Advances until the phase event `phase:state` has been emitted, then by `extraMs`; returns when it was. */
async function reach(harness: Harness, phase: string, extraMs = 0): Promise<number> {
  while (!phases(harness).includes(phase)) {
    if (harness.clock.now() > 60_000) {
      throw new Error(`no ${phase} event`)
    }
    await harness.clock.advance(10)
  }
  const at = when(harness, phase)
  await harness.clock.advance(Math.max(0, at + extraMs - harness.clock.now()))
  return at
}

/** When the phase event `phase:state` was emitted. */
function when(harness: Harness, phase: string): number {
  const found = harness.events.find(({ event }) => event.type === 'phase' && `${event.phase}:${event.state}` === phase)
  if (found === undefined) {
    throw new Error(`no ${phase} event`)
  }
  return found.at
}

const ALL = ['info:started', 'info:finished', 'idle:started', 'idle:finished', 'download:started', 'download:finished', 'upload:started', 'upload:finished']

describe('the phase order', () => {
  it('runs info, idle latency, download and upload, and reports them all', async () => {
    const harness = start()
    const report = await finish(harness)
    expect(phases(harness)).toEqual(ALL)
    expect(report).toMatchObject({ status: 'complete', protocol: 'h2', skipped: [], error: null, notices: [] })
    expect(report?.info.server.epoch).toBe('epoch-1')
    expect(report?.browser).toEqual({ name: 'Firefox', major: 131, os: 'Linux' })
    expect(report?.idle?.result.path).toBe('websocket')
    expect(report?.download?.status).toBe('measured')
    expect(report?.upload?.status).toBe('measured')
    expect(report?.dataUsedBytes).toBe((report?.download?.bytes ?? 0) + (report?.upload?.bytes ?? 0))
    // The info phase's idle request, then path B's probes under load: the protocol is h2.
    expect(new Set(harness.transport.server.probed)).toEqual(new Set(['/api/v1/small']))
    expect(harness.transport.server.probed.length).toBeGreaterThan(1)
  })

  it('carries each finished phase’s part of the result on its phase event, as the result reports it', async () => {
    const harness = start({ overheadCompensationPercent: 2 })
    await finish(harness)
    const result = harness.events.flatMap(({ event }) => (event.type === 'result' ? [event.result] : []))[0]
    const finished = (phase: string) => harness.events.flatMap(({ event }) => (event.type === 'phase' && event.phase === phase && event.state === 'finished' ? [event] : []))
    expect(result?.download?.bitsPerSecond).toBeGreaterThan(0)
    // A direction's loaded latency waits for its pings' grace, which runs on into the next phase,
    // so it arrives with the result alone.
    const { loadedLatency: downloadLoaded, ...download } = result?.download ?? { status: 'skipped' }
    const { loadedLatency: uploadLoaded, ...upload } = result?.upload ?? { status: 'skipped' }
    expect(downloadLoaded).toBeDefined()
    expect(uploadLoaded).toBeDefined()
    expect(finished('download').map((event) => event.result)).toEqual([download])
    expect(finished('upload').map((event) => event.result)).toEqual([upload])
    expect(finished('idle').map((event) => event.idle)).toEqual([result?.idle])
    expect(finished('idle')[0]).not.toHaveProperty('result')
  })

  it('carries a direction with no number without one', async () => {
    const harness = start()
    await reach(harness, 'download:started', 1000)
    harness.run.stop()
    await finish(harness)
    const finished = harness.events.find(({ event }) => event.type === 'phase' && event.phase === 'download' && event.state === 'finished')?.event
    expect(finished?.type === 'phase' ? finished.result?.status : null).toBe('partial')
    expect(finished?.type === 'phase' ? finished.result : null).not.toHaveProperty('bitsPerSecond')
  })

  it("carries a finished direction's notices on every later phase event, as the result lists them", async () => {
    // Upload first, at 2 kB/s: it has no steady window by its maximum, so it ends without a number.
    const harness = start({ phases: ['idle', 'upload', 'download'] }, { ...LINK, rate: (direction) => (direction === 'upload' ? 2000 : 1_000_000) })
    const report = await finish(harness)
    const started = harness.events.find(({ event }) => event.type === 'phase' && event.phase === 'download' && event.state === 'started')?.event
    const live = started?.type === 'phase' ? started.notices : []
    expect(live).toEqual([
      { code: 'slow-link-extended', direction: 'upload' },
      { code: 'insufficient-data', direction: 'upload', offer: 'standard' },
    ])
    const result = harness.events.find(({ event }) => event.type === 'result')?.event
    expect(result?.type === 'result' ? result.result.notices.slice(0, live.length) : []).toEqual(live)
    expect(report?.upload?.status).toBe('insufficient-data')
  })

  it('carries a notice for each ignored URL parameter from the first phase event to the result', async () => {
    const harness = start({ ignoredParameters: [{ parameter: 'streams', value: '12' }, { parameter: 'cap', value: '1kB' }] })
    const report = await finish(harness)
    const ignored = [
      { code: 'url-parameter-ignored', parameter: 'streams', value: '12' },
      { code: 'url-parameter-ignored', parameter: 'cap', value: '1kB' },
    ]
    const first = harness.events.find(({ event }) => event.type === 'phase')?.event
    expect(first?.type === 'phase' ? first.notices : []).toEqual(ignored)
    expect(report?.notices).toEqual(ignored)
    const result = harness.events.find(({ event }) => event.type === 'result')?.event
    expect(result?.type === 'result' ? result.result.notices.slice(0, 2) : []).toEqual(ignored)
  })

  it('reports idle latency after each ping, between its phase events', async () => {
    const harness = start()
    const report = await finish(harness)
    const kinds = harness.events.map(({ event }) => (event.type === 'phase' ? `${event.phase}:${event.state}` : event.type))
    const idle = harness.events.flatMap(({ event }) => (event.type === 'idle' ? [event] : []))
    expect(idle.map((event) => event.pings)).toEqual(Array.from({ length: idle.length }, (_, index) => index + 1))
    expect(idle.at(-1)).toMatchObject({ count: idle.length, medianMs: report?.idle?.result.medianMs })
    // Each carries how long the phase has run, for the latency samples chart.
    const times = idle.map((event) => event.phaseMs)
    expect(times.every((ms, index) => ms > 0 && ms >= (times[index - 1] ?? 0))).toBe(true)
    expect(kinds.indexOf('idle')).toBeGreaterThan(kinds.indexOf('idle:started'))
    expect(kinds.lastIndexOf('idle')).toBeLessThan(kinds.indexOf('idle:finished'))
  })

  it('runs upload before download when the settings say so', async () => {
    const harness = start({ phases: ['idle', 'upload', 'download'] })
    await finish(harness)
    expect(phases(harness)).toEqual(ALL.slice(0, 4).concat(['upload:started', 'upload:finished', 'download:started', 'download:finished']))
  })

  const only: [string, MeasuringPhase[], MeasuringPhase[]][] = [
    ['latency-only', ['idle'], ['download', 'upload']],
    ['download-only', ['download'], ['idle', 'upload']],
  ]
  for (const [name, configured, skipped] of only) {
    it(`skips the phases a ${name} run leaves out`, async () => {
      const harness = start({ phases: configured })
      const report = await finish(harness)
      expect(phases(harness)).toEqual([
        'info:started',
        'info:finished',
        ...skipped.map((phase) => `${phase}:skipped`),
        ...configured.flatMap((phase) => [`${phase}:started`, `${phase}:finished`]),
      ])
      expect(report).toMatchObject({ status: 'complete', skipped })
    })
  }

  it('ramps without an idle median when idle latency is skipped', async () => {
    const report = await finish(start({ phases: ['download'], streams: { mode: 'auto', fixed: 3, max: 6 } }))
    expect(report?.idle).toBeNull()
    expect(report?.download?.status).toBe('measured')
  })
})

describe('a stop', () => {
  it('during the info phase leaves no result', async () => {
    const harness = start()
    await harness.clock.advance(20)
    harness.run.stop()
    expect(await finish(harness)).toBeNull()
    expect(phases(harness)).toEqual(['info:started', 'idle:skipped', 'download:skipped', 'upload:skipped'])
  })

  it('during idle latency with fewer than 5 samples leaves no result, and skips the rest', async () => {
    const harness = start()
    await harness.clock.advance(400)
    harness.run.stop()
    expect(await finish(harness)).toBeNull()
    expect(phases(harness).slice(-3)).toEqual(['idle:started', 'download:skipped', 'upload:skipped'])
  })

  it('during idle latency with at least 5 samples keeps a partial idle latency from them', async () => {
    const harness = start()
    await reach(harness, 'idle:started')
    const pings = () => harness.events.filter(({ event }) => event.type === 'idle').length
    while (pings() < 9) {
      await harness.clock.advance(10)
    }
    harness.run.stop()
    const report = await finish(harness)
    expect(report).toMatchObject({ status: 'partial', skipped: ['download', 'upload'], download: null, upload: null })
    // Nine pings: the warm-up and eight samples.
    expect(report?.idle?.result.samples).toHaveLength(8)
    expect(report?.idle?.result.medianMs).toBeGreaterThan(0)
    expect(phases(harness).slice(-3)).toEqual(['idle:finished', 'download:skipped', 'upload:skipped'])
  })

  it('during download gives a partial result with the bytes kept and upload skipped', async () => {
    const harness = start()
    await reach(harness, 'download:started', 2500)
    harness.run.stop()
    const report = await finish(harness)
    expect(report).toMatchObject({ status: 'partial', skipped: ['upload'], upload: null, error: null })
    expect(report?.download?.status).toBe('partial')
    expect(report?.download?.bytes).toBeGreaterThan(0)
    expect(report?.notices).toContainEqual(expect.objectContaining({ code: 'stopped-early', direction: 'download' }))
  })
})

describe('a hidden page', () => {
  it('without late ticks keeps measuring and adds the notice', async () => {
    const harness = start()
    await harness.clock.advance(3000)
    harness.run.visibility(false)
    await harness.clock.advance(2000)
    harness.run.visibility(true)
    const report = await finish(harness)
    expect(report?.status).toBe('complete')
    expect(report?.notices).toEqual([{ code: 'page-hidden' }])
  })

  it('with a late tick stops the run at the last on-time tick, as a user stop', async () => {
    const harness = start({ download: { minMs: 10_000, maxMs: 20_000 } })
    const downloadStart = await reach(harness, 'download:started')
    await harness.clock.advance(4000 - harness.clock.now())
    harness.run.visibility(false)
    // The browser pauses the Worker for 1.5 s: the tick due at 4.1 s arrives at 5.5 s.
    harness.clock.pause(1500)
    const report = await finish(harness)
    expect(report?.status).toBe('partial')
    expect(report?.download?.endMs).toBe(4000 - downloadStart)
    expect(report?.notices).toEqual([expect.objectContaining({ code: 'stopped-early', direction: 'download' }), { code: 'page-hidden' }])
  })

  it('counts a pause as hidden when the resumed Worker handles the visible message before the late tick', async () => {
    const harness = start({ download: { minMs: 10_000, maxMs: 20_000 } })
    const downloadStart = await reach(harness, 'download:started')
    await harness.clock.advance(4000 - harness.clock.now())
    harness.run.visibility(false)
    harness.clock.pause(1500)
    harness.run.visibility(true)
    const report = await finish(harness)
    expect(report?.status).toBe('partial')
    expect(report?.download?.endMs).toBe(4000 - downloadStart)
    expect(report?.notices).toEqual([expect.objectContaining({ code: 'stopped-early', direction: 'download' }), { code: 'page-hidden' }])
  })

  for (const order of ['the late tick first', 'the visible message first']) {
    it(`paused during idle latency restarts it once visible, with ${order}`, async () => {
      const harness = start()
      await harness.clock.advance(300)
      harness.run.visibility(false)
      harness.clock.pause(1500)
      if (order === 'the late tick first') {
        await harness.clock.advance(1)
      }
      harness.run.visibility(true)
      const report = await finish(harness)
      expect(report?.status).toBe('complete')
      expect(report?.idle?.result.samples).toHaveLength(9)
      expect(report?.notices).toEqual([{ code: 'page-hidden' }])
      expect(phases(harness).filter((phase) => phase === 'idle:started')).toHaveLength(1)
    })
  }

  it('restarts idle latency once it is visible again', async () => {
    const plain = start()
    await finish(plain)
    const harness = start()
    await harness.clock.advance(300)
    harness.run.visibility(false)
    await harness.clock.advance(200)
    harness.run.visibility(true)
    const report = await finish(harness)
    // The restart at 0.5 s runs all ten pings again: the time idle latency had run is lost.
    expect(when(harness, 'idle:finished') - when(plain, 'idle:finished')).toBe(500 - when(plain, 'idle:started'))
    expect(report?.idle?.result.samples).toHaveLength(9)
  })
})

describe('a late tick while visible', () => {
  it('adds the timer-throttling notice and the run carries on', async () => {
    const harness = start()
    await harness.clock.advance(4000)
    harness.clock.pause(1500)
    const report = await finish(harness)
    expect(report?.status).toBe('complete')
    expect(report?.notices).toEqual([{ code: 'timer-throttling-detected' }])
  })
})

describe('a network change', () => {
  it('ends the run with an error, keeping the completed phases', async () => {
    const harness = start()
    await reach(harness, 'idle:finished', 2000)
    harness.run.network()
    const report = await finish(harness)
    expect(errors(harness)).toEqual([{ type: 'error', code: 'network-changed', messageKey: 'errors.network-changed', phase: 'download', partial: true }])
    expect(report).toMatchObject({ status: 'error', error: 'network-changed', skipped: ['upload'] })
    expect(report?.idle?.result.path).toBe('websocket')
    // The direction reports nothing measured, and its stop mark is the error.
    expect(report?.download).toMatchObject({ status: 'error', window: null, warmup: null, buckets: [] })
    expect(report?.download?.bytes).toBeGreaterThan(0)
    expect(report?.download?.events).toEqual([expect.objectContaining({ code: 'error', notice: 'network-changed' })])
    expect(phases(harness)).toContain('download:failed')
    // The failed phase says how long it ran, display only; a finished one does not.
    const ended = harness.events.flatMap(({ event }) => (event.type === 'phase' && event.state !== 'started' ? [event] : []))
    expect(ended.find((event) => event.phase === 'download')?.ranMs).toBeGreaterThanOrEqual(0)
    expect(ended.find((event) => event.phase === 'idle')?.ranMs).toBeUndefined()
  })

  it('after the run has ended is ignored', async () => {
    const harness = start({ phases: ['idle'] })
    const report = await finish(harness)
    harness.run.network()
    harness.run.stop()
    harness.run.visibility(false)
    expect(report?.status).toBe('complete')
    expect(errors(harness)).toEqual([])
  })
})

describe('a server restart', () => {
  it('is detected by an upload answer with a new epoch', async () => {
    const harness = start()
    await reach(harness, 'upload:started', 2000)
    // A new epoch without a WebSocket close: only the upload telemetry carries it.
    harness.transport.server.epoch = 'epoch-2'
    const report = await finish(harness)
    expect(errors(harness)).toEqual([expect.objectContaining({ code: 'server-restarted', phase: 'upload', partial: true })])
    expect(report).toMatchObject({ status: 'error', error: 'server-restarted' })
    expect(report?.upload).toMatchObject({ status: 'error', window: null })
    expect(report?.download?.status).toBe('measured')
  })

  it('is detected by the WebSocket close and the new epoch of GET /info', async () => {
    const harness = start()
    await reach(harness, 'download:started', 2000)
    harness.transport.server.restart('epoch-2')
    const report = await finish(harness)
    expect(errors(harness)).toEqual([expect.objectContaining({ code: 'server-restarted', phase: 'download' })])
    expect(report).toMatchObject({ status: 'error', skipped: ['upload'] })
    // The same report as the upload telemetry's path: nothing measured, and the notice.
    expect(report?.download).toMatchObject({ status: 'error', window: null, warmup: null, buckets: [] })
    expect(report?.download?.notices).toContainEqual({ code: 'server-restarted' })
  })

  it('during upload, seen by the WebSocket close, reports nothing for the upload', async () => {
    const harness = start()
    await reach(harness, 'upload:started', 3000)
    harness.transport.server.restart('epoch-2')
    const report = await finish(harness)
    expect(errors(harness)).toEqual([expect.objectContaining({ code: 'server-restarted', phase: 'upload' })])
    expect(report?.upload).toMatchObject({ status: 'error', window: null, series: null, warmupEndMs: null, windowEndMs: null })
    expect(report?.upload?.notices).toContainEqual({ code: 'server-restarted' })
    expect(report?.upload?.events.some((event) => event.code === 'cancelled')).toBe(false)
  })
})

describe('the WebSocket', () => {
  it('reopens after an unexpected close, and the run continues with the notice', async () => {
    const harness = start()
    await reach(harness, 'download:started', 1000)
    harness.transport.server.closeEcho()
    const report = await finish(harness)
    expect(report).toMatchObject({ status: 'complete', notices: [{ code: 'websocket-reopened' }] })
    expect(harness.transport.server.opened).toBe(2)
  })

  it('falls back to HTTP when it cannot reopen', async () => {
    const harness = start()
    await reach(harness, 'download:started', 1000)
    harness.transport.server.wsAvailable = false
    harness.transport.server.closeEcho()
    const report = await finish(harness)
    expect(report).toMatchObject({ status: 'complete', notices: [{ code: 'websocket-unavailable' }] })
  })

  it('ends the run as a network change when GET /info does not answer after the close', async () => {
    const harness = start()
    await reach(harness, 'download:started', 1000)
    harness.transport.server.infoAvailable = false
    harness.transport.server.closeEcho()
    const report = await finish(harness)
    expect(report).toMatchObject({ status: 'error', error: 'network-changed' })
  })

  it('restarts idle latency on the new path when it closes during it', async () => {
    const harness = start()
    await harness.clock.advance(300)
    harness.transport.server.closeEcho()
    const report = await finish(harness)
    expect(report?.idle?.result.samples).toHaveLength(9)
    expect(report?.notices).toEqual([{ code: 'websocket-reopened' }])
  })

  it('closing during idle latency waits for GET /info by the running median, not the full 10 s', async () => {
    let closed = false
    const harness = start({}, LINK, (transport) => ({
      download: (size, signal) => transport.download(size, signal),
      upload: (size, onProgress, signal) => transport.upload(size, onProgress, signal),
      ws: () => transport.ws(),
      info: () => (closed ? new Promise(() => undefined) : transport.info()),
      probe: (path) => transport.probe(path),
    }))
    await harness.clock.advance(600)
    closed = true
    harness.transport.server.closeEcho()
    await finish(harness)
    // A 50 ms median gives max(2 s, 4 × 50 ms): GET /info is given up 2 s after the close.
    expect(errors(harness)).toEqual([expect.objectContaining({ code: 'network-changed', phase: 'idle' })])
    expect(harness.events.find(({ event }) => event.type === 'error')?.at).toBe(2600)
  })

  it('that never opens is given up after 10 s, and idle latency uses GET /api/v1/ping', async () => {
    const harness = start({ phases: ['idle'] }, LINK, (transport) => ({
      download: (size, signal) => transport.download(size, signal),
      upload: (size, onProgress, signal) => transport.upload(size, onProgress, signal),
      ws: () => new Promise(() => undefined),
      info: () => transport.info(),
      probe: (path) => transport.probe(path),
    }))
    const report = await finish(harness)
    expect(report?.idle?.result.path).toBe('http')
    expect(report?.notices).toEqual([{ code: 'websocket-unavailable' }])
    // GET /info answers after one RTT; the handshake is given up 10 s later.
    expect(when(harness, 'info:finished')).toBeGreaterThanOrEqual(10_050)
  })

  it('unavailable from the start leaves idle latency on GET /api/v1/ping', async () => {
    const harness = start({ phases: ['idle'] })
    harness.transport.server.wsAvailable = false
    const report = await finish(harness)
    expect(report?.idle?.result.path).toBe('http')
    expect(report?.notices).toEqual([{ code: 'websocket-unavailable' }])
    expect(phases(harness)).toEqual(['info:started', 'info:finished', 'download:skipped', 'upload:skipped', 'idle:started', 'idle:finished'])
  })
})

describe('an unreachable server', () => {
  it('at the info phase ends the run with the error and no result', async () => {
    const harness = start()
    harness.transport.server.infoAvailable = false
    expect(await finish(harness)).toBeNull()
    expect(errors(harness)).toEqual([{ type: 'error', code: 'server-unreachable', messageKey: 'errors.server-unreachable', phase: 'info', partial: false }])
    expect(phases(harness)).toEqual(['info:started', 'info:failed', 'idle:skipped', 'download:skipped', 'upload:skipped'])
  })

  it('when every idle ping is lost ends the run with the error', async () => {
    const harness = start({}, LINK, (transport) => ({
      download: (size, signal) => transport.download(size, signal),
      upload: (size, onProgress, signal) => transport.upload(size, onProgress, signal),
      ws: () => Promise.reject(new Error('refused')),
      info: () => transport.info(),
      probe: (path) => (path === '/api/v1/ping' ? Promise.reject(new TypeError('network error')) : transport.probe(path)),
    }))
    expect(await finish(harness)).toBeNull()
    expect(errors(harness)).toEqual([expect.objectContaining({ code: 'server-unreachable', phase: 'idle', partial: false })])
    expect(phases(harness)).toContain('idle:failed')
  })
})

describe('the data cap', () => {
  it('skips the throughput phases after the one that reached it', async () => {
    const harness = start({ dataCapBytes: 2_000_000 })
    const report = await finish(harness)
    expect(report?.download?.dataCapReached).toBe(true)
    expect(report).toMatchObject({ status: 'complete', skipped: ['upload'], upload: null })
    expect(report?.dataUsedBytes).toBeLessThanOrEqual(2_000_000)
    expect(phases(harness).at(-1)).toBe('upload:skipped')
  })
})

describe('samples', () => {
  it('carry the stream count the ramp has reached, which the finished phase event repeats, and the phase time', async () => {
    const harness = start()
    await finish(harness)
    for (const direction of ['download', 'upload'] as const) {
      const times = harness.events.flatMap(({ event }) => (event.type === 'sample' && event.direction === direction ? [event.phaseMs] : []))
      expect(times.every((time, index) => time >= (times[index - 1] ?? 0))).toBe(true)
      expect(times.at(-1)).toBeGreaterThan(0)
      const counts = harness.events.flatMap(({ event }) => (event.type === 'sample' && event.direction === direction ? [event.streams] : []))
      const finished = harness.events.find(({ event }) => event.type === 'phase' && event.phase === direction && event.state === 'finished')?.event
      expect(counts.every((count) => count >= 1)).toBe(true)
      expect(counts.at(-1)).toBe(finished?.type === 'phase' ? finished.streams : undefined)
    }
  })

  it('carry each direction’s new buckets, gauge and data used, at most every 100 ms', async () => {
    const harness = start()
    await finish(harness)
    const samples = harness.events.flatMap(({ at, event }) => (event.type === 'sample' ? [{ at, ...event }] : []))
    const download = samples.filter((sample) => sample.direction === 'download')
    const upload = samples.filter((sample) => sample.direction === 'upload')
    // Download buckets arrive once each, in order.
    expect(download.flatMap((sample) => sample.values).length).toBe(download.reduce((count, sample) => Math.max(count, sample.fromBucket + sample.values.length), 0))
    expect(download.some((sample) => sample.steady !== undefined)).toBe(true)
    expect(download.at(-1)?.dataUsedBytes).toBeGreaterThan(0)
    // Upload: confirmed cells, the window end, and the sending progress as the gauge.
    expect(upload.some((sample) => sample.windowEnd !== undefined && sample.values.length > 0)).toBe(true)
    expect(upload.some((sample) => (sample.sending ?? 0) > 0 && sample.gauge === sample.sending)).toBe(true)
    expect(upload.at(-1)?.dataUsedBytes).toBeGreaterThan(download.at(-1)?.dataUsedBytes ?? 0)
  })

  it('carry the chart\'s placing: the warm-up end, and for upload P_start and the sending instant on the grid', async () => {
    const harness = start()
    await finish(harness)
    const samples = harness.events.flatMap(({ event }) => (event.type === 'sample' ? [event] : []))
    for (const direction of ['download', 'upload'] as const) {
      const own = samples.filter((sample) => sample.direction === direction)
      const ended = own.findIndex((sample) => sample.warmupEndBucket !== undefined)
      expect(ended).toBeGreaterThan(0)
      // Absent while warming up, then the same bucket in every sample, inside the series.
      expect(own.slice(0, ended).every((sample) => sample.steady === undefined)).toBe(true)
      expect(new Set(own.slice(ended).map((sample) => sample.warmupEndBucket)).size).toBe(1)
      expect(own[ended]?.warmupEndBucket).toBeGreaterThanOrEqual(own.find((sample) => sample.values.length > 0)?.fromBucket ?? Infinity)
    }
    const download = samples.filter((sample) => sample.direction === 'download')
    expect(download.every((sample) => sample.startBucket === undefined && sample.sendingBucket === undefined)).toBe(true)
    const upload = samples.filter((sample) => sample.direction === 'upload')
    const placed = upload.filter((sample) => sample.sendingBucket !== undefined)
    // Nothing is placed before the first confirmation, which also brings the first cells.
    const first = upload.findIndex((sample) => sample.values.length > 0)
    expect(upload.slice(0, first).every((sample) => sample.sendingBucket === undefined && sample.startBucket === undefined)).toBe(true)
    expect(placed.length).toBeGreaterThan(0)
    for (const sample of placed) {
      expect(sample.startBucket).toBeLessThanOrEqual(sample.sendingBucket ?? -Infinity)
      // The instant runs ahead of the confirmed cells by about a request, never behind the start.
      expect(sample.sendingBucket).toBeGreaterThanOrEqual(upload[first]?.fromBucket ?? Infinity)
    }
    const instants = placed.map((sample) => sample.sendingBucket ?? 0)
    expect(instants).toEqual([...instants].sort((a, b) => a - b))
  })

  it('start the upload values at the first confirmed cell of a grid far from 0', async () => {
    // The server's grid origin is shifted by up to 2^32 cells (wire-protocol.md): cell indices
    // in the billions must not turn into billions of values.
    const harness = start({ phases: ['upload'] }, { ...LINK, gridOffsetMs: 2 ** 31 * 100 })
    await finish(harness)
    const upload = harness.events.flatMap(({ event }) => (event.type === 'sample' && event.direction === 'upload' ? [event] : []))
    const sent = upload.filter((sample) => sample.values.length > 0)
    expect(sent.length).toBeGreaterThan(0)
    expect(sent[0]?.fromBucket).toBeGreaterThanOrEqual(2 ** 31)
    expect(Math.max(...upload.map((sample) => sample.values.length))).toBeLessThan(200)
  })
})
