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

// A Continuous upload in a run on the fake transport (measurement.md sections 7.5 and 15): its
// confirmed cells in the retention, the HTTP/1.1 failure that ends it, and a footprint that stays
// flat however long the run lasts, with the loaded-latency and path B stores. Every result
// validates.

import { describe, expect, it } from 'vitest'

import type { EngineEvent, Result } from '@/engine/messages'
import { validateResult } from '@/engine/messages'
import { Run } from '@/engine/run'
import type { RunSettings } from '@/engine/settings'
import { FakeClock } from '@/engine/test/fakeClock'
import { FakeTransport, type Scenario } from '@/engine/test/fakeTransport'

/** 1 MB/s and 50 ms RTT on HTTP/2; the upload's load adds 30 ms. */
const LINK: Scenario = { rate: () => 1_000_000, rttMs: 50, protocol: 'h2', loadedDelayMs: () => 30 }

const CONTINUOUS: RunSettings = {
  preset: 'continuous',
  phases: ['idle', 'download', 'upload'],
  streams: { mode: 'auto', fixed: 3, max: 6 },
  download: { minMs: null, maxMs: null },
  upload: { minMs: null, maxMs: null },
  continuousDirection: 'upload',
  dataCapBytes: null,
  units: 'bits',
  warmup: 'auto',
  pingCount: 20,
  overheadCompensationPercent: 0,
}

interface Harness {
  clock: FakeClock
  run: Run
  events: { at: number; event: EngineEvent }[]
}

function start(settings: Partial<RunSettings> = {}, scenario: Scenario = LINK): Harness {
  const clock = new FakeClock()
  const transport = new FakeTransport(clock, scenario)
  const events: Harness['events'] = []
  const run = new Run({ clock, transport, settings: { ...CONTINUOUS, ...settings }, visible: true, emit: (event) => events.push({ at: clock.now(), event }) })
  void run.start()
  return { clock, run, events }
}

/** Advances until the run has ended and returns its one result, which validates, with both directions. */
async function finish(harness: Harness): Promise<Result & Required<Pick<Result, 'download' | 'upload'>>> {
  await harness.clock.advance(10_000)
  const results = harness.events.flatMap(({ event }) => (event.type === 'result' ? [event.result] : []))
  const [result] = results
  if (results.length !== 1 || result?.download === undefined || result.upload === undefined) {
    throw new Error('the run did not end with one result')
  }
  expect(validateResult(result)).toEqual([])
  return { ...result, download: result.download, upload: result.upload }
}

function phases(harness: Harness): string[] {
  return harness.events.flatMap(({ event }) => (event.type === 'phase' ? [`${event.phase}:${event.state}`] : []))
}

/** When the phase event `phase:state` was emitted, advancing until it is. */
async function reach(harness: Harness, phase: string): Promise<number> {
  while (!phases(harness).includes(phase)) {
    if (harness.clock.now() > 60_000) {
      throw new Error(`no ${phase} event`)
    }
    await harness.clock.advance(10)
  }
  return harness.events.find(({ event }) => event.type === 'phase' && `${event.phase}:${event.state}` === phase)?.at ?? Number.NaN
}

function samples(harness: Harness) {
  return harness.events.flatMap(({ event }) => (event.type === 'sample' ? [event] : []))
}

describe('a Continuous upload', () => {
  it('runs to its run length and is measured from its confirmed cells, with the live figures', async () => {
    const harness = start({ runLengthMs: 60_000 })
    await reach(harness, 'upload:started')
    await harness.clock.advance(65_000)
    const result = await finish(harness)
    expect(result.status).toBe('complete')
    expect(result.settings).toMatchObject({ preset: 'continuous', continuousDirection: 'upload', runLengthMs: 60_000 })
    expect(result.download.status).toBe('skipped')
    const upload = result.upload
    expect(upload.status).toBe('measured')
    expect(upload.bitsPerSecond).toBeGreaterThan(7.5e6)
    expect(upload.bitsPerSecond).toBeLessThanOrEqual(8e6)
    expect(upload.minBitsPerSecond).toBeLessThanOrEqual(upload.bitsPerSecond ?? 0)
    expect(upload.maxBitsPerSecond).toBeGreaterThanOrEqual(upload.bitsPerSecond ?? Infinity)
    expect(upload.windowMs).toBeGreaterThanOrEqual(40_000)
    expect(upload.confidence?.level).toBe('normal')
    expect(upload.confirmedRequests).toBeGreaterThan(20)
    // On the server timeline from P_start: the steady start, then the cells confirmed up to W_end_final.
    const series = upload.series
    expect(series?.warmupEndMs).toBeGreaterThan(0)
    expect(series?.knownMs?.every((known) => known === 100)).toBe(true)
    expect(phases(harness)).toEqual(['info:started', 'info:finished', 'download:skipped', 'idle:started', 'idle:finished', 'upload:started', 'upload:finished'])
    const live = samples(harness)
    expect(live.every((sample) => sample.steady === undefined && sample.continuous?.runLengthMs === 60_000)).toBe(true)
    expect(live.some((sample) => sample.continuous?.avgBitsPerSecond !== undefined)).toBe(true)
    expect(live.flatMap((sample) => sample.cells ?? []).length).toBeGreaterThan(30)
    // The confirmed cells go on from the retention: none missing, none repeated.
    live.forEach((sample, index) => {
      const previous = live[index - 1]
      if (previous !== undefined && previous.values.length > 0) {
        expect(sample.fromBucket).toBe(previous.fromBucket + previous.values.length)
      }
    })
    expect(upload.loadedLatency).toMatchObject({ source: 'websocket', medianMs: 80 })
  })

  it('ends at an HTTP/1.1 failure once measured, with upload-interrupted', async () => {
    const harness = start({}, { ...LINK, protocol: 'http/1.1', failure: (direction, index) => (direction === 'upload' && index === 40 ? { kind: 'status', status: 503 } : null) })
    await harness.clock.advance(120_000)
    const result = await finish(harness)
    expect(result.status).toBe('complete')
    expect(result.upload.status).toBe('measured')
    expect(result.upload.bitsPerSecond).toBeGreaterThan(0)
    expect(result.notices).toContainEqual({ code: 'upload-interrupted' })
    expect(result.upload.events).toContainEqual(expect.objectContaining({ code: 'error', notice: 'upload-interrupted' }))
  })

  it('stopped during warm-up is insufficient-data, under a partial result', async () => {
    const harness = start()
    await reach(harness, 'upload:started')
    await harness.clock.advance(1000)
    harness.run.stop()
    const result = await finish(harness)
    expect(result.status).toBe('partial')
    expect(result.upload.status).toBe('insufficient-data')
    expect(result.upload).not.toHaveProperty('bitsPerSecond')
    expect(result.upload).not.toHaveProperty('confidence')
    expect(result.notices).toContainEqual({ code: 'stopped-early', direction: 'upload', coveredMs: 0 })
  })

  it('is cpu-bound when the Worker is saturated through its window', async () => {
    const harness = start({ runLengthMs: 60_000 })
    harness.clock.busyFraction = 0.95
    await harness.clock.advance(80_000)
    const result = await finish(harness)
    expect(result.upload.status).toBe('measured')
    expect(result.upload.confidence?.level).toBe('cpu-bound')
  })
})

/**
 * The largest length of each structure over the next 10 s, a tick at a time: the confirmed cells
 * past the window end and the open second of loaded latency breathe with each request and each
 * second, so a structure that keeps one bound shows the same largest length however long the run.
 */
async function largest(harness: Harness): Promise<Record<string, number>> {
  const largest: Record<string, number> = {}
  for (let tick = 0; tick < 100; tick++) {
    await harness.clock.advance(100)
    for (const [key, length] of Object.entries(harness.run.footprint())) {
      largest[key] = Math.max(largest[key] ?? 0, length)
    }
  }
  return largest
}

describe('a long Continuous upload on HTTP/2', () => {
  it('keeps every structure within one bound from minute 5 to minute 15, the loaded and path B stores included', async () => {
    const harness = start()
    const uploadStart = await reach(harness, 'upload:started')
    await harness.clock.advance(uploadStart + 5 * 60_000 - harness.clock.now())
    const at5 = await largest(harness)
    await harness.clock.advance(uploadStart + 15 * 60_000 - harness.clock.now())
    const at15 = await largest(harness)
    expect(Object.keys(at15).sort()).toEqual(['busySamples', 'connectionNotices', 'loadedSamples', 'loadedSeconds', 'pathBSamples', 'retentionCells', 'retentionPending', 'uploadCells', 'uploadEntries', 'uploadGaps', 'uploadOffsets'])
    expect(at15).toEqual(at5)
    expect(at15['uploadOffsets']).toBe(100)
    expect(at15['pathBSamples']).toBe(64)
    expect(at15['loadedSamples']).toBe(0)
    harness.run.stop()
    const result = await finish(harness)
    expect(result.status).toBe('complete')
    expect(result.upload.status).toBe('measured')
    expect(result.upload.responsiveness).toMatchObject({ state: 'measured', protocol: 'h2' })
    expect(result.upload.confirmedRequests).toBeGreaterThan(400)
  }, 120_000)
})
