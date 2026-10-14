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

// The result object of full synthetic runs (measurement.md sections 9.3, 16 and 17, edge-cases.md
// sections 9 and 10): the v0.1 field set, the shapes of partial and error runs, the series, the
// cpu-bound confidence and overhead compensation. Every emitted result validates.

import { describe, expect, it } from 'vitest'

import { type Result, validateResult } from '@/engine/messages'
import { downsample } from '@/engine/result/direction'
import { Run } from '@/engine/run'
import type { RunSettings } from '@/engine/settings'
import { FakeClock } from '@/engine/test/fakeClock'
import { FakeTransport, type Scenario } from '@/engine/test/fakeTransport'

/** 2.5 Gbit/s on a LAN, at most 0.5 Gbit/s per request (measurement.md section 19.4). */
const LAN: Scenario = { rate: () => 312_500_000, perRequest: 62_500_000, rttMs: 0.3, protocol: 'h2' }
/** 300 kbit/s and 300 ms RTT over a VPN (measurement.md section 19.1). */
const VPN: Scenario = { rate: () => 37_500, rttMs: 300, protocol: 'h2' }
const LINK: Scenario = { rate: () => 1_000_000, rttMs: 50, protocol: 'h2' }
/** A 1 Gbit/s link from a phone that prepares each body at 600 Mbit/s before sending it (section 7.2). */
const PHONE: Scenario = { rate: () => 125_000_000, prepareBytesPerSecond: 75_000_000, rttMs: 8, protocol: 'http/1.1' }
const CHROME = { name: 'Chrome', major: 131, os: 'Android' }

const STANDARD: RunSettings = {
  preset: 'standard',
  phases: ['idle', 'download', 'upload'],
  streams: { mode: 'auto', fixed: 1, max: 6 },
  download: { minMs: 10_000, maxMs: 20_000 },
  upload: { minMs: 15_000, maxMs: 25_000 },
  dataCapBytes: null,
  units: 'bits',
  warmup: 'auto',
  pingCount: 20,
  overheadCompensationPercent: 0,
}

/** The fields of later versions (measurement.md section 17), absent from a v0.1 result. */
const LATER = ['note', 'bufferbloat', 'scores', 'loadedLatency', 'responsiveness', 'minBitsPerSecond', 'maxBitsPerSecond', 'knownMs']

interface Options {
  settings?: Partial<RunSettings>
  scenario?: Scenario
  busy?: number
  resolutionMs?: number
  /** Acts on the run once, `atMs` into it. */
  at?: { atMs: number; act: (run: Run) => void }
}

/** Runs to the end and returns the one result the run emitted. */
async function result(options: Options = {}): Promise<Result> {
  const clock = new FakeClock()
  clock.busyFraction = options.busy ?? 0.2
  clock.resolutionMs = options.resolutionMs ?? clock.resolutionMs
  const transport = new FakeTransport(clock, options.scenario ?? LINK)
  const results: Result[] = []
  const run = new Run({
    clock,
    transport,
    settings: { ...STANDARD, label: 'office', ...options.settings },
    visible: true,
    emit: (event) => (event.type === 'result' ? results.push(event.result) : undefined),
  })
  void run.start()
  if (options.at !== undefined) {
    await clock.advance(options.at.atMs)
    options.at.act(run)
  }
  await clock.advance(120_000)
  expect(results).toHaveLength(1)
  const [emitted] = results
  if (emitted === undefined) {
    throw new Error('no result')
  }
  expect(validateResult(emitted)).toEqual([])
  return emitted
}

/** Every key of a value, at any depth. */
function keys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(keys)
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...keys(inner)])
  }
  return []
}

describe('a fast LAN Standard run', () => {
  it('is complete, with every v0.1 field present and typed and no field of a later version', async () => {
    const emitted = await result({ scenario: LAN })
    expect(emitted).toMatchObject({
      schema: 'bitgauge.result',
      schemaVersion: 1,
      status: 'complete',
      label: 'office',
      server: { name: 'test', version: '0.1.0', epoch: 'epoch-1' },
      client: {
        ip: '10.0.0.2',
        contextLabel: 'LAN',
        protocol: 'h2',
        browser: { name: 'Firefox', major: 131, os: 'Linux' },
        timerResolutionMs: 0.005,
        crossOriginIsolated: true,
      },
      settings: { preset: 'standard', phases: ['idle', 'download', 'upload'], streams: { mode: 'auto', max: 6 }, pingCount: 20 },
      // The fake wiring reports Firefox, whose upload path may bound a 2.5 Gbit/s headline.
      notices: [{ code: 'browser-upload-limit', browser: 'Firefox' }],
    })
    expect(emitted.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
    expect(emitted.idle?.samples).toHaveLength(19)
    for (const direction of [emitted.download, emitted.upload]) {
      expect(direction).toMatchObject({ status: 'measured', confidence: { level: 'normal', reasons: [] }, series: { bucketMs: 100 } })
      expect(direction?.bitsPerSecond).toBe(direction?.uncompensatedBitsPerSecond)
      expect(Math.abs((direction?.bitsPerSecond ?? 0) / 2.5e9 - 1)).toBeLessThan(0.05)
      expect(direction?.peakBitsPerSecond).toBeGreaterThanOrEqual((direction?.bitsPerSecond ?? 0) * 0.9)
      expect(direction?.windowMs).toBeGreaterThanOrEqual(3000)
    }
    expect(emitted.upload?.confirmedRequests).toBeGreaterThanOrEqual(3)
    expect(emitted.dataUsedBytes).toBe((emitted.download?.bytes ?? 0) + (emitted.upload?.bytes ?? 0))
    expect(keys(emitted).filter((key) => LATER.includes(key))).toEqual([])
  })

  it('reports the latencies no finer than the timer resolution', async () => {
    const emitted = await result({ resolutionMs: 0.3, settings: { phases: ['idle'] } })
    // A 50 ms RTT on a 0.3 ms clock is reported as the nearest step, 50.1 ms.
    expect(emitted.client.timerResolutionMs).toBe(0.3)
    expect(emitted.idle?.medianMs).toBe(50.1)
    expect(emitted.idle?.samples.every((rtt) => rtt === 50.1)).toBe(true)
  })

  it('leaves the latencies as measured when no resolution was detected', async () => {
    const emitted = await result({ resolutionMs: 0, scenario: { ...LINK, rttMs: 50.25 }, settings: { phases: ['idle'] } })
    expect(emitted.idle?.medianMs).toBe(50.25)
  })
})

describe('a slow VPN Standard run', () => {
  it('is extended, with low confidence and its reasons', async () => {
    const emitted = await result({ scenario: VPN })
    expect(emitted.upload?.events).toContainEqual(expect.objectContaining({ code: 'extended' }))
    expect(emitted.upload?.confidence).toEqual({ level: 'low', reasons: ['insufficient-samples'] })
    expect(emitted.notices).toContainEqual({ code: 'slow-link-extended', direction: 'upload' })
    expect(emitted.notices).toContainEqual({ code: 'low-confidence', direction: 'upload', reasons: ['insufficient-samples'] })
  })
})

describe('the result of an interrupted run', () => {
  it('stopped during download is partial, the upload skipped', async () => {
    // The stop falls between two of the download's bucket ticks.
    const emitted = await result({ settings: { download: { minMs: 15_000, maxMs: 20_000 } }, at: { atMs: 12_037.5, act: (run) => run.stop() } })
    expect(emitted.status).toBe('partial')
    // The window, its series and the covered time are the same full buckets.
    const { series, windowMs } = emitted.download ?? {}
    expect((series?.endMs ?? 0) - (series?.firstCellMs ?? 0)).toBe(windowMs)
    expect(series?.values).toHaveLength((windowMs ?? 0) / 100)
    expect(emitted.notices).toContainEqual({ code: 'stopped-early', direction: 'download', coveredMs: windowMs })
    expect(emitted.download).toMatchObject({ status: 'partial', series: expect.any(Object) })
    expect(emitted.download?.bitsPerSecond).toBeGreaterThan(0)
    expect(emitted.download?.events).toContainEqual(expect.objectContaining({ code: 'cancelled' }))
    expect(emitted.upload).toEqual({ status: 'skipped', streams: 0, bytes: 0, events: [], confirmedRequests: 0 })
    expect(emitted.notices).toContainEqual(expect.objectContaining({ code: 'stopped-early', direction: 'download' }))
  })

  it('ended by a network change is an error, the current direction without a number', async () => {
    const emitted = await result({ at: { atMs: 20_000, act: (run) => run.network() } })
    expect(emitted.status).toBe('error')
    expect(emitted.download?.status).toBe('measured')
    expect(emitted.upload).toMatchObject({ status: 'error', events: [expect.objectContaining({ code: 'error', notice: 'network-changed' })] })
    expect(emitted.upload).not.toHaveProperty('bitsPerSecond')
    expect(emitted.upload).not.toHaveProperty('series')
  })
})

describe('the series', () => {
  it('has unknown cells inside an upload failure gap', async () => {
    const scenario: Scenario = { ...LINK, failure: (direction, index) => (direction === 'upload' && index === 25 ? { kind: 'error' } : null) }
    const emitted = await result({ scenario, settings: { phases: ['upload'] } })
    // The 26th request fails 14.1 s into the phase, inside the steady window that starts at 5.9 s.
    expect(emitted.upload?.events).toEqual([{ code: 'failure-gap', startMs: 14_143, endMs: 14_243 }])
    const series = emitted.upload?.series
    expect(series?.firstCellMs).toBeLessThan(14_143)
    expect(series?.values).toContain(null)
    expect(emitted.upload?.status).toBe('measured')
  })

  it('is downsampled to at most 2000 points, a point with an unknown bucket unknown', () => {
    const values = Array.from({ length: 4500 }, (_, index) => (index === 7 ? null : 10))
    const series = downsample(values, { firstCellMs: 0, warmupEndMs: 0, endMs: 450_000 })
    // Three buckets per point, the last holding the remaining 1500th: 4500 / 3 = 1500 points.
    expect(series.bucketMs).toBe(300)
    expect(series.values).toHaveLength(1500)
    expect(series.values.slice(0, 4)).toEqual([30, 30, null, 30])
    expect(downsample(Array.from({ length: 2001 }, () => 1), { firstCellMs: 0, warmupEndMs: 0, endMs: 200_100 }).values).toHaveLength(1001)
    expect(downsample([1, 2], { firstCellMs: 0, warmupEndMs: 0, endMs: 200 })).toEqual({ bucketMs: 100, firstCellMs: 0, warmupEndMs: 0, endMs: 200, values: [1, 2] })
  })
})

describe('confidence', () => {
  /** 1 MB/s that swings between 0.6 and 1.4 MB/s every 100 ms for the first seconds of the run. */
  const choppy = (untilMs: number): Scenario => ({ ...LINK, rate: (_direction, atMs) => (atMs < untilMs ? (Math.floor(atMs / 100) % 2 === 0 ? 600_000 : 1_400_000) : 1_000_000) })

  it('drops unstable when the steady window is stable, with its notice', async () => {
    const emitted = await result({ scenario: choppy(9600) })
    // The same series as the choppy run below up to the warm-up end, which the running ramp moved
    // to its settle instant, 7.4 s: unstable there, and steady over the window.
    expect(emitted.download?.series?.warmupEndMs).toBe(7400)
    expect(emitted.download?.confidence).toEqual({ level: 'normal', reasons: [] })
    expect(emitted.notices.filter((notice) => notice.code === 'low-confidence')).toEqual([])
  })

  it('keeps unstable when the steady window swings too', async () => {
    const emitted = await result({ scenario: choppy(60_000) })
    expect(emitted.download?.series?.warmupEndMs).toBe(7400)
    expect(emitted.download?.confidence).toEqual({ level: 'low', reasons: ['unstable'] })
    expect(emitted.notices).toContainEqual({ code: 'low-confidence', direction: 'download', reasons: ['unstable'] })
  })

  it('is cpu-bound when the Worker is busy over 90 % of the steady window', async () => {
    const emitted = await result({ busy: 0.95 })
    expect(emitted.download?.confidence?.level).toBe('cpu-bound')
    expect(emitted.upload?.confidence?.level).toBe('cpu-bound')
    expect(emitted.download?.bitsPerSecond).toBeGreaterThan(0)
  })

  it('takes precedence over low, keeping the reasons and dropping the low-confidence notice', async () => {
    const emitted = await result({ scenario: VPN, busy: 0.95 })
    expect(emitted.upload?.confidence).toEqual({ level: 'cpu-bound', reasons: ['insufficient-samples'] })
    expect(emitted.notices.filter((notice) => notice.code === 'low-confidence')).toEqual([])
  })
})

describe('the browser upload limit notice', () => {
  const carried = (emitted: Result) => emitted.notices.some((notice) => notice.code === 'browser-upload-limit')

  it('is carried by a Firefox result with an upload headline of at least 100 Mbit/s', async () => {
    const emitted = await result({ scenario: LAN })
    expect(emitted.client.browser.name).toBe('Firefox')
    expect(emitted.notices).toContainEqual({ code: 'browser-upload-limit', browser: 'Firefox' })
  })

  it('is carried, with the browser name, when any browser showed an idle share over 20 %', async () => {
    const emitted = await result({ scenario: { ...PHONE, browser: CHROME } })
    expect(emitted.notices).toContainEqual({ code: 'browser-upload-limit', browser: 'Chrome' })
  })

  it('is absent below 100 Mbit/s on Firefox and without an idle share in other browsers', async () => {
    expect(carried(await result({ scenario: LINK }))).toBe(false)
    expect(carried(await result({ scenario: { ...LAN, browser: { ...CHROME, os: 'Linux' } } }))).toBe(false)
    expect(carried(await result({ scenario: { ...LINK, browser: CHROME } }))).toBe(false)
  })
})

describe('overhead compensation', () => {
  it('at 6 % multiplies the headline and peak, keeps the uncompensated value and adds the notice', async () => {
    const plain = await result()
    const emitted = await result({ settings: { overheadCompensationPercent: 6 } })
    for (const direction of ['download', 'upload'] as const) {
      const block = emitted[direction]
      expect(block?.uncompensatedBitsPerSecond).toBe(plain[direction]?.bitsPerSecond)
      expect(block?.bitsPerSecond).toBeCloseTo((plain[direction]?.bitsPerSecond ?? 0) * 1.06, 3)
      expect(block?.peakBitsPerSecond).toBeCloseTo((plain[direction]?.peakBitsPerSecond ?? 0) * 1.06, 3)
    }
    expect(emitted.notices).toEqual([{ code: 'overhead-compensation', percent: 6 }])
    expect(emitted.settings.overheadCompensationPercent).toBe(6)
  })
})
