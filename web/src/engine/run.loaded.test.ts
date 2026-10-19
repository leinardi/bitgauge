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

// Loaded latency in a run on the fake transport (measurement.md sections 11.1 to 11.6,
// edge-cases.md section 6): the WebSocket, the HTTP fallback with and without the HTTP/1.1
// reservation, the close sequence, runs without an idle median, and the upload's server timeline.

import { describe, expect, it } from 'vitest'

import type { Direction, EngineEvent, LoadedPing, Result } from '@/engine/messages'
import { validateResult } from '@/engine/messages'
import { Run } from '@/engine/run'
import type { RunReport } from '@/engine/run/report'
import type { RunSettings } from '@/engine/settings'
import { FakeClock } from '@/engine/test/fakeClock'
import { FakeTransport, type Scenario } from '@/engine/test/fakeTransport'
import type { Transport, WsEcho } from '@/engine/types'

/** 1 MB/s both ways and 50 ms RTT, on HTTP/2; the load adds 30 ms on download and 80 ms on upload. */
const LINK: Scenario = { rate: () => 1_000_000, rttMs: 50, protocol: 'h2', loadedDelayMs: (direction) => (direction === 'download' ? 30 : 80) }

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
  events: { at: number; event: EngineEvent }[]
  report: () => RunReport | null | undefined
}

function start(settings: Partial<RunSettings> = {}, scenario: Scenario = LINK, wrap?: (transport: FakeTransport) => Transport): Harness {
  const clock = new FakeClock()
  const transport = new FakeTransport(clock, scenario)
  const events: Harness['events'] = []
  const run = new Run({ clock, transport: wrap?.(transport) ?? transport, settings: { ...QUICK, ...settings }, visible: true, emit: (event) => events.push({ at: clock.now(), event }) })
  let report: RunReport | null | undefined
  void run.start().then((value) => (report = value))
  return { clock, transport, run, events, report: () => report }
}

/** Advances until the run has ended and returns its report and its one result, which validates. */
async function finish(harness: Harness): Promise<{ report: RunReport; result: Result }> {
  await harness.clock.advance(60_000)
  const report = harness.report()
  const results = harness.events.flatMap(({ event }) => (event.type === 'result' ? [event.result] : []))
  if (report === undefined || report === null || results.length !== 1 || results[0] === undefined) {
    throw new Error('the run did not end with one result')
  }
  expect(validateResult(results[0])).toEqual([])
  return { report, result: results[0] }
}

/** Advances until the phase event `phase:state`, then by `extraMs`. */
async function reach(harness: Harness, phase: string, extraMs = 0): Promise<void> {
  const at = (): number | undefined => harness.events.find(({ event }) => event.type === 'phase' && `${event.phase}:${event.state}` === phase)?.at
  while (at() === undefined) {
    if (harness.clock.now() > 60_000) {
      throw new Error(`no ${phase} event`)
    }
    await harness.clock.advance(10)
  }
  await harness.clock.advance(Math.max(0, (at() ?? 0) + extraMs - harness.clock.now()))
}

/** The loaded-latency pings the live sample events carried for `direction`. */
function livePings(harness: Harness, direction: Direction): LoadedPing[] {
  return harness.events.flatMap(({ event }) => (event.type === 'sample' && event.direction === direction ? (event.loadedLatency ?? []) : []))
}

/** The transport with `ws` replaced. */
function withWs(ws: (transport: FakeTransport) => Promise<WsEcho>) {
  return (transport: FakeTransport): Transport => ({
    download: (size, signal) => transport.download(size, signal),
    upload: (size, onProgress, signal) => transport.upload(size, onProgress, signal),
    ws: () => ws(transport),
    info: () => transport.info(),
    probe: (path, signal) => transport.probe(path, signal),
  })
}

describe('loaded latency over the WebSocket', () => {
  it('grades a LAN on HTTP/2 as the demo fixture reads it: B, from the upload’s +39 ms', async () => {
    // The demo's LAN (ui_kits/app/TestScreen.jsx): 3 ms idle, 18 ms loaded on download, 42 ms on upload.
    const lan: Scenario = { rate: () => 20_000_000, rttMs: 3, protocol: 'h2', loadedDelayMs: (direction) => (direction === 'download' ? 15 : 39) }
    const harness = start({}, lan)
    const { result } = await finish(harness)
    expect(result.idle?.medianMs).toBe(3)
    expect(result.download?.loadedLatency).toMatchObject({ source: 'websocket', medianMs: 18, increaseMs: 15 })
    expect(result.upload?.loadedLatency).toMatchObject({ source: 'websocket', medianMs: 42, increaseMs: 39 })
    expect(result.download?.loadedLatency).not.toHaveProperty('idleSource')
    expect(result.bufferbloat).toEqual({ grade: 'B', basis: 'download+upload', increaseMs: 39 })
    // The fixture's quality scores: 20 + 30 + 5, 20 + 5 and 20 + 10 + 5, all good.
    expect(result.scores).toEqual({
      basis: 'download+upload',
      packetLoss: 'not-measured',
      streaming: { points: 55, band: 'good' },
      gaming: { points: 25, band: 'good' },
      rtc: { points: 35, band: 'good' },
    })
    expect(result.notices.map((notice) => notice.code)).not.toContain('probe-reservation')
    // The live samples carry the pings as they are answered.
    expect(livePings(harness, 'download').length).toBeGreaterThanOrEqual(10)
    expect(livePings(harness, 'upload').length).toBeGreaterThanOrEqual(10)
  })

  it('carries a gap and the reopened notice across a close and reopen mid-download, still measured', async () => {
    // The reopen takes 700 ms, so the close sequence covers at least two ticks.
    let opened = 0
    const harness = start(
      {},
      LINK,
      withWs((transport) => (opened++ === 0 ? transport.ws() : new Promise((resolve) => harness.clock.setTimer(700, () => resolve(transport.ws()))))),
    )
    await reach(harness, 'download:started', 3000)
    harness.transport.server.closeEcho()
    const { result } = await finish(harness)
    expect(result.notices).toContainEqual({ code: 'websocket-reopened' })
    const loaded = result.download?.loadedLatency
    expect(loaded).toMatchObject({ source: 'websocket', medianMs: 80, increaseMs: 30 })
    expect(loaded !== undefined && !('status' in loaded) ? loaded.skippedTicks : 0).toBeGreaterThanOrEqual(2)
    const times = loaded !== undefined && !('status' in loaded) ? loaded.series.map((ping) => ping.atMs) : []
    const gaps = times.slice(1).map((at, index) => at - (times[index] ?? at))
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(900)
  })
})

describe('the HTTP fallback', () => {
  it('on HTTP/1.1 reserves a connection: 5 streams, at least 10 samples, and the notice once', async () => {
    const h1: Scenario = { ...LINK, protocol: 'http/1.1' }
    const harness = start({ streams: { mode: 'fixed', fixed: 6, max: 6 } }, h1)
    harness.transport.server.wsAvailable = false
    const { report, result } = await finish(harness)
    for (const direction of [result.download, result.upload]) {
      expect(direction?.streams).toBe(5)
      expect(direction?.loadedLatency).toMatchObject({ source: 'http-h1-reserved', medianMs: 50 + (direction === result.download ? 30 : 80) })
      const loaded = direction?.loadedLatency
      expect(loaded !== undefined && !('status' in loaded) ? loaded.samples : 0).toBeGreaterThanOrEqual(10)
      expect(loaded).not.toHaveProperty('idleSource')
    }
    expect(harness.transport.peakInFlight).toEqual({ download: 5, upload: 5 })
    expect(result.notices.filter((notice) => notice.code === 'probe-reservation')).toEqual([{ code: 'probe-reservation', streams: 5 }])
    expect(report.idle?.result.path).toBe('http')
    expect(result.bufferbloat).toEqual({ grade: 'C', basis: 'download+upload', increaseMs: 80 })
  })

  it('on HTTP/2 multiplexes without a reservation', async () => {
    const harness = start({ streams: { mode: 'fixed', fixed: 6, max: 6 } })
    harness.transport.server.wsAvailable = false
    const { result } = await finish(harness)
    expect(result.download).toMatchObject({ streams: 6, loadedLatency: { source: 'http-h2', medianMs: 80 } })
    expect(result.upload).toMatchObject({ streams: 6, loadedLatency: { source: 'http-h2', medianMs: 130 } })
    expect(result.notices).toContainEqual({ code: 'websocket-unavailable' })
    expect(result.notices.map((notice) => notice.code)).not.toContain('probe-reservation')
  })

  it('after a close that cannot reopen on HTTP/1.1: the running download is broken, the upload runs reserved', async () => {
    const h1: Scenario = { ...LINK, protocol: 'http/1.1' }
    const harness = start({ streams: { mode: 'fixed', fixed: 6, max: 6 } }, h1)
    await reach(harness, 'download:started', 3000)
    harness.transport.server.wsAvailable = false
    harness.transport.server.closeEcho()
    const { result } = await finish(harness)
    // The download keeps its six streams; its pings came over the WebSocket, then the queued probe.
    expect(result.download).toMatchObject({ streams: 6, loadedLatency: { status: 'unavailable', reason: 'reservation-broken', source: 'http-h1-reserved' } })
    expect(result.upload).toMatchObject({ streams: 5, loadedLatency: { source: 'http-h1-reserved', idleSource: 'websocket', medianMs: 130, increaseMs: 80 } })
    expect(result.bufferbloat).toEqual({ grade: 'C', basis: 'upload', increaseMs: 80 })
    expect(result.notices).toEqual([{ code: 'websocket-unavailable' }, { code: 'probe-reservation', streams: 5 }])
  })
})

describe('without an idle median', () => {
  const unscored = (result: Result): void => {
    for (const direction of [result.download, result.upload]) {
      expect(direction?.loadedLatency).toMatchObject({ source: 'websocket', medianMs: direction === result.download ? 80 : 130 })
      expect(direction?.loadedLatency).not.toHaveProperty('increaseMs')
      expect(direction?.loadedLatency).not.toHaveProperty('idleSource')
    }
    expect(result).not.toHaveProperty('bufferbloat')
  }

  it('a run whose settings leave idle latency out measures loaded latency, with no increase and no grade', async () => {
    // The URL's test=download keeps idle latency (url-params.md; useUrlParams.test.ts); settings
    // can leave it out.
    const harness = start({ phases: ['download', 'upload'] })
    const { result } = await finish(harness)
    expect(result).not.toHaveProperty('idle')
    unscored(result)
  })

  it('a run whose idle latency is unavailable does the same', async () => {
    // Idle latency's pings 4 to 9 go unanswered: a warm-up and 3 samples, fewer than 5.
    let sent = 0
    const harness = start(
      {},
      LINK,
      withWs(async (transport) => {
        const echo = await transport.ws()
        return { ...echo, ping: (seq, sentAt) => (sent++ >= 4 && sent <= 10 ? undefined : echo.ping(seq, sentAt)) }
      }),
    )
    const { result } = await finish(harness)
    expect(result.idle).toMatchObject({ path: 'websocket' })
    expect(result.idle).not.toHaveProperty('medianMs')
    unscored(result)
  })
})

describe('the series time base', () => {
  it('stores download pings from the client phase start and upload pings on the server timeline', async () => {
    const offset: Scenario = { ...LINK, gridOffsetMs: 5000 }
    const harness = start({}, offset)
    const { report, result } = await finish(harness)
    const download = result.download?.loadedLatency
    const upload = result.upload?.loadedLatency
    if (download === undefined || 'status' in download || upload === undefined || 'status' in upload) {
      throw new Error('both directions should be measured')
    }
    const live = (direction: Direction) => new Set(livePings(harness, direction).map((ping) => ping.atMs))
    expect(download.series.every((ping) => live('download').has(ping.atMs))).toBe(true)
    // Upload: the send instant on the client clock, moved by the display offset onto the server
    // timeline from P_start, exactly as upload events are placed.
    const shift = (report.loaded.upload?.startAt ?? 0) - (report.upload?.displayOffsetMs ?? 0) - (report.upload?.phaseStartMs ?? 0)
    expect(upload.series.every((ping) => live('upload').has(ping.atMs - shift))).toBe(true)
    // The server runs 5 s ahead, so the shift is about one RTT back, not 5 s either way.
    expect(Math.abs(shift + LINK.rttMs)).toBeLessThanOrEqual(100)
  })
})

describe('the last direction’s grace', () => {
  it.each(['a stop', 'a network change', 'a closed echo whose server does not answer'])('ignores %s, and the run stays complete', async (what) => {
    // A 1 s loaded delay on upload leaves pings outstanding when it ends.
    const harness = start({}, { ...LINK, loadedDelayMs: (direction) => (direction === 'download' ? 30 : 1000) })
    await reach(harness, 'upload:finished')
    const finishedAt = harness.clock.now()
    if (what === 'a stop') {
      harness.run.stop()
    } else if (what === 'a network change') {
      harness.run.network()
    } else {
      harness.transport.server.infoAvailable = false
      harness.transport.server.closeEcho()
    }
    const { report, result } = await finish(harness)
    expect(harness.events.find(({ event }) => event.type === 'result')?.at).toBeGreaterThan(finishedAt)
    expect(report).toMatchObject({ status: 'complete', error: null })
    expect(result.status).toBe('complete')
    expect(harness.events.filter(({ event }) => event.type === 'error')).toEqual([])
    expect(result.upload?.loadedLatency).toMatchObject({ source: 'websocket', medianMs: 1050 })
  })
})

describe('a latency-only run', () => {
  it('has no loaded latency, no grade and no scored experience', async () => {
    const harness = start({ phases: ['idle'] })
    const { report, result } = await finish(harness)
    expect(report.loaded).toEqual({ download: null, upload: null })
    expect(result.download).not.toHaveProperty('loadedLatency')
    expect(result.upload).not.toHaveProperty('loadedLatency')
    expect(result).not.toHaveProperty('bufferbloat')
    expect(livePings(harness, 'download')).toEqual([])
    // The scores are present, every experience naming what it misses (measurement.md section 13.5).
    expect(result.scores).toEqual({
      basis: 'none',
      packetLoss: 'not-measured',
      streaming: { missing: ['loaded-latency', 'download'] },
      gaming: { missing: ['loaded-latency'] },
      rtc: { missing: ['loaded-latency'] },
    })
  })
})
