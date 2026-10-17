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

import type { LoadedOutcome } from '@/engine/latency/loaded'
import type { Bufferbloat, IdleResult, LoadedLatency, LoadedSource } from '@/engine/messages'
import { percentile } from '@/engine/stats/buckets'

// A direction's loaded latency from its pinger's outcome, and the bufferbloat grade over both
// directions (measurement.md sections 11.2 to 11.4). Pure: the result's quantization and the
// series' time base are the result builder's (result/loaded.ts).

/** Every source needs this many counted samples. */
const MIN_LOADED_SAMPLES = 10

/** The throughput streams while the HTTP/1.1 probe reservation holds. */
export const RESERVED_STREAMS = 5

export interface LoadedContext {
  /** The idle-latency median; null when idle latency was left out or is unavailable. */
  idleMedianMs: number | null
  /** The idle-latency path, null without idle latency. */
  idleSource: IdleResult['path'] | null
  /** I_s from the phase start: samples sent earlier are slow start. */
  settleMs: number
  /** The direction has a steady window: measured, or partial with a number (section 11.1). */
  hasWindow: boolean
  /** The direction ran under the HTTP/1.1 probe reservation. */
  reservation: boolean
}

function pathOf(source: LoadedSource): IdleResult['path'] {
  return source === 'websocket' ? 'websocket' : 'http'
}

/** The direction's loaded latency; `series` times are from the phase start on the client clock. */
export function loadedLatencyResult(outcome: LoadedOutcome, context: LoadedContext): LoadedLatency {
  const { skippedTicks, lost, sources } = outcome
  const source = sources.at(-1)
  if (source === undefined) {
    return { status: 'unavailable', reason: 'no-probe-path', samples: 0, skippedTicks, lost }
  }
  const eligible = outcome.samples.filter((sample) => sample.loaded && sample.atMs >= context.settleMs)
  // On HTTP/2 or HTTP/3 only the later source counts; on HTTP/1.1 two sources break the reservation.
  const counted = eligible.filter((sample) => sample.source === source)
  const unavailable = (reason: Exclude<LoadedLatency, { medianMs: number }>['reason'], samples: number): LoadedLatency => ({ status: 'unavailable', reason, source, samples, skippedTicks, lost })
  if (!context.hasWindow) {
    return unavailable('no-steady-window', counted.length)
  }
  const h1 = source === 'http-h1-reserved'
  if (h1 && (sources.length > 1 || !context.reservation || outcome.maxInFlight > RESERVED_STREAMS)) {
    return unavailable('reservation-broken', counted.length)
  }
  const rtts = counted.map((sample) => sample.rttMs)
  const medianMs = percentile(rtts, 50)
  const p90Ms = percentile(rtts, 90)
  if (counted.length < MIN_LOADED_SAMPLES || medianMs === null || p90Ms === null) {
    return unavailable('insufficient-samples', counted.length)
  }
  const idle = context.idleMedianMs
  return {
    source,
    ...(idle !== null && context.idleSource !== null && context.idleSource !== pathOf(source) ? { idleSource: context.idleSource } : {}),
    samples: counted.length,
    skippedTicks,
    lost,
    medianMs,
    p90Ms,
    ...(idle === null ? {} : { increaseMs: Math.max(0, medianMs - idle) }),
    series: counted.map(({ atMs, rttMs }) => ({ atMs, rttMs })),
  }
}

/** The grades of section 11.3, by the increase each stays below. */
const GRADES: readonly [Bufferbloat['grade'], number][] = [
  ['A+', 5],
  ['A', 30],
  ['B', 60],
  ['C', 200],
  ['D', 400],
]

export function gradeOf(increaseMs: number): Bufferbloat['grade'] {
  return GRADES.find(([, below]) => increaseMs < below)?.[0] ?? 'F'
}

function increase(loaded: LoadedLatency | undefined): number | null {
  return loaded === undefined || 'status' in loaded ? null : (loaded.increaseMs ?? null)
}

/**
 * The grade over the larger increase of the directions that have one; absent without idle
 * latency or a gradable direction, never null.
 */
export function bufferbloat(download: LoadedLatency | undefined, upload: LoadedLatency | undefined, hasIdle: boolean): Bufferbloat | undefined {
  const down = increase(download)
  const up = increase(upload)
  if (!hasIdle || (down === null && up === null)) {
    return undefined
  }
  const basis: Bufferbloat['basis'] = down !== null && up !== null ? 'download+upload' : down !== null ? 'download' : 'upload'
  const increaseMs = Math.max(down ?? 0, up ?? 0)
  return { grade: gradeOf(increaseMs), basis, increaseMs }
}
