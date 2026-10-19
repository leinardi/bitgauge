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

// A Continuous download in a run on the fake transport (measurement.md section 15): its endings and
// their two outcomes, the live figures, the data-used notices, loaded latency and path B, and a
// footprint that stays flat however long the run lasts. Every result validates.

import { describe, expect, it } from 'vitest'

import type { EngineEvent, Result } from '@/engine/messages'
import { validateResult } from '@/engine/messages'
import { Run } from '@/engine/run'
import type { RunSettings } from '@/engine/settings'
import { FakeClock } from '@/engine/test/fakeClock'
import { FakeTransport, type Scenario } from '@/engine/test/fakeTransport'

/** 1 MB/s and 50 ms RTT on HTTP/2; the download's load adds 30 ms. */
const LINK: Scenario = { rate: () => 1_000_000, rttMs: 50, protocol: 'h2', loadedDelayMs: () => 30 }

const CONTINUOUS: RunSettings = {
  preset: 'continuous',
  phases: ['idle', 'download', 'upload'],
  streams: { mode: 'auto', fixed: 3, max: 6 },
  download: { minMs: null, maxMs: null },
  upload: { minMs: null, maxMs: null },
  continuousDirection: 'download',
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

/** Advances 100 ms at a time until the download's warm-up has ended; returns its bucket. */
async function warmedUp(harness: Harness): Promise<number> {
  for (;;) {
    const bucket = samples(harness).find((sample) => sample.warmupEndBucket !== undefined)?.warmupEndBucket
    if (bucket !== undefined) {
      return bucket
    }
    if (harness.clock.now() > 60_000) {
      throw new Error('warm-up never ended')
    }
    await harness.clock.advance(100)
  }
}

describe('a Continuous download', () => {
  it('runs to its run length and is measured, with the run-wide numbers and the saved series', async () => {
    const harness = start({ runLengthMs: 60_000 })
    const downloadStart = await reach(harness, 'download:started')
    await harness.clock.advance(60_000)
    const result = await finish(harness)
    expect(result.status).toBe('complete')
    expect(result.settings).toMatchObject({ preset: 'continuous', continuousDirection: 'download', runLengthMs: 60_000, download: { minMs: null, maxMs: null }, upload: { minMs: null, maxMs: null } })
    expect(result.upload.status).toBe('skipped')
    const download = result.download
    expect(download.status).toBe('measured')
    // The run length ends the download at its instant.
    expect((await reach(harness, 'download:finished')) - downloadStart).toBeCloseTo(60_000, -2)
    expect(download.bitsPerSecond).toBeGreaterThan(7.5e6)
    expect(download.bitsPerSecond).toBeLessThanOrEqual(8e6)
    expect(download.uncompensatedBitsPerSecond).toBe(download.bitsPerSecond)
    expect(download.minBitsPerSecond).toBeLessThanOrEqual(download.bitsPerSecond ?? 0)
    expect(download.maxBitsPerSecond).toBeGreaterThanOrEqual(download.bitsPerSecond ?? Infinity)
    expect(download.peakBitsPerSecond).toBeGreaterThanOrEqual(download.minBitsPerSecond ?? Infinity)
    expect(download.windowMs).toBeGreaterThanOrEqual(45_000)
    expect((download.windowMs ?? 1) % 1000).toBe(0)
    expect(download.confidence?.level).toBe('normal')
    const series = download.series
    expect(series?.bucketMs).toBe(100)
    expect(series?.knownMs?.every((known) => known === 100)).toBe(true)
    expect(series?.values).toHaveLength(series?.knownMs?.length ?? -1)
    // Every full bucket up to the run length's instant is kept.
    expect(series?.endMs).toBe(60_000)
    expect(download.events).toEqual([])
    expect(phases(harness)).toEqual(['info:started', 'info:finished', 'upload:skipped', 'idle:started', 'idle:finished', 'download:started', 'download:finished'])
  })

  it('sends the live figures, the four rates once three fully known 1 s cells exist, and no steady block', async () => {
    const harness = start({ runLengthMs: 60_000 })
    await reach(harness, 'download:started')
    const bucket = await warmedUp(harness)
    await harness.clock.advance(20_000)
    const live = samples(harness)
    expect(live.every((sample) => sample.steady === undefined)).toBe(true)
    expect(live.every((sample) => sample.continuous?.runLengthMs === 60_000 && sample.continuous.elapsedMs === sample.phaseMs)).toBe(true)
    const rated = live.filter((sample) => sample.continuous?.avgBitsPerSecond !== undefined)
    expect(rated.length).toBeGreaterThan(0)
    expect((rated[0]?.fromBucket ?? 0) - bucket).toBeGreaterThanOrEqual(29)
    const last = live.at(-1)?.continuous
    expect(last?.loadedLastMinuteMedianMs).toBe(80)
    expect(last?.dataBytes).toBe(live.at(-1)?.dataUsedBytes)
    // The hour-tier cells closed, one a second from the steady start.
    const cells = live.flatMap((sample) => sample.cells ?? [])
    expect(cells.length).toBeGreaterThanOrEqual(19)
    expect(cells.every((cell) => cell.tier === 'hour' && cell.knownMs === 1000)).toBe(true)
    // The buckets go on from the retention once warm-up has ended: none missing, none repeated.
    const fromBuckets = live.map((sample) => sample.fromBucket)
    live.forEach((sample, index) => index > 0 && expect(sample.fromBucket).toBe((fromBuckets[index - 1] ?? 0) + (live[index - 1]?.values.length ?? 0)))
    expect(live.every((sample) => sample.values.every((value) => value !== null))).toBe(true)
  })

  it('stopped during warm-up is insufficient-data, under a partial result', async () => {
    const harness = start()
    await reach(harness, 'download:started')
    await harness.clock.advance(1000)
    harness.run.stop()
    const result = await finish(harness)
    expect(result.status).toBe('partial')
    expect(result.download.status).toBe('insufficient-data')
    expect(result.download).not.toHaveProperty('bitsPerSecond')
    expect(result.download).not.toHaveProperty('confidence')
    expect(result.notices).toContainEqual({ code: 'stopped-early', direction: 'download', coveredMs: 0 })
  })

  it('stopped right after warm-up, before three fully known 1 s cells, has no headline and a partial result', async () => {
    const harness = start()
    await reach(harness, 'download:started')
    await warmedUp(harness)
    harness.run.stop()
    const result = await finish(harness)
    expect(result.status).toBe('partial')
    const download = result.download
    expect(download.status).toBe('insufficient-data')
    for (const field of ['bitsPerSecond', 'peakBitsPerSecond', 'minBitsPerSecond', 'maxBitsPerSecond', 'confidence']) {
      expect(download).not.toHaveProperty(field)
    }
    expect(result.notices).toContainEqual({ code: 'stopped-early', direction: 'download', coveredMs: 0 })
    expect(result.download.events).toContainEqual(expect.objectContaining({ code: 'cancelled' }))
  })

  it('stopped once measured is complete, with no stopped-early notice', async () => {
    const harness = start()
    await reach(harness, 'download:started')
    await warmedUp(harness)
    await harness.clock.advance(5000)
    harness.run.stop()
    const result = await finish(harness)
    expect(result.status).toBe('complete')
    expect(result.download.status).toBe('measured')
    expect(result.notices.map((notice) => notice.code)).not.toContain('stopped-early')
  })

  it('ends at the data cap, measured, with the notice', async () => {
    const harness = start({ dataCapBytes: 30_000_000 })
    await harness.clock.advance(60_000)
    const result = await finish(harness)
    expect(result.status).toBe('complete')
    expect(result.download.status).toBe('measured')
    expect(result.dataUsedBytes).toBeLessThanOrEqual(30_000_000)
    expect(result.notices).toContainEqual({ code: 'data-cap-reached', direction: 'download' })
    expect(result.download.events).toContainEqual(expect.objectContaining({ code: 'data-cap' }))
  })

  it('ends when the browser pauses a hidden page, measured by then, with nothing of the pause kept', async () => {
    // A 37 ms RTT puts the download's ticks off the housekeeping tick's 100 ms grid, so that after
    // the pause the download's late tick comes first.
    const harness = start({}, { ...LINK, rttMs: 37 })
    const downloadStart = await reach(harness, 'download:started')
    expect(downloadStart % 100).not.toBe(0)
    // Just after a housekeeping tick, its last on-time one.
    const lastTick = Math.ceil((downloadStart + 20_000) / 100) * 100
    await harness.clock.advance(lastTick + 1 - harness.clock.now())
    harness.run.visibility(false)
    harness.clock.pause(1500)
    const result = await finish(harness)
    expect(result.status).toBe('complete')
    expect(result.download.status).toBe('measured')
    expect(result.notices).toEqual([{ code: 'page-hidden' }])
    // The download ends at the last on-time tick, and no bucket of the pause reached the retention.
    expect(result.download.series?.endMs).toBeLessThanOrEqual(lastTick - downloadStart)
  })

  it('runs download when the phases list no direction, as with test=latency', async () => {
    const harness = start({ phases: ['idle'], runLengthMs: 60_000 })
    await harness.clock.advance(70_000)
    const result = await finish(harness)
    expect(result.settings.phases).toEqual(['idle'])
    expect(result.download.status).toBe('measured')
    expect(result.upload.status).toBe('skipped')
  })

  it('raises the data-used notice at 1 GB on a fast link, live and in the result', async () => {
    const harness = start({}, { rate: () => 250_000_000, rttMs: 2, protocol: 'h2' })
    await reach(harness, 'download:started')
    await harness.clock.advance(8000)
    harness.run.stop()
    const result = await finish(harness)
    expect(result.dataUsedBytes).toBeGreaterThan(1e9)
    expect(result.dataUsedBytes).toBeLessThan(1e10)
    expect(result.notices).toContainEqual({ code: 'data-used', bytes: 1e9 })
    const live = samples(harness).flatMap((sample) => sample.notices ?? [])
    expect(live).toEqual([{ code: 'data-used', bytes: 1e9 }])
  })

  it('reports loaded latency from the per-second medians, with its grade and scores', async () => {
    const harness = start({ runLengthMs: 120_000 })
    await harness.clock.advance(140_000)
    const result = await finish(harness)
    const loaded = result.download.loadedLatency
    if (loaded === undefined || 'status' in loaded) {
      throw new Error('loaded latency is not measured')
    }
    expect(loaded).toMatchObject({ source: 'websocket', medianMs: 80, p90Ms: 80, increaseMs: 30, lost: 0 })
    // One point a second: the per-second medians, not the samples.
    expect(loaded.samples).toBeGreaterThan(300)
    expect(loaded.series.length).toBeLessThan(loaded.samples)
    expect(loaded.series.length).toBeGreaterThan(90)
    expect(loaded.series.every((point) => point.atMs % 1000 === 0)).toBe(true)
    expect(result.bufferbloat).toEqual({ grade: 'B', basis: 'download', increaseMs: 30 })
    expect(result.scores).toBeDefined()
  })
})

describe('a long Continuous download on HTTP/2', () => {
  it('is cpu-bound over its whole span from the steady start, past the busy track’s 10-minute ring', async () => {
    const harness = start({ runLengthMs: 12 * 60_000 })
    harness.clock.busyFraction = 0.95
    await harness.clock.advance(13 * 60_000)
    const result = await finish(harness)
    expect(result.download.status).toBe('measured')
    expect(result.download.confidence?.level).toBe('cpu-bound')
    expect(result.download.windowMs).toBeGreaterThan(11 * 60_000)
  }, 60_000)


  it('keeps every structure at one length from minute 5 to minute 15, and measures path B at its end', async () => {
    const harness = start()
    const downloadStart = await reach(harness, 'download:started')
    await harness.clock.advance(downloadStart + 5 * 60_000 - harness.clock.now())
    const at5 = harness.run.footprint()
    await harness.clock.advance(10 * 60_000)
    const at15 = harness.run.footprint()
    expect(Object.keys(at15).sort()).toEqual(['busySamples', 'connectionNotices', 'downloadBytes', 'downloadRequests', 'downloadSeries', 'loadedSamples', 'loadedSeconds', 'pathBSamples', 'retentionCells', 'retentionPending'])
    expect(at15).toEqual(at5)
    expect(at15['pathBSamples']).toBe(64)
    expect(at15['loadedSamples']).toBe(0)
    harness.run.stop()
    const result = await finish(harness)
    expect(result.status).toBe('complete')
    const responsiveness = result.download.responsiveness
    if (responsiveness?.state !== 'measured') {
      throw new Error('path B is not measured')
    }
    expect(responsiveness.protocol).toBe('h2')
    expect(responsiveness.samples).toBeGreaterThan(2000)
    expect(responsiveness.tm95Ms).toBeGreaterThan(50)
    expect(responsiveness.tm95Ms).toBeLessThanOrEqual(80)
    expect(result.download.loadedLatency).toMatchObject({ source: 'websocket', medianMs: 80 })
  }, 120_000)
})
