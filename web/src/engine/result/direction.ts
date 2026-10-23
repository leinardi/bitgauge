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

import type { Retention } from '@/engine/continuous/retention'
import { savedSeries } from '@/engine/continuous/series'
import type { DownloadOutcome } from '@/engine/download/phase'
import type { Confidence, ConfidenceReason, DirectionResult, Notice, ResultSeries, UploadResult } from '@/engine/messages'
import { MAX_VARIATION, type WarmupEnd } from '@/engine/phases/warmup'
import { windowConditionHolds, windowVariation } from '@/engine/phases/window'
import { type Cell, percentile } from '@/engine/stats/buckets'
import { cpuBound } from '@/engine/stats/busy'
import { BUCKET_MS, bitsPerSecond, bucketRate } from '@/engine/stats/units'
import type { UploadOutcome } from '@/engine/upload/outcome'

// A throughput direction's block of the result object (measurement.md sections 9, 16 and 17): the
// headline and peak over the steady window, overhead compensation, the confidence with the
// cpu-bound check, and the steady-window series downsampled to at most 2000 points; a Continuous
// direction's from its retention (section 15).

const MAX_POINTS = 2000
const PEAK_PERCENTILE = 90
const SECOND_MS = 1000

export interface DirectionContext {
  overheadCompensationPercent: number
  /** The Worker's busy fraction between two client instants; null without samples. */
  busy: (from: number, to: number) => number | null
}

/**
 * Sums consecutive buckets into at most 2000 points. A point with an unknown bucket is unknown,
 * so no rate is ever estimated; the last point may hold fewer buckets.
 */
export function downsample(values: readonly Cell[], times: Omit<ResultSeries, 'bucketMs' | 'values'>): ResultSeries {
  const group = Math.max(1, Math.ceil(values.length / MAX_POINTS))
  const points: Cell[] = []
  for (let index = 0; index < values.length; index += group) {
    const cells = values.slice(index, index + group)
    points.push(cells.some((cell) => cell === null) ? null : cells.reduce<number>((sum, cell) => sum + (cell ?? 0), 0))
  }
  return { bucketMs: group * BUCKET_MS, ...times, values: points }
}

/**
 * The warm-up's confidence with `unstable` set by the steady window alone (section 8.3): held when
 * the window's variation at the gauge's resolution is over 10 %, dropped otherwise, whatever the
 * warm-up saw; or cpu-bound when the Worker was busy over 90 % of the window.
 */
function confidence(warmup: WarmupEnd, fraction: number | null, variation: number | null): Confidence {
  const had = warmup.confidence.reasons
  const unstable = variation === null ? had.includes('unstable') : variation > MAX_VARIATION
  const reasons: ConfidenceReason[] = unstable ? (had.includes('unstable') ? had : [...had, 'unstable']) : had.filter((reason) => reason !== 'unstable')
  if (cpuBound(fraction)) {
    return { level: 'cpu-bound', reasons }
  }
  return reasons.length === 0 ? { level: 'normal', reasons: [] } : { level: 'low', reasons }
}

/** The number's fields, compensated by `1 + p / 100`, the uncompensated headline kept. */
function number(bits: number, peak: number, percent: number): Pick<DirectionResult, 'bitsPerSecond' | 'peakBitsPerSecond' | 'uncompensatedBitsPerSecond'> {
  const factor = 1 + percent / 100
  return { bitsPerSecond: bits * factor, peakBitsPerSecond: peak * factor, uncompensatedBitsPerSecond: bits }
}

/** A direction the run did not reach, or the settings left out. */
export function skippedDirection(): DirectionResult {
  return { status: 'skipped', streams: 0, bytes: 0, events: [] }
}

function base(outcome: DownloadOutcome | UploadOutcome): DirectionResult {
  return {
    status: outcome.status,
    streams: outcome.streams,
    ...(outcome.plateau === undefined ? {} : { plateau: outcome.plateau }),
    bytes: outcome.bytes,
    events: outcome.events,
  }
}

/**
 * A stopped bounded direction is `partial` only with a number; without one it is
 * `insufficient-data` (measurement.md section 7.6), and the result stays partial.
 */
function stopped<T extends DirectionResult>(block: T): T {
  return block.status === 'partial' && block.bitsPerSecond === undefined ? { ...block, status: 'insufficient-data' } : block
}

/** A number is reported when the direction was measured, or stopped with a sufficient window. */
function reportsNumber(outcome: DownloadOutcome | UploadOutcome, sufficient: boolean): boolean {
  return sufficient && (outcome.status === 'measured' || outcome.status === 'partial')
}

/**
 * A Continuous direction (section 15): measured, its headline the run-wide average over the fully
 * known 1 s cells since the steady start, its minimum and maximum the lowest and highest of them,
 * its peak the final p90 of the last hour; insufficient-data without any number or confidence.
 */
function continuousResult(outcome: DownloadOutcome | UploadOutcome, retention: Retention, span: Continuous, context: DirectionContext): DirectionResult {
  const series = savedSeries(retention, span.originMs)
  const block = { ...base(outcome), ...(series === null ? {} : { series }) }
  const { warmup } = outcome
  if (outcome.status !== 'measured' || warmup === null || retention.first === null) {
    return block
  }
  const { seconds, bytes, minBytes, maxBytes, variation, peakLastHourBytes } = retention.aggregates()
  const factor = 1 + context.overheadCompensationPercent / 100
  const windowMs = seconds * SECOND_MS
  const bits = bitsPerSecond(bytes, windowMs)
  const rate = (cell: number) => bitsPerSecond(cell, SECOND_MS) * factor
  return {
    ...block,
    bitsPerSecond: bits * factor,
    ...(peakLastHourBytes === null ? {} : { peakBitsPerSecond: rate(peakLastHourBytes) }),
    uncompensatedBitsPerSecond: bits,
    ...(minBytes === null || maxBytes === null ? {} : { minBitsPerSecond: rate(minBytes), maxBitsPerSecond: rate(maxBytes) }),
    windowMs,
    // cpu-bound reads the Worker's busy fraction from the steady start to the end.
    confidence: confidence(warmup, span.busy === null ? null : context.busy(span.busy.fromMs, span.busy.toMs), variation),
  }
}

/** Where a Continuous direction's series and busy span sit. */
interface Continuous {
  /** The instant its cells count from: the phase start on download, P_start on upload. */
  originMs: number
  /** From the steady start to the end, on the client clock; null without a display offset. */
  busy: { fromMs: number; toMs: number } | null
}

/** `startAt` is the phase start on the client clock. */
export function downloadResult(outcome: DownloadOutcome, startAt: number, context: DirectionContext): DirectionResult {
  const { window, warmup } = outcome
  const { retention } = outcome
  if (retention !== null) {
    return continuousResult(outcome, retention, { originMs: 0, busy: { fromMs: startAt + (retention.first ?? 0) * BUCKET_MS, toMs: startAt + outcome.endMs } }, context)
  }
  if (window === null || warmup === null) {
    return stopped(base(outcome))
  }
  // The window holds full buckets only (section 9.2), so its bytes are the buckets' sum.
  const values = outcome.buckets.slice(window.fromMs / BUCKET_MS, window.toMs / BUCKET_MS)
  const windowMs = window.toMs - window.fromMs
  const fraction = context.busy(startAt + window.fromMs, startAt + window.toMs)
  const peak = percentile(values, PEAK_PERCENTILE)
  const measured = reportsNumber(outcome, windowConditionHolds('download', windowMs, window.requests)) && peak !== null
  return stopped({
    ...base(outcome),
    ...(measured ? number(bitsPerSecond(window.bytes, windowMs), bucketRate(peak), context.overheadCompensationPercent) : {}),
    windowMs,
    confidence: confidence(warmup, fraction, windowVariation(values)),
    series: downsample(values, { firstCellMs: window.fromMs, warmupEndMs: window.fromMs, endMs: window.toMs }),
  })
}

export function uploadResult(outcome: UploadOutcome, context: DirectionContext): UploadResult {
  const { window, warmup, series, phaseStartMs, warmupEndMs, windowEndMs, displayOffsetMs } = outcome
  const block: UploadResult = { ...base(outcome), confirmedRequests: outcome.confirmedRequests }
  const { retention } = outcome
  if (retention !== null) {
    // The steady start's cell and W_end_final, placed on the client clock by the display offset.
    const first = (retention.first ?? 0) * BUCKET_MS
    const busy = displayOffsetMs === null || windowEndMs === null ? null : { fromMs: first + displayOffsetMs, toMs: windowEndMs + displayOffsetMs }
    return { ...continuousResult(outcome, retention, { originMs: phaseStartMs ?? 0, busy }, context), confirmedRequests: outcome.confirmedRequests }
  }
  if (window === null || warmup === null || series === null || phaseStartMs === null || warmupEndMs === null || windowEndMs === null) {
    return stopped(block)
  }
  const firstCell = Math.ceil(warmupEndMs / BUCKET_MS)
  const values = series.range(firstCell, Math.max(firstCell, Math.floor(windowEndMs / BUCKET_MS)))
  // The window is on the server timeline; the display offset places it on the client clock.
  const fraction = displayOffsetMs === null ? null : context.busy(firstCell * BUCKET_MS + displayOffsetMs, windowEndMs + displayOffsetMs)
  const { bitsPerSecond: bits, peakBitsPerSecond: peak } = window
  const measured = reportsNumber(outcome, window.sufficient) && bits !== undefined && peak !== undefined
  return stopped({
    ...block,
    ...(measured ? number(bits, peak, context.overheadCompensationPercent) : {}),
    windowMs: window.windowMs,
    confidence: confidence(warmup, fraction, windowVariation(values)),
    series: downsample(values, { firstCellMs: firstCell * BUCKET_MS - phaseStartMs, warmupEndMs: warmupEndMs - phaseStartMs, endMs: windowEndMs - phaseStartMs }),
  })
}

/**
 * The low-confidence notice follows the direction's final confidence: dropped when the level is
 * normal (the steady window dropped `unstable`, section 8.3) or cpu-bound (that level takes
 * precedence, section 16), and carrying the remaining reasons otherwise.
 */
export function directionNotices(notices: readonly Notice[] | undefined, block: DirectionResult): readonly Notice[] {
  const confidence = block.confidence
  return (notices ?? []).flatMap((notice): Notice[] => {
    if (notice.code !== 'low-confidence') {
      return [notice]
    }
    return confidence?.level === 'low' ? [{ ...notice, reasons: confidence.reasons }] : []
  })
}

/** Every direction's notices, then the run's, without repeats, and the compensation notice last. */
export function resultNotices(lists: readonly (readonly Notice[])[], overheadCompensationPercent: number): Notice[] {
  const seen = new Set<string>()
  const notices: Notice[] = []
  for (const notice of lists.flat()) {
    const key = JSON.stringify(notice)
    if (!seen.has(key)) {
      seen.add(key)
      notices.push(notice)
    }
  }
  return overheadCompensationPercent === 0 ? notices : [...notices, { code: 'overhead-compensation', percent: overheadCompensationPercent }]
}
