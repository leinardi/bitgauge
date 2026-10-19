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

import { continuousLoadedResult } from '@/engine/continuous/loaded'
import { bufferbloat, loadedLatencyResult } from '@/engine/latency/grade'
import type { Bufferbloat, DirectionResult, LoadedLatency, LoadedPing, UploadResult } from '@/engine/messages'
import { settleBuckets } from '@/engine/phases/ramp'
import type { LoadedDirection, RunReport } from '@/engine/run/report'
import { BUCKET_MS } from '@/engine/stats/units'

// Loaded latency in the result object (measurement.md sections 11.4, 11.5 and 17): each direction's
// block, quantized to the timer resolution like idle latency, its series on the direction's own
// timeline (the server's on upload, placed with the display offset), and the bufferbloat grade.

const MAX_POINTS = 2000

/** A latency no finer than the clock can tell (edge-cases.md section 9); unchanged without a resolution. */
export function quantized(ms: number, resolutionMs: number): number {
  if (!(Number.isFinite(resolutionMs) && resolutionMs > 0)) {
    return ms
  }
  const steps = Math.round(ms / resolutionMs) * resolutionMs
  // Rounded again at the nanosecond, so that 0.1 steps do not print as 50.300000000000004.
  return Math.round(steps * 1e6) / 1e6
}

/** At most 2000 points: each the mean of consecutive samples, at the first one's instant. */
function capped(series: readonly LoadedPing[]): LoadedPing[] {
  const group = Math.ceil(series.length / MAX_POINTS)
  if (group <= 1) {
    return [...series]
  }
  const points: LoadedPing[] = []
  for (let index = 0; index < series.length; index += group) {
    const pings = series.slice(index, index + group)
    points.push({ atMs: pings[0]?.atMs ?? 0, rttMs: pings.reduce((sum, ping) => sum + ping.rttMs, 0) / pings.length })
  }
  return points
}

/** The stored block: quantized, and its series moved by `place` onto the direction's timeline. */
function stored(loaded: LoadedLatency, resolutionMs: number, place: (atMs: number) => number): LoadedLatency {
  if ('status' in loaded) {
    return loaded
  }
  const at = (ms: number) => quantized(ms, resolutionMs)
  const { increaseMs } = loaded
  return {
    ...loaded,
    medianMs: at(loaded.medianMs),
    p90Ms: at(loaded.p90Ms),
    ...(increaseMs === undefined ? {} : { increaseMs: at(increaseMs) }),
    // Quantized after the cap, so an averaged point stays on the timer resolution too.
    series: capped(loaded.series.map(({ atMs, rttMs }) => ({ atMs: place(atMs), rttMs }))).map(({ atMs, rttMs }) => ({ atMs, rttMs: at(rttMs) })),
  }
}

export interface WithLoaded {
  download: DirectionResult
  upload: UploadResult
  bufferbloat?: Bufferbloat
}

/** The directions with their loaded latency, and the grade; a direction the pinger did not run for carries none. */
export function withLoaded(report: Pick<RunReport, 'idle' | 'upload' | 'loaded'>, download: DirectionResult, upload: UploadResult, resolutionMs: number): WithLoaded {
  const idle = report.idle
  const idleMedianMs = idle === null || idle.unavailable ? null : (idle.result.medianMs ?? null)
  const settleMs = settleBuckets(idleMedianMs) * BUCKET_MS
  const block = (direction: LoadedDirection | null, result: DirectionResult, place: (atMs: number) => number): LoadedLatency | undefined => {
    if (direction === null) {
      return undefined
    }
    const context = {
      idleMedianMs,
      idleSource: idle?.result.path ?? null,
      settleMs,
      hasWindow: result.bitsPerSecond !== undefined && (result.status === 'measured' || result.status === 'partial'),
      reservation: direction.reserved,
    }
    // In Continuous the last hour's per-second medians stand for the samples (measurement.md section 15).
    const loaded = direction.seconds === null ? loadedLatencyResult(direction.outcome, context) : continuousLoadedResult(direction.seconds, direction.outcome, context)
    return stored(loaded, resolutionMs, place)
  }
  const down = block(report.loaded.download, download, (atMs) => atMs)
  // On upload a send instant on the client clock is placed on the server timeline by the display
  // offset exactly as upload events are (section 11.5, upload/timeline.ts); it is display-only.
  const offset = report.upload?.displayOffsetMs ?? null
  const phaseStart = report.upload?.phaseStartMs ?? 0
  const startAt = report.loaded.upload?.startAt ?? 0
  const up = block(report.loaded.upload, upload, (atMs) => (offset === null ? atMs : startAt + atMs - offset - phaseStart))
  const grade = bufferbloat(down, up, idleMedianMs !== null)
  return {
    download: down === undefined ? download : { ...download, loadedLatency: down },
    upload: up === undefined ? upload : { ...upload, loadedLatency: up },
    ...(grade === undefined ? {} : { bufferbloat: grade }),
  }
}
