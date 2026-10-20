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

import type { ClosedCellEvent, Direction, DirectionResult, EngineEvent, Result, TestSettings } from '@/engine/messages'
import { resultFixture } from '@/test/fixtures'

// A synthetic Continuous run's events, as the engine sends them (measurement.md section 15): the
// run's settings, the direction's phase start, then a sample per `stepS` seconds with its native
// buckets, the coarse cells they close, the live figures and a ping every `pingS` seconds. The
// upload's buckets sit on the server grid from `origin`, P_start, with its failure gaps unknown.

export interface StreamOptions {
  direction: Direction
  /** Seconds of the direction's run. */
  seconds: number
  /** Seconds per sample. */
  stepS?: number
  /** Seconds between two pings. */
  pingS?: number
  /** Bytes per known 100 ms bucket. */
  bytes?: number
  /** Native buckets of warm-up before the steady start. */
  warmupBuckets?: number
  /** Unknown native buckets, [from, to) from the phase start, on upload only. */
  gaps?: readonly [number, number][]
}

export function continuousSettings(direction: Direction, runLengthMs?: number): TestSettings {
  return {
    preset: 'continuous',
    phases: ['idle', 'download', 'upload'],
    streams: { mode: 'auto', fixed: 3, max: 6 },
    download: { minMs: null, maxMs: null },
    upload: { minMs: null, maxMs: null },
    dataCapBytes: null,
    units: 'bits',
    warmup: 'auto',
    pingCount: 20,
    overheadCompensationPercent: 0,
    continuousDirection: direction,
    ...(runLengthMs === undefined ? {} : { runLengthMs }),
  }
}

/** A Continuous result's settings, as the result records them (measurement.md section 17). */
export function continuousResultSettings(direction: Direction): Result['settings'] {
  return { preset: 'continuous', phases: ['idle', 'download', 'upload'], streams: { mode: 'auto', max: 6 }, download: { minMs: null, maxMs: null }, upload: { minMs: null, maxMs: null }, continuousDirection: direction, dataCapBytes: null, overheadCompensationPercent: 0, warmup: 'auto', pingCount: 20 }
}

export interface ContinuousResultOptions {
  direction?: Direction
  /** When the direction's series ends, from its phase start. */
  endMs: number
  /** The stored cell: 1 min for a run of up to 24 h, 10 min beyond. */
  bucketMs: number
  runLengthMs?: number
  /** Known milliseconds of a cell, by its index, on an upload with failure gaps; the rest is fully known. */
  partlyKnown?: Readonly<Record<number, number>>
}

const WARMUP_END_MS = 6500
const LONG_RING_MS = 7 * 86_400_000
const RATE = 921e6

/**
 * A finished Continuous result (measurement.md sections 15 and 17): the direction it ran with its
 * run-wide numbers and its series since the steady start, the last 7 days of it past them, in
 * cells with their known time; the other direction skipped, and a data-used notice per threshold.
 */
export function continuousResult(options: ContinuousResultOptions): Result {
  const { direction = 'download', endMs, bucketMs, runLengthMs, partlyKnown = {} } = options
  // As the engine saves it: from the warm-up end, unless the long ring dropped its first closed cells.
  const dropped = Math.max(0, Math.floor((endMs - WARMUP_END_MS) / bucketMs) - Math.floor(LONG_RING_MS / bucketMs))
  const firstCellMs = WARMUP_END_MS + dropped * bucketMs
  const values: number[] = []
  const knownMs: number[] = []
  for (let from = firstCellMs, index = 0; from < endMs; from += bucketMs, index += 1) {
    const known = partlyKnown[index] ?? Math.min(bucketMs, endMs - from)
    knownMs.push(known)
    values.push(Math.round(((RATE / 8) * known) / 1000))
  }
  const bytes = Math.round(((RATE / 8) * (endMs - WARMUP_END_MS)) / 1000)
  const notices: Result['notices'] = []
  for (let threshold = 1e9; threshold <= bytes; threshold *= 10) {
    notices.push({ code: 'data-used', bytes: threshold })
  }
  const ran: DirectionResult = {
    status: 'measured',
    bitsPerSecond: RATE,
    peakBitsPerSecond: 936e6,
    uncompensatedBitsPerSecond: RATE,
    minBitsPerSecond: 702e6,
    maxBitsPerSecond: 941e6,
    windowMs: endMs - WARMUP_END_MS,
    streams: 6,
    plateau: 'cap',
    confidence: { level: 'normal', reasons: [] },
    bytes,
    series: { bucketMs, firstCellMs, warmupEndMs: WARMUP_END_MS, endMs, values, knownMs },
    events: runLengthMs === undefined ? [{ code: 'cancelled', atMs: endMs }] : [],
    loadedLatency: { source: 'websocket', samples: 2000, skippedTicks: 0, lost: 0, medianMs: 18, p90Ms: 24, increaseMs: 14.9, series: [{ atMs: firstCellMs + bucketMs / 2, rttMs: 18 }] },
    responsiveness: { state: 'measured', protocol: 'h2', samples: 23_950, rpm: 1380, tm95Ms: 43.5, trimmed: 1197, totalMedianMs: 46 },
  }
  const skipped: DirectionResult = { status: 'skipped', streams: 0, bytes: 0, events: [] }
  const base = resultFixture({ id: 'c0a1b2c3-0000-4000-8000-00000000c0c0', durationMs: endMs + 1500 })
  return {
    ...base,
    settings: { ...continuousResultSettings(direction), ...(runLengthMs === undefined ? {} : { runLengthMs }) },
    download: direction === 'download' ? ran : skipped,
    upload: { ...(direction === 'upload' ? ran : skipped), confirmedRequests: direction === 'upload' ? 41_000 : 0 },
    bufferbloat: { grade: 'A', basis: direction, increaseMs: 14.9 },
    scores: { basis: direction, packetLoss: 'not-measured', streaming: { points: 60, band: 'great' }, gaming: { points: 30, band: 'great' }, rtc: { points: 40, band: 'great' } },
    dataUsedBytes: bytes,
    notices,
  }
}

/** The upload's P_start on the server grid, far from 0. */
const UPLOAD_ORIGIN = 9000

const FOLD = { hour: 10, day: 60, long: 10 } as const

/** Calls `onEvent` with each event of the run, and `at` after each sample with its elapsed seconds. */
export function continuousStream(options: StreamOptions, onEvent: (event: EngineEvent) => void, at: (elapsedS: number) => void = () => {}): void {
  const { direction, seconds, stepS = 60, pingS = 3, bytes = 12_500, warmupBuckets = 60, gaps = [] } = options
  const origin = direction === 'upload' ? UPLOAD_ORIGIN : 0
  const open = { hour: { bytes: 0, knownMs: 0, n: 0 }, day: { bytes: 0, knownMs: 0, n: 0 }, long: { bytes: 0, knownMs: 0, n: 0 } }
  onEvent({ type: 'settings', scope: 'run', settings: continuousSettings(direction) })
  onEvent({ type: 'phase', phase: direction, state: 'started', notices: [] })
  const total = Math.round(seconds * 10)
  const perSample = Math.round(stepS * 10)
  let nextPing = 0
  let dataBytes = 0
  for (let from = 0; from < total; from += perSample) {
    const values: (number | null)[] = []
    const cells: ClosedCellEvent[] = []
    const fold = (tier: 'hour' | 'day' | 'long', cellBytes: number, knownMs: number) => {
      const cell = open[tier]
      cell.bytes += cellBytes
      cell.knownMs += knownMs
      cell.n++
      if (cell.n < FOLD[tier]) {
        return
      }
      cells.push({ tier, bytes: cell.bytes, knownMs: cell.knownMs })
      open[tier] = { bytes: 0, knownMs: 0, n: 0 }
      if (tier === 'hour') fold('day', cells.at(-1)?.bytes ?? 0, cells.at(-1)?.knownMs ?? 0)
      else if (tier === 'day') fold('long', cells.at(-1)?.bytes ?? 0, cells.at(-1)?.knownMs ?? 0)
    }
    for (let bucket = from; bucket < Math.min(total, from + perSample); bucket++) {
      const unknown = gaps.some(([start, end]) => bucket >= start && bucket < end)
      values.push(unknown ? null : bytes)
      dataBytes += bytes
      if (bucket >= warmupBuckets) {
        fold('hour', unknown ? 0 : bytes, unknown ? 0 : 100)
      }
    }
    const end = Math.min(total, from + perSample)
    const pings = []
    for (; nextPing < end / 10; nextPing += pingS) {
      pings.push({ atMs: nextPing * 1000, rttMs: 20 + (nextPing % 7) })
    }
    const steady = end > warmupBuckets + 30
    const upload = direction === 'upload' ? { startBucket: origin, sendingBucket: origin + end - 0.5, sending: bytes * 80 } : {}
    onEvent({
      type: 'sample',
      direction,
      fromBucket: origin + from,
      values,
      gauge: bytes * 80,
      streams: 4,
      phaseMs: end * 100,
      dataUsedBytes: dataBytes,
      ...(end > warmupBuckets ? { warmupEndBucket: origin + warmupBuckets } : {}),
      ...upload,
      cells,
      loadedLatency: pings,
      continuous: { elapsedMs: end * 100, dataBytes, ...(steady ? { avgBitsPerSecond: bytes * 80, minBitsPerSecond: bytes * 80, maxBitsPerSecond: bytes * 80, peakLastHourBitsPerSecond: bytes * 80 } : {}) },
    })
    at(end / 10)
  }
}
