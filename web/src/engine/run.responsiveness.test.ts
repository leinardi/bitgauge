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

// HTTP loaded responsiveness, path B, in a run on the fake transport (measurement.md sections 12.3
// to 12.6): the info phase's capability check, the per-direction blocks in the result, and path B
// kept out of the bufferbloat grade. Every result validates.

import { describe, expect, it } from 'vitest'

import type { EngineEvent, Result } from '@/engine/messages'
import { validateResult } from '@/engine/messages'
import { Run } from '@/engine/run'
import type { RunSettings } from '@/engine/settings'
import { FakeClock } from '@/engine/test/fakeClock'
import { FakeTransport, type Scenario } from '@/engine/test/fakeTransport'
import type { ProbeTiming, Transport } from '@/engine/types'

const SMALL = '/api/v1/small'

/** 1 MB/s both ways and 50 ms RTT, on HTTP/2; the load adds 30 ms on download and 80 ms on upload. */
const LINK: Scenario = { rate: () => 1_000_000, rttMs: 50, protocol: 'h2', loadedDelayMs: (direction) => (direction === 'download' ? 30 : 80) }

/**
 * Three fixed streams, 8 s to 12 s per direction, 10 pings: long enough for 10 path B samples after
 * the upload's warm-up end, which the client learns from the server's confirmations.
 */
const SETTINGS: RunSettings = {
  preset: 'standard',
  phases: ['idle', 'download', 'upload'],
  streams: { mode: 'fixed', fixed: 3, max: 6 },
  download: { minMs: 8000, maxMs: 12_000 },
  upload: { minMs: 8000, maxMs: 12_000 },
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
  /** When each GET /api/v1/small was sent, in order. */
  small: number[]
}

/** A run whose probes go through `probe`, which by default passes them on. */
function start(settings: Partial<RunSettings> = {}, scenario: Scenario = LINK, probe?: (transport: FakeTransport, path: string, signal?: AbortSignal) => Promise<ProbeTiming>): Harness {
  const clock = new FakeClock()
  const transport = new FakeTransport(clock, scenario)
  const events: Harness['events'] = []
  const small: number[] = []
  const wrapped: Transport = {
    download: (size, signal) => transport.download(size, signal),
    upload: (size, onProgress, signal) => transport.upload(size, onProgress, signal),
    ws: () => transport.ws(),
    info: () => transport.info(),
    probe: (path, signal) => {
      if (path === SMALL) {
        small.push(clock.now())
      }
      return probe?.(transport, path, signal) ?? transport.probe(path, signal)
    },
  }
  const run = new Run({ clock, transport: wrapped, settings: { ...SETTINGS, ...settings }, visible: true, emit: (event) => events.push({ at: clock.now(), event }) })
  void run.start()
  return { clock, transport, run, events, small }
}

/** Advances until the run has ended and returns its one result, which validates. */
async function finish(harness: Harness): Promise<Result> {
  await harness.clock.advance(60_000)
  const results = harness.events.flatMap(({ event }) => (event.type === 'result' ? [event.result] : []))
  if (results.length !== 1 || results[0] === undefined) {
    throw new Error('the run did not end with one result')
  }
  expect(validateResult(results[0])).toEqual([])
  return results[0]
}

/** When the phase event `phase:state` was emitted. */
function when(harness: Harness, phase: string): number {
  const found = harness.events.find(({ event }) => event.type === 'phase' && `${event.phase}:${event.state}` === phase)
  if (found === undefined) {
    throw new Error(`no ${phase} event`)
  }
  return found.at
}

describe('path B on HTTP/2', () => {
  it('is measured on each direction, from the probes under load', async () => {
    const harness = start()
    const result = await finish(harness)
    // http_l is the RTT plus what the load adds, 80 ms on download and 130 ms on upload, and the
    // RTT alone for a probe sent while no transfer was on the link.
    expect(result.download?.responsiveness).toMatchObject({ state: 'measured', protocol: 'h2', trimmed: 0, totalMedianMs: 80 })
    expect(result.upload?.responsiveness).toMatchObject({ state: 'measured', protocol: 'h2', trimmed: 0, totalMedianMs: 130 })
    for (const [direction, loadedMs] of [[result.download, 80], [result.upload, 130]] as const) {
      const block = direction?.responsiveness
      if (block?.state !== 'measured') {
        throw new Error('not measured')
      }
      expect(block.samples).toBeGreaterThanOrEqual(10)
      expect(block.tm95Ms).toBeGreaterThan(50)
      expect(block.tm95Ms).toBeLessThanOrEqual(loadedMs)
      expect(block.rpm).toBe(Math.round(60_000 / block.tm95Ms))
    }
  })

  it('probes only while a direction runs: the info phase’s check, then from each warm-up end to its end instant', async () => {
    const harness = start()
    await finish(harness)
    const [check, ...underLoad] = harness.small
    expect(check).toBeLessThan(when(harness, 'idle:started'))
    const download = [when(harness, 'download:started'), when(harness, 'download:finished')]
    const upload = [when(harness, 'upload:started'), when(harness, 'upload:finished')]
    const inside = (at: number, [from, to]: number[]) => at > (from ?? 0) && at <= (to ?? 0)
    expect(underLoad.length).toBeGreaterThan(20)
    expect(underLoad.every((at) => inside(at, download) || inside(at, upload))).toBe(true)
  })

  it('is uncertain on a direction where a probe opened a new connection, or did not say', async () => {
    for (const opened of [true, null]) {
      // The check is index 0; the download's probes come before the upload's.
      const harness = start({}, { ...LINK, newConnection: (path, index) => (path === SMALL && index === 4 ? opened : false) })
      const result = await finish(harness)
      expect(result.download?.responsiveness).toMatchObject({ state: 'uncertain', protocol: 'h2', totalMedianMs: 80 })
      expect(result.upload?.responsiveness).toMatchObject({ state: 'measured' })
    }
  })

  it('is uncertain with fewer than 10 samples: a 5 s upload, its warm-up end learned from the server', async () => {
    const result = await finish(start({ upload: { minMs: 5000, maxMs: 10_000 } }))
    expect(result.upload?.status).toBe('measured')
    expect(result.upload?.confidence?.reasons).toEqual([])
    expect(result.upload?.responsiveness).toMatchObject({ state: 'uncertain', protocol: 'h2', totalMedianMs: 130 })
    expect(result.upload?.responsiveness?.samples).toBeLessThan(10)
    expect(result.upload?.responsiveness?.samples).toBeGreaterThanOrEqual(4)
  })

  it('is uncertain when a probe’s protocol differs from the check’s', async () => {
    const harness = start({}, { ...LINK, probeProtocol: (path, index) => (path === SMALL && index === 4 ? 'h3' : 'h2') })
    const result = await finish(harness)
    expect(result.download?.responsiveness).toMatchObject({ state: 'uncertain', protocol: 'h2' })
  })

  it('never feeds the bufferbloat grade', async () => {
    const plain = await finish(start())
    // Path B's probes take 400 ms longer to answer; path A's pings do not.
    const slowed = await finish(
      start({}, LINK, async (transport, path, signal) => {
        const probe = await transport.probe(path, signal)
        return path === SMALL && probe.timing !== null && probe.sentAt > 1000 ? { ...probe, timing: { ...probe.timing, responseStart: probe.timing.responseStart + 400 } } : probe
      }),
    )
    const tm95 = (result: Result) => (result.download?.responsiveness?.state === 'measured' ? result.download.responsiveness.tm95Ms : null)
    expect(tm95(slowed)).toBeCloseTo((tm95(plain) ?? 0) + 400, 2)
    expect(slowed.bufferbloat).toEqual(plain.bufferbloat)
    expect(slowed.download?.loadedLatency).toEqual(plain.download?.loadedLatency)
    expect(slowed.upload?.loadedLatency).toEqual(plain.upload?.loadedLatency)
  })
})

describe('the capability check', () => {
  it('on HTTP/1.1 gives unavailable_h1, and no probe runs under load', async () => {
    const harness = start({}, { ...LINK, protocol: 'http/1.1' })
    const result = await finish(harness)
    expect(result.download?.responsiveness).toEqual({ state: 'unavailable_h1', protocol: 'http/1.1', samples: 0 })
    expect(result.upload?.responsiveness).toEqual({ state: 'unavailable_h1', protocol: 'http/1.1', samples: 0 })
    expect(harness.small).toHaveLength(1)
  })

  it('with an empty protocol or no timing entry gives unavailable_h1 with an empty protocol', async () => {
    for (const reported of ['', null]) {
      const harness = start({}, { ...LINK, probeProtocol: (path, index) => (path === SMALL && index === 0 ? reported : 'h2') })
      const result = await finish(harness)
      expect(result.download?.responsiveness).toEqual({ state: 'unavailable_h1', protocol: '', samples: 0 })
      expect(result.upload?.responsiveness).toEqual({ state: 'unavailable_h1', protocol: '', samples: 0 })
      expect(harness.small).toHaveLength(1)
    }
  })

  it('that fails, or is answered other than 200, gives unavailable_h1 with an empty protocol', async () => {
    const failures: ((probe: ProbeTiming) => Promise<ProbeTiming>)[] = [() => Promise.reject(new TypeError('network error')), (probe) => Promise.resolve({ ...probe, status: 503 })]
    for (const fail of failures) {
      let first = true
      const harness = start({}, LINK, async (transport, path, signal) => {
        const probe = await transport.probe(path, signal)
        const failed = path === SMALL && first
        first &&= path !== SMALL
        return failed ? fail(probe) : probe
      })
      const result = await finish(harness)
      expect(result.download?.responsiveness).toEqual({ state: 'unavailable_h1', protocol: '', samples: 0 })
      expect(harness.small).toHaveLength(1)
    }
  })
})

describe('a direction that did not measure', () => {
  it('skipped has no responsiveness block', async () => {
    const result = await finish(start({ phases: ['idle', 'download'] }))
    expect(result.download?.responsiveness).toMatchObject({ state: 'measured' })
    expect(result.upload?.status).toBe('skipped')
    expect(result.upload).not.toHaveProperty('responsiveness')
  })

  it('stopped before its warm-up ended is unavailable_insufficient, with no probe under load', async () => {
    const harness = start()
    while (harness.events.every(({ event }) => !(event.type === 'phase' && event.phase === 'download' && event.state === 'started'))) {
      await harness.clock.advance(10)
    }
    await harness.clock.advance(300)
    harness.run.stop()
    const result = await finish(harness)
    expect(result.download?.status).not.toBe('measured')
    expect(result.download?.responsiveness).toEqual({ state: 'unavailable_insufficient', protocol: 'h2', samples: 0 })
    expect(result.upload).not.toHaveProperty('responsiveness')
    expect(harness.small).toHaveLength(1)
  })
})
