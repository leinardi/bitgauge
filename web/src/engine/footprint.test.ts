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

// The structures a throughput phase grows (testing.md section 2, measurement.md section 15): each
// keeps only what a decision can still read, the bucket sink hands closed buckets and answered
// pings on instead of keeping them, and the run's footprint() reports every length.

import { describe, expect, it } from 'vitest'

import { type DownloadOutcome, DownloadPhase } from '@/engine/download/phase'
import { Streams } from '@/engine/download/streams'
import { LoadedLatency, type LoadedSample } from '@/engine/latency/loaded'
import { Run } from '@/engine/run'
import type { RunSettings } from '@/engine/settings'
import type { BucketSink } from '@/engine/stats/buckets'
import { FakeClock } from '@/engine/test/fakeClock'
import { FakeTransport, type Scenario } from '@/engine/test/fakeTransport'
import type { ProbeTiming } from '@/engine/types'
import { UploadGrid } from '@/engine/upload/grid'
import type { UploadOutcome } from '@/engine/upload/outcome'
import { UploadPhase } from '@/engine/upload/phase'
import { type ConfirmedTelemetry, UploadLedger } from '@/engine/upload/watermark'
import { confirmedSeries, steadyWindow } from '@/engine/upload/window'

const MIB = 1024 * 1024

/** A sink that keeps what it is handed, to see what went where. */
function kept<T>(): BucketSink<T> & { values: T[] } {
  const values: T[] = []
  return { values, append: (...more) => void values.push(...more) }
}

describe('the download requests', () => {
  it('drop one that read nothing as it ends, and those that ended before the window once it is known', () => {
    const streams = new Streams(50)
    const stream = streams.add()
    const early = streams.issue(stream, 1000, 0)
    streams.chunk(early, 500, 50, 0)
    streams.chunk(early, 500, 250, 2)
    streams.complete(early)
    const empty = streams.issue(stream, 1000, 260)
    streams.ended(empty, 270)
    const steady = streams.issue(stream, 1000, 270)
    streams.chunk(steady, 500, 520, 5)
    streams.chunk(steady, 500, 820, 8)
    streams.complete(steady)
    const open = streams.issue(stream, 1000, 830)
    streams.chunk(open, 300, 920, 9)
    expect(streams.footprint()).toBe(3)
    const before = streams.contributors(4, 10)
    streams.window(4)
    expect(streams.footprint()).toBe(2)
    expect(streams.contributors(4, 10)).toBe(before)
    expect(streams.contributors(4, 10)).toBe(2)
    // One that ends from here on before the window is dropped at once; the open one stays.
    const late = streams.issue(stream, 1000, 930)
    streams.ended(late, 940)
    expect(streams.footprint()).toBe(2)
  })
})

/** A download phase on the fake transport, run to its end at 30 s: bounded at 30 s to 30 s, or Continuous with a 30 s run length. */
async function download(continuous: boolean): Promise<{ phase: DownloadPhase; outcome: DownloadOutcome }> {
  const clock = new FakeClock()
  const scenario: Scenario = { rate: () => 12_500_000, rttMs: 50, protocol: 'h2' }
  const phase = new DownloadPhase({
    clock,
    transport: new FakeTransport(clock, scenario),
    preset: continuous ? 'continuous' : 'standard',
    streams: { mode: 'auto', fixed: 3, max: 6 },
    bounds: continuous ? null : { minMs: 30_000, maxMs: 30_000 },
    ...(continuous ? { continuous: { runLengthMs: 30_000 } } : {}),
    warmup: 'auto',
    dataCapBytes: null,
    dataUsedBefore: 0,
    limits: { maxDownloadBytes: 256 * MIB, maxStreamsPerClient: 6 },
    rttMs: scenario.rttMs,
  })
  let outcome: DownloadOutcome | undefined
  void phase.run().then((value) => (outcome = value))
  await clock.advance(60_000)
  if (outcome === undefined) {
    throw new Error('the download phase did not end')
  }
  return { phase, outcome }
}

describe('the bucket sink', () => {
  it('hands a Continuous download’s buckets from its steady start to the retention, which keeps them, and the phase only the open one', async () => {
    const bounded = await download(false)
    const { phase, outcome } = await download(true)
    const retention = outcome.retention
    const first = retention?.first ?? Number.NaN
    expect(outcome.endMs).toBe(bounded.outcome.endMs)
    expect(first).toBe(bounded.outcome.warmup?.bucket)
    expect(retention?.end).toBe(300)
    // Up to the steady start in the live series, then in the retention, the same bytes as a bounded run's buckets.
    expect(phase.series.range(0, first)).toEqual(bounded.outcome.buckets.slice(0, first))
    expect(retention?.values(first, 300)).toEqual(bounded.outcome.buckets.slice(first, 300))
    expect(outcome.buckets).toEqual([])
    // The series stops once the ramp settles; the per-bucket bytes keep the open bucket alone.
    expect(phase.footprint().downloadSeries).toBeLessThan(first + 50)
    expect(phase.footprint().downloadBytes).toBeLessThanOrEqual(1)
    expect(phase.footprint().retentionCells).toBe(6000 + 3600 + 1440 + 1008)
  })

  it('takes the answered pings instead of the pinger, whose outcome then keeps none', async () => {
    const clock = new FakeClock()
    const transport = {
      probe(_path: string): Promise<ProbeTiming> {
        const sentAt = clock.now()
        return new Promise((resolve) => clock.setTimer(20, () => resolve({ status: 204, sentAt, doneAt: clock.now(), timing: { nextHopProtocol: 'h2', requestStart: sentAt, responseStart: clock.now(), responseEnd: clock.now() } })))
      },
    }
    const options = { clock, path: () => ({ kind: 'http' as const, transport }), inFlight: () => 3, httpSource: 'http-h2' as const, startAt: 0 }
    const sink = kept<LoadedSample>()
    const handed = new LoadedLatency({ ...options, sink })
    const keeping = new LoadedLatency(options)
    handed.start()
    keeping.start()
    await clock.advance(3000)
    expect(keeping.footprint()).toBe(10)
    expect(handed.footprint()).toBe(0)
    const outcomes = Promise.all([handed.finish(0), keeping.finish(0)])
    await clock.advance(100)
    const [handedOutcome, keptOutcome] = await outcomes
    expect(handedOutcome.samples).toEqual([])
    expect(sink.values).toEqual(keptOutcome.samples)
  })
})

/** Request `index` of a steady upload: 1 s on the server from 5 s + 400 ms × index, ten 100-byte cells. */
function telemetry(index: number): ConfirmedTelemetry {
  const startMs = 5000 + index * 400
  return { startMs, durationMs: 1000, firstBucket: startMs / 100, buckets: Array.from({ length: 10 }, () => 100) }
}

/** Every read of a ledger a window and the bounds make, for cells from `cell` on. */
function reads(ledger: UploadLedger, ids: number, cell: number) {
  return {
    phaseStart: ledger.phaseStart(),
    measurementEnd: ledger.measurementEnd(),
    watermark: ledger.watermark(),
    windowEnd: ledger.windowEnd(),
    failureGaps: ledger.failureGaps(),
    confirmedRequests: ledger.confirmedRequests,
    bounds: Array.from({ length: ids }, (_, id) => [ledger.lowerBound(id), ledger.upperBound(id), ledger.isOpen(id)]),
    cells: Array.from({ length: 200 }, (_, offset) => ledger.grid.bytes(cell + offset)),
    series: confirmedSeries(ledger)?.range(cell, cell + 200),
    window: steadyWindow(ledger, cell * 100),
  }
}

describe('the upload ledger', () => {
  it('answers every read from the released cell on exactly as a ledger that kept everything', () => {
    const released = new UploadLedger()
    const reference = new UploadLedger()
    for (const ledger of [released, reference]) {
      ledger.protocol = 'h2'
    }
    // Sends every 400 ms on the client; every seventh request fails 300 ms in, the rest confirm 1 s in.
    const events: { at: number; act: (ledger: UploadLedger) => void }[] = []
    const count = 60
    for (let index = 0; index < count; index++) {
      const sentAt = index * 400
      events.push({ at: sentAt, act: (ledger) => void ledger.send(sentAt) })
      events.push(index % 7 === 3 ? { at: sentAt + 300, act: (ledger) => ledger.end(index, sentAt + 300) } : { at: sentAt + 1000, act: (ledger) => ledger.confirm(index, sentAt + 1000, telemetry(index)) })
    }
    events.sort((left, right) => left.at - right.at)
    let releasedAt: number | null = null
    for (const { at, act } of events) {
      act(released)
      act(reference)
      if (releasedAt === null && at >= 12_000) {
        // 12 s in: no window reads a cell before 150 from here on.
        released.release(150, at)
        released.grid.release(150)
        releasedAt = at
      }
    }
    expect(released.footprint().uploadEntries).toBeLessThan(reference.footprint().uploadEntries)
    expect(released.footprint().uploadCells).toBeLessThan(reference.footprint().uploadCells)
    expect(reads(released, count, 150)).toEqual(reads(reference, count, 150))
    expect(released.failureGaps()).not.toEqual([])
  })

  it('reads a released grid cell as unknown, never as zero', () => {
    const ledger = new UploadLedger()
    const first = ledger.send(0)
    ledger.confirm(first, 1500, telemetry(0))
    const second = ledger.send(1500)
    ledger.confirm(second, 2500, telemetry(3))
    ledger.grid.release(55)
    const series = confirmedSeries(ledger)
    expect(series?.first).toBe(55)
    expect(series?.range(50, 57)).toEqual([null, null, null, null, null, 100, 100])
  })

  it('keeps the requests in flight at a halt, which the measurement end reads', () => {
    const ledger = new UploadLedger()
    ledger.protocol = 'h2'
    const first = ledger.send(0)
    ledger.confirm(first, 1000, telemetry(0))
    const drained = ledger.send(1000)
    ledger.halt([{ id: drained, stream: 0 }])
    ledger.confirm(drained, 2000, telemetry(3))
    ledger.release(1000, 2000)
    expect(ledger.footprint().uploadEntries).toBe(1)
    expect(ledger.measurementEnd()).toBe(telemetry(3).startMs + 1000)
  })
})

describe('a bounded upload phase', () => {
  it('releases the confirmed requests before warm-up and keeps every cell and offset, which its outcome reads', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, { rate: () => 1_000_000, rttMs: 50, protocol: 'h2' })
    let sent = 0
    const phase = new UploadPhase({
      clock,
      transport: { upload: (size, onProgress, signal) => (sent++, transport.upload(size, onProgress, signal)) },
      preset: 'standard',
      streams: { mode: 'fixed', fixed: 3, max: 6 },
      bounds: { minMs: 5000, maxMs: 10_000 },
      warmup: 'auto',
      dataCapBytes: null,
      dataUsedBefore: 0,
      limits: { maxUploadBytes: 256 * MIB, maxStreamsPerClient: 6 },
      rttMs: 50,
      epoch: 'epoch-1',
    })
    let outcome: UploadOutcome | undefined
    void phase.run().then((value) => (outcome = value))
    await clock.advance(30_000)
    const footprint = phase.footprint()
    expect(outcome?.warmup).not.toBeNull()
    expect(footprint.uploadEntries).toBeLessThan(sent)
    expect(footprint.uploadOffsets).toBe(outcome?.confirmedRequests)
    expect(footprint.uploadCells).toBeGreaterThan(0)
  })
})

describe('the upload grid', () => {
  it('drops the cells before a released one and keeps the rest', () => {
    const grid = new UploadGrid()
    grid.add({ firstBucket: 10, buckets: [1, 2, 3, 4] })
    grid.release(12)
    expect(grid.footprint()).toBe(2)
    expect([grid.bytes(12), grid.bytes(13)]).toEqual([3, 4])
  })
})

describe('the run’s footprint', () => {
  const quick: RunSettings = {
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

  it('reports every structure a throughput phase grows, and the download drops what ended before warm-up', async () => {
    const clock = new FakeClock()
    const transport = new FakeTransport(clock, { rate: () => 1_000_000, rttMs: 50, protocol: 'h2' })
    const run = new Run({ clock, transport, settings: quick, visible: true, emit: () => undefined })
    void run.start()
    expect(Object.keys(run.footprint()).sort()).toEqual(['busySamples', 'connectionNotices', 'loadedSamples', 'loadedSeconds', 'pathBSamples'])
    const phases: Record<string, number>[] = []
    let issued = 0
    for (let at = 0; at < 60_000; at += 100) {
      await clock.advance(100)
      const footprint = run.footprint()
      if ('downloadRequests' in footprint && phases.length === 0 && clock.now() >= 5000) {
        phases.push(footprint)
        issued = transport.requested.download.length
      }
      if ('uploadEntries' in footprint && phases.length === 1 && footprint['uploadOffsets'] !== 0) {
        phases.push(footprint)
      }
    }
    const [during, upload] = phases
    expect(Object.keys(during ?? {}).sort()).toEqual(['busySamples', 'connectionNotices', 'downloadBytes', 'downloadRequests', 'downloadSeries', 'loadedSamples', 'loadedSeconds', 'pathBSamples'])
    expect(Object.keys(upload ?? {}).sort()).toEqual(['busySamples', 'connectionNotices', 'loadedSamples', 'loadedSeconds', 'pathBSamples', 'uploadCells', 'uploadEntries', 'uploadOffsets'])
    // The requests that ended before warm-up are gone: fewer kept than issued by then.
    expect(during?.['downloadRequests'] ?? Number.NaN).toBeLessThan(issued)
    expect(during?.['loadedSamples'] ?? 0).toBeGreaterThan(0)
    expect(during?.['pathBSamples'] ?? 0).toBeGreaterThan(0)
  })
})
