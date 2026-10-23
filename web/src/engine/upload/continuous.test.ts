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

// A Continuous upload's retention on scripted ledgers (measurement.md sections 7.5 and 15): only
// confirmed cells enter it, a failure gap's as unknown; what it holds is released from the ledger
// and the grid, the gaps kept for the events; an upload whose cells are all unknown has no
// headline; and the cpu-bound span ends at the confirmed window end, not at the latest tick.

import { describe, expect, it } from 'vitest'

import { DurationRule } from '@/engine/phases/window'
import { uploadResult } from '@/engine/result/direction'
import { BusyTrack } from '@/engine/stats/busy'
import { steadyTelemetry } from '@/engine/test/telemetry'
import { ContinuousUpload } from '@/engine/upload/continuous'
import { type Halt, uploadOutcome } from '@/engine/upload/outcome'
import { UploadLedger } from '@/engine/upload/watermark'

/** Client minus server, as the display offset reads it. */
const OFFSET = 500
const NORMAL = { level: 'normal' as const, reasons: [] }

/** The outcome of a Continuous upload over `ledger`, which halted for `halts`, its warm-up ending at cell `bucket`. */
function outcome(ledger: UploadLedger, continuous: ContinuousUpload, halts: Halt[], bucket: number) {
  return uploadOutcome({
    halts: new Set(halts),
    warmup: { bucket, confidence: NORMAL },
    ledger,
    rule: new DurationRule('upload', null, 'continuous'),
    streams: 1,
    plateau: undefined,
    bytes: 0,
    protocol: 'h2',
    streamLimit: null,
    rateLimited: null,
    bufferingSuspected: false,
    idleShare: null,
    displayOffsetMs: OFFSET,
    events: [],
    startAt: 0,
    continuous,
  })
}

/**
 * One stream of back-to-back 1 s requests, request i read on the server over [1000 i + 100,
 * 1000 i + 1100) and confirmed on the client at its end plus the offset; the warm-up ends at cell
 * 11, after the first. Request `count` is in flight when the phase halts and confirms during the
 * grace. Every confirmation hands the confirmed cells on and releases them.
 */
function steadyStream(count: number) {
  const ledger = new UploadLedger()
  ledger.protocol = 'h2'
  const continuous = new ContinuousUpload(ledger)
  let sentAt = 0
  const end = (index: number) => 1000 * index + 1100
  for (let index = 0; index < count; index++) {
    const id = ledger.send(sentAt)
    sentAt = end(index) + OFFSET
    ledger.confirm(id, sentAt, steadyTelemetry(end(index) - 1000, end(index), 100_000))
    if (index === 0) {
      continuous.begin(11)
    }
    continuous.feed(sentAt, true)
  }
  const last = ledger.send(sentAt)
  ledger.halt([{ id: last, stream: 0 }])
  const doneAt = end(count) + OFFSET
  ledger.confirm(last, doneAt, steadyTelemetry(end(count) - 1000, end(count), 100_000))
  return { ledger, continuous, doneAt, windowEndMs: end(count) }
}

describe('a Continuous upload’s retention', () => {
  it('takes the cells confirmed below the window end, releasing the ledger and the grid behind them', () => {
    const { ledger, continuous, windowEndMs } = steadyStream(12)
    // Before the final feed the last request's cells wait in the grid, beyond what was handed on.
    expect(continuous.retention.end).toBe(121)
    expect(ledger.footprint()).toEqual({ uploadEntries: 1, uploadCells: 10 })
    continuous.feed(windowEndMs + OFFSET, false)
    expect(continuous.retention.end).toBe(windowEndMs / 100)
    expect(continuous.retention.values(11, 131).every((value) => value === 10_000)).toBe(true)
    expect(continuous.retention.aggregates()).toMatchObject({ seconds: 12, bytes: 1_200_000 })
  })

  it('stores a cell overlapping a failure gap as unknown, and keeps the gap for the events once released', () => {
    const ledger = new UploadLedger()
    ledger.protocol = 'h2'
    const continuous = new ContinuousUpload(ledger)
    const r1 = ledger.send(0)
    ledger.confirm(r1, 1200, steadyTelemetry(100, 1100, 100_000))
    continuous.begin(11)
    // r2 fails; r3, sent after it ended, confirms from 1400: the gap is [1100, 1400).
    const r2 = ledger.send(1200)
    ledger.end(r2, 1300)
    const r3 = ledger.send(1300)
    ledger.confirm(r3, 2500, steadyTelemetry(1400, 2400, 100_000))
    continuous.feed(2500, true)
    expect(continuous.retention.values(11, 24)).toEqual([null, null, null, ...Array.from({ length: 10 }, () => 10_000)])
    expect(continuous.retention.rings.hour.cells()).toEqual([{ bytes: 70_000, knownMs: 700 }])
    // The released gap stays for the events, the ledger no longer keeps its request.
    expect(ledger.failureGaps()).toEqual([])
    expect(continuous.failureGaps()).toEqual([{ startMs: 1100, endMs: 1400 }])
    expect(continuous.footprint()).toMatchObject({ uploadGaps: 1 })
  })

  it('keeps the last 100 failure gaps', () => {
    const ledger = new UploadLedger()
    ledger.protocol = 'h2'
    const continuous = new ContinuousUpload(ledger)
    let at = 0
    let first = ledger.send(at)
    ledger.confirm(first, 1200, steadyTelemetry(100, 1100, 1000))
    continuous.begin(11)
    for (let gap = 0; gap < 120; gap++) {
      const base = 1100 + gap * 1000
      at = base + 100
      const failed = ledger.send(at)
      ledger.end(failed, at + 100)
      first = ledger.send(at + 100)
      ledger.confirm(first, base + 1100, steadyTelemetry(base + 300, base + 1000, 1000))
      continuous.feed(base + 1100, true)
    }
    const gaps = continuous.failureGaps()
    expect(gaps).toHaveLength(100)
    expect(gaps.at(-1)).toEqual({ startMs: 1100 + 119_000, endMs: 1100 + 119_000 + 300 })
    expect(continuous.footprint()['uploadGaps']).toBe(100)
  })
})

describe('a Continuous upload’s result', () => {
  it('has no headline when a failure gap runs from the steady start to the end', () => {
    const ledger = new UploadLedger()
    ledger.protocol = 'h2'
    const continuous = new ContinuousUpload(ledger)
    const r1 = ledger.send(0)
    ledger.confirm(r1, 1200, steadyTelemetry(100, 1100, 100_000))
    continuous.begin(11)
    // Stream B's r2, sent before any confirmation, reads [1000, 5500); stream A's u fails at
    // 1300, and r3, sent after it, closes its gap at 6000: every cell after the steady start is in it.
    const r2 = ledger.send(1000)
    const u = ledger.send(1200)
    ledger.end(u, 1300)
    const r3 = ledger.send(1300)
    ledger.confirm(r2, 6400, steadyTelemetry(1000, 5500, 450_000))
    // r4 on stream B, sent before r3 confirmed, holds the window end at r2's end once it is aborted.
    const r4 = ledger.send(6400)
    ledger.confirm(r3, 6500, steadyTelemetry(6000, 6300, 30_000))
    continuous.feed(6500, true)
    ledger.halt([{ id: r4, stream: 1 }])
    ledger.end(r4, 6600)
    continuous.feed(6600, false)
    expect(ledger.windowEnd()).toBe(5500)
    expect(continuous.retention.values(11, 55).every((value) => value === null)).toBe(true)
    const ended = outcome(ledger, continuous, ['stopped'], 11)
    expect(ended.status).toBe('insufficient-data')
    expect(ended.notices).toContainEqual({ code: 'stopped-early', direction: 'upload', coveredMs: 0 })
    const block = uploadResult(ended, { overheadCompensationPercent: 0, busy: () => 0 })
    for (const field of ['bitsPerSecond', 'peakBitsPerSecond', 'minBitsPerSecond', 'maxBitsPerSecond', 'confidence']) {
      expect(block).not.toHaveProperty(field)
    }
    expect(block.series?.values.every((value) => value === null)).toBe(true)
    expect(block.series?.knownMs?.every((known) => known === 0)).toBe(true)
    expect(block.events).toContainEqual({ code: 'failure-gap', startMs: 1000, endMs: 5900 })
  })

  it('reads cpu-bound from the steady start to the confirmed window end, 2 s before the latest tick, as the unbounded reference', () => {
    const { ledger, continuous, doneAt, windowEndMs } = steadyStream(12)
    const latestTick = doneAt + 2000
    continuous.feed(latestTick, false)
    const ended = outcome(ledger, continuous, ['run-length'], 11)
    expect(ended.status).toBe('measured')
    // Saturated until the window end on the client clock, idle for the 2 s after it.
    const from = 1100 + OFFSET
    const to = windowEndMs + OFFSET
    const pinned = new BusyTrack()
    const reference = new BusyTrack()
    for (let at = 0; at <= latestTick; at += 100) {
      if (at === from) {
        pinned.pin(from)
      }
      pinned.record(at, Math.min(at, to))
      reference.record(at, Math.min(at, to))
    }
    expect(pinned.fraction(from, to)).toBe(1)
    expect(reference.fraction(from, to)).toBe(1)
    expect(reference.fraction(from, latestTick)).toBeLessThan(0.9)
    const spans: [number, number][] = []
    const block = uploadResult(ended, {
      overheadCompensationPercent: 0,
      busy: (start, end) => {
        spans.push([start, end])
        return pinned.fraction(start, end)
      },
    })
    expect(spans).toEqual([[from, to]])
    expect(block.confidence?.level).toBe('cpu-bound')
    expect(block).toMatchObject({ status: 'measured', bitsPerSecond: 800_000, minBitsPerSecond: 800_000, maxBitsPerSecond: 800_000, windowMs: 12_000 })
  })
})
