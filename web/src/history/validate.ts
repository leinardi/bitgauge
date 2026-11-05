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

import { type DirectionResult, type Result, validateDerivedResult } from '@/engine/messages'
import { MAX_NOTE } from '@/lib/resultLimits'
import { runPhases } from '@/lib/continuous'
import { validSeriesExtent } from '@/lib/resultSeries'

// Import admission policy (frontend.md §5), after structural validation. Kept separate from
// stored reads/export so new admission caps never silently remove existing history.
const NUMBER_FIELDS = new Set(['bytes', 'dataUsedBytes', 'confirmedRequests', 'streams', 'samples', 'skippedTicks', 'lost', 'major', 'pingCount', 'rpm', 'trimmed', 'points', 'max', 'dataCapBytes'])

function numericProblems(value: unknown, path: string, problems: string[]): void {
  if (typeof value === 'number') {
    const field = path.split('.').at(-1) ?? ''
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER || ((NUMBER_FIELDS.has(field) || /\.values\[\d+\]$/.test(path)) && !Number.isSafeInteger(value))) {
      problems.push(`${path}: outside the supported numeric range`)
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => numericProblems(entry, `${path}[${index}]`, problems))
  } else if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) numericProblems(entry, `${path}.${key}`, problems)
  }
}

function directionProblems(part: DirectionResult, path: string, continuous: boolean, problems: string[]): void {
  const measured = part.status === 'measured' || part.status === 'partial'
  const rates = ['bitsPerSecond', 'peakBitsPerSecond', 'uncompensatedBitsPerSecond', 'minBitsPerSecond', 'maxBitsPerSecond'] as const
  if (measured) {
    for (const field of ['bitsPerSecond', 'uncompensatedBitsPerSecond', 'windowMs', 'confidence', 'series'] as const) {
      if (part[field] === undefined) problems.push(`${path}.${field}: required for a measured or partial direction`)
    }
    if (!continuous && part.peakBitsPerSecond === undefined) problems.push(`${path}.peakBitsPerSecond: required for a bounded measurement`)
    if (part.windowMs !== undefined && part.windowMs < 3000) problems.push(`${path}.windowMs: a number requires at least 3 seconds of steady data`)
  } else if (rates.some((key) => part[key] !== undefined)) {
    problems.push(`${path}: numbers require measured or partial status`)
  }
  const measurementFields = [...rates, 'windowMs', 'plateau', 'series', 'confidence', 'loadedLatency', 'responsiveness'] as const
  if (part.status === 'skipped' && (part.streams !== 0 || part.bytes !== 0 || part.events.length > 0 || measurementFields.some((field) => part[field] !== undefined))) {
    problems.push(`${path}: a skipped direction has no measurement data`)
  }
  if (!continuous && [part.windowMs, part.confidence, part.series].some((value) => value !== undefined)
    && [part.windowMs, part.confidence, part.series].some((value) => value === undefined)) problems.push(`${path}: window, confidence and series must be present together`)
  if (continuous && part.status === 'insufficient-data' && part.confidence !== undefined) problems.push(`${path}.confidence: absent for insufficient Continuous data`)
  if (!continuous && (part.minBitsPerSecond !== undefined || part.maxBitsPerSecond !== undefined || part.series?.knownMs !== undefined)) problems.push(`${path}: Continuous-only fields on a bounded direction`)
  if (part.streams > 6) problems.push(`${path}.streams: more than 6 streams`)
  if (part.series !== undefined) {
    const series = part.series
    if (!validSeriesExtent(series, !continuous && path === 'result.upload')) problems.push(`${path}.series: extent does not match stored cells`)
    if (series.warmupEndMs > series.firstCellMs || series.firstCellMs > series.endMs) problems.push(`${path}.series: invalid time order`)
    if (series.knownMs !== undefined && (series.knownMs.length !== series.values.length || series.knownMs.some((ms) => ms > series.bucketMs))) problems.push(`${path}.series.knownMs: inconsistent with its cells`)
  }
}

/** Confidence and its required notice are one final assessment (measurement.md §16). */
function confidenceProblems(result: Result, problems: string[]): void {
  for (const direction of ['download', 'upload'] as const) {
    const part = result[direction]
    const confidence = part?.confidence
    const notices = result.notices.filter((notice) => notice.code === 'low-confidence' && notice.direction === direction)
    const path = `result.${direction}.confidence`
    if (confidence !== undefined) {
      const { level, reasons } = confidence
      if ((level === 'normal' && reasons.length !== 0) || (level === 'low' && reasons.length === 0)
        || new Set(reasons).size !== reasons.length) problems.push(`${path}: level and reasons disagree`)
    }
    const requiresNotice = confidence?.level === 'low' && part !== undefined && ['measured', 'partial', 'insufficient-data'].includes(part.status)
    if (requiresNotice && notices.length === 0) problems.push(`${path}: missing low-confidence notice`)
    for (const notice of notices) {
      if (notice.code !== 'low-confidence') continue
      if (confidence?.level !== 'low' || notice.reasons.length !== confidence.reasons.length
        || new Set(notice.reasons).size !== notice.reasons.length
        || notice.reasons.some((reason) => !confidence.reasons.includes(reason))) problems.push(`${path}: low-confidence notice contradicts final reasons`)
    }
  }
}

/** Additional problems of an imported, structurally valid result. Never modifies the input. */
export function importProblems(result: Result): string[] {
  const problems: string[] = []
  const text = (value: string | undefined, path: string, max: number) => {
    if (value !== undefined && [...value].length > max) problems.push(`${path}: more than ${max} characters`)
  }
  text(result.note, 'result.note', MAX_NOTE)
  text(result.server.name, 'result.server.name', 64)
  text(result.server.version, 'result.server.version', 256)
  text(result.server.epoch, 'result.server.epoch', 256)
  text(result.client.contextLabel, 'result.client.contextLabel', 64)
  text(result.client.ip, 'result.client.ip', 64)
  text(result.client.protocol, 'result.client.protocol', 64)
  text(result.client.browser.name, 'result.client.browser.name', 128)
  text(result.client.browser.os, 'result.client.browser.os', 128)
  numericProblems(result, 'result', problems)
  const { settings } = result
  const bounded = (value: number, min: number, max: number, path: string) => {
    if (value < min || value > max) problems.push(`${path}: outside ${min}–${max}`)
  }
  bounded(settings.overheadCompensationPercent, 0, 20, 'result.settings.overheadCompensationPercent')
  bounded(settings.streams.max, 1, 6, 'result.settings.streams.max')
  bounded(settings.pingCount, 6, 200, 'result.settings.pingCount')
  if (settings.dataCapBytes !== null) bounded(settings.dataCapBytes, 1024 * 1024, Number.MAX_SAFE_INTEGER, 'result.settings.dataCapBytes')
  if (settings.runLengthMs !== undefined) bounded(settings.runLengthMs, 60_000, 604_800_000, 'result.settings.runLengthMs')
  if (settings.warmup !== 'auto') bounded(settings.warmup, 1000, 60_000, 'result.settings.warmup')
  if (result.idle !== undefined) bounded(result.idle.lossPercent, 0, 100, 'result.idle.lossPercent')
  if (result.idle !== undefined && result.idle.samples.length > settings.pingCount) problems.push('result.idle.samples: more samples than the ping count')
  if (settings.phases.length === 0 || new Set(settings.phases).size !== settings.phases.length) problems.push('result.settings.phases: must be nonempty and unique')
  if (settings.phases.includes('idle') && settings.phases[0] !== 'idle') problems.push('result.settings.phases: idle latency must come first')
  if (result.idle !== undefined && !settings.phases.includes('idle')) problems.push('result.idle: excluded by settings.phases')
  const continuous = settings.preset === 'continuous'
  confidenceProblems(result, problems)
  for (const direction of ['download', 'upload'] as const) {
    const part = result[direction]
    if (part !== undefined) {
      directionProblems(part, `result.${direction}`, continuous, problems)
      if (part.status !== 'skipped' && !runPhases(settings).includes(direction)) problems.push(`result.${direction}: excluded by effective phases`)
      if (result.status === 'complete' && (part.status === 'error' || part.status === 'partial')) problems.push(`result.status: complete contradicts ${direction} status`)
      if (continuous && direction !== (settings.continuousDirection ?? 'download') && part.status !== 'skipped') problems.push(`result.${direction}: not the Continuous direction`)
    }
    const bounds = settings[direction]
    if (bounds !== undefined) {
      if (continuous ? bounds.minMs !== null || bounds.maxMs !== null : bounds.minMs === null || bounds.maxMs === null || bounds.minMs < 5000 || bounds.maxMs > 600_000 || bounds.minMs > bounds.maxMs) {
        problems.push(`result.settings.${direction}: invalid duration bounds`)
      }
    }
    if (part?.responsiveness !== undefined) text(part.responsiveness.protocol, `result.${direction}.responsiveness.protocol`, 64)
  }
  if (result.upload?.status === 'skipped' && result.upload.confirmedRequests !== 0) problems.push('result.upload.confirmedRequests: must be zero for a skipped direction')
  if (continuous && result.status === 'complete' && result[settings.continuousDirection ?? 'download']?.status !== 'measured') problems.push('result.status: complete Continuous result requires a measured direction')
  if (result.bufferbloat !== undefined) {
    const basis = result.bufferbloat.basis === 'download+upload' ? ['download', 'upload'] as const : [result.bufferbloat.basis]
    if (result.idle?.medianMs === undefined || basis.some((direction) => {
      const part = result[direction]
      return part === undefined || !['measured', 'partial'].includes(part.status) || part.loadedLatency === undefined || 'status' in part.loadedLatency
    })) problems.push('result.bufferbloat: basis requires idle and gradable loaded latency')
  }
  if (result.scores !== undefined && result.scores.basis !== (result.bufferbloat?.basis ?? 'none')) problems.push('result.scores.basis: must match the bufferbloat basis')
  for (const [index, notice] of result.notices.entries()) {
    if (notice.code === 'url-parameter-ignored') {
      text(notice.parameter, `result.notices[${index}].parameter`, 64)
      text(notice.value, `result.notices[${index}].value`, 64)
    }
    if (notice.code === 'browser-upload-limit') text(notice.browser, `result.notices[${index}].browser`, 128)
    if (notice.code === 'overhead-compensation') bounded(notice.percent, 0, 20, `result.notices[${index}].percent`)
  }
  return [...problems, ...validateDerivedResult(result)]
}
