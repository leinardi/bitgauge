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

import { Activity, ArrowDown, ArrowUp, Database, Globe, Timer } from '@lucide/vue'
import type { Component } from 'vue'

import type { MetaRow } from '@/components/layout/MetaList.vue'
import type { BrowserIdentity, ConfidenceReason, Direction, DirectionResult, IdleResult, SteadySoFar } from '@/engine/messages'
import type { Wording } from '@/components/test/wording'
import { bytesParts, formatBytes, formatDuration, formatLimit, formatPercent, latencyNumber, rateParts, secondsNumber } from '@/lib/format'
import { protocolLabel } from '@/lib/protocol'

// The metric tiles' contents (ui/screens.md section 6, design_system/components/tiles.md), worded
// from what the engine sent: a live tile's numbers so far, or a finished phase's part of the
// result. Every state but done carries a pill; the error, insufficient-data, skipped and
// warming-up states never show a number.

export interface TileLine {
  text: string
  tone?: 'warn' | 'danger'
}

/** The state pill of tiles.md: Live, Partial, Insufficient data, Low confidence or Error. */
export interface TilePill {
  text: string
  tone: 'info' | 'warn' | 'danger'
}

export interface TileView {
  label: string
  icon: Component
  /** The icon's color token. */
  color: string
  /** The number, or null for "—". */
  number: string | null
  unit: string
  /** Words in the number's place, as "warming up". */
  word: string | null
  lines: TileLine[]
  pill: TilePill | null
}

const SERIES = { download: 'var(--series-download)', upload: 'var(--series-upload)', latency: 'var(--series-latency)', neutral: 'var(--fg-subtle)' }

function blank(label: string, icon: Component, color: string): TileView {
  return { label, icon, color, number: null, unit: '', word: null, lines: [], pill: null }
}

export function confidenceReasons(list: readonly ConfidenceReason[], { t, locale }: Wording): string {
  const words = list.map((reason) =>
    reason === 'ramp-unsettled' ? t('test.tiles.reasons.rampUnsettled') : reason === 'insufficient-samples' ? t('test.tiles.reasons.insufficientSamples') : t('test.tiles.reasons.unstable'),
  )
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(words)
}

const pills = {
  live: (t: Wording['t']): TilePill => ({ text: t('test.tiles.live'), tone: 'info' }),
  partial: (t: Wording['t']): TilePill => ({ text: t('test.tiles.pillPartial'), tone: 'warn' }),
  insufficient: (t: Wording['t']): TilePill => ({ text: t('test.tiles.pillInsufficient'), tone: 'warn' }),
  low: (t: Wording['t']): TilePill => ({ text: t('test.tiles.pillLowConfidence'), tone: 'warn' }),
  error: (t: Wording['t']): TilePill => ({ text: t('test.tiles.pillError'), tone: 'danger' }),
}

/** What ended a direction with an error, from its error event (tiles.md: "error · connection lost"). */
function errorCause(result: DirectionResult, t: Wording['t']): string {
  const event = result.events.find((entry) => entry.code === 'error')
  switch (event?.code === 'error' ? event.notice : null) {
    case 'requests-failed':
      return t('test.tiles.errorCause.requestsFailed')
    case 'rate-limited':
      return t('test.tiles.errorCause.rateLimited')
    case 'server-busy':
      return t('test.tiles.errorCause.serverBusy')
    case 'network-changed':
      return t('test.tiles.errorCause.networkChanged')
    case 'server-restarted':
      return t('test.tiles.errorCause.serverRestarted')
    case 'server-unreachable':
      return t('test.tiles.errorCause.serverUnreachable')
    case 'upload-interrupted':
      return t('test.tiles.errorCause.uploadInterrupted')
    default:
      return t('test.tiles.error')
  }
}

/** What a direction tile is given: the run's live numbers while it runs, then its part of the result. */
export interface DirectionInput {
  direction: Direction
  units: 'bits' | 'bytes'
  /** While the direction runs: its steady numbers so far, null while warming up, and whether a request has confirmed. */
  live?: { steady: SteadySoFar | null; confirmed: boolean } | null
  result?: DirectionResult | null
  overheadPercent?: number
  /** The direction runs next, after the one running now. */
  upNext?: boolean
  /** The direction's maximum duration, which an insufficient-data reason names. */
  maxMs?: number
  /** A Continuous direction, whose stop is no reason of its own for having no number (measurement.md section 15). */
  continuous?: boolean
}

/** A peak in the headline's unit is shown without repeating it: "peak 641". */
function peakText(peak: number, unit: string, input: DirectionInput, locale: string): string {
  const parts = rateParts(peak, input.units, locale)
  return parts.unit === unit ? parts.number : `${parts.number} ${parts.unit}`
}

/** Why a direction has no number: stopped before or during its window, or its maximum reached without one. */
function insufficientReason(result: DirectionResult, input: DirectionInput, { t, locale }: Wording): string {
  // A bounded direction stopped below the minimum window is insufficient data (measurement.md section 7.6).
  if (input.continuous !== true && result.events.some((event) => event.code === 'cancelled')) {
    const warm = result.windowMs !== undefined
    if (input.direction === 'download') {
      return warm ? t('test.tiles.insufficientWindow') : t('test.tiles.insufficientWarmup')
    }
    return warm ? t('test.tiles.insufficientConfirmed') : t('test.tiles.insufficientConfirmedWarmup')
  }
  // The data cap ended it before its maximum (measurement.md section 8.6).
  if (result.events.some((event) => event.code === 'data-cap')) {
    return t('test.tiles.insufficientCap')
  }
  return input.maxMs === undefined ? t('test.tiles.insufficient') : t('test.tiles.insufficientMax', { max: formatLimit(input.maxMs, locale) })
}

export function directionTile(input: DirectionInput, context: Wording): TileView {
  const { t, locale } = context
  const tile = blank(input.direction === 'download' ? t('test.tiles.download') : t('test.tiles.upload'), input.direction === 'download' ? ArrowDown : ArrowUp, SERIES[input.direction])
  const result = input.result ?? null
  if (result === null) {
    const live = input.live ?? null
    if (live === null) {
      return input.upNext === true ? { ...tile, lines: [{ text: t('test.tiles.upNext') }] } : tile
    }
    if (live.steady === null) {
      const lines = input.direction === 'upload' && !live.confirmed ? [{ text: t('test.tiles.noConfirmed') }] : []
      return { ...tile, pill: pills.live(t), word: t('test.tiles.warmingUp'), lines }
    }
    const { number, unit } = rateParts(live.steady.avgBitsPerSecond, input.units, locale)
    return { ...tile, pill: pills.live(t), number, unit, lines: [{ text: t('test.tiles.peak', { peak: peakText(live.steady.peakBitsPerSecond, unit, input, locale) }) }] }
  }
  switch (result.status) {
    case 'skipped':
      return { ...tile, lines: [{ text: t('test.tiles.skipped') }] }
    case 'error':
      return { ...tile, pill: pills.error(t), lines: [{ text: errorCause(result, t), tone: 'danger' }] }
    default:
      break
  }
  if (result.bitsPerSecond === undefined) {
    const used = { text: t('test.tiles.used', { bytes: formatBytes(result.bytes, locale) }) }
    return { ...tile, pill: pills.insufficient(t), lines: [{ text: insufficientReason(result, input, context), tone: 'warn' }, used] }
  }
  const { number, unit } = rateParts(result.bitsPerSecond, input.units, locale)
  const overhead: TileLine[] = (input.overheadPercent ?? 0) > 0 ? [{ text: t('test.tiles.overhead', { percent: formatPercent(input.overheadPercent ?? 0, locale) }) }] : []
  if (result.status === 'partial') {
    // What a stopped direction's number covers: its steady window, and on upload the confirmed requests.
    const window = formatDuration(result.windowMs ?? 0, locale)
    const requests = 'confirmedRequests' in result && typeof result.confirmedRequests === 'number' ? result.confirmedRequests : null
    const covered = requests === null ? t('test.tiles.basedOn', { window }) : t('test.tiles.basedOnRequests', { window, n: requests })
    return { ...tile, pill: pills.partial(t), number, unit, lines: [{ text: covered }, ...overhead] }
  }
  const failed = result.events.find((event) => event.code === 'error' && event.notice === 'upload-interrupted')
  const parts: string[] = []
  if (failed?.code === 'error') {
    parts.push(t('test.tiles.failedAt', { at: formatDuration(failed.atMs, locale) }))
  } else {
    if (result.peakBitsPerSecond !== undefined) parts.push(t('test.tiles.peak', { peak: peakText(result.peakBitsPerSecond, unit, input, locale) }))
    parts.push(t('test.tiles.streams', { n: result.streams }, result.streams))
    if (result.plateau !== undefined) parts.push(t('test.tiles.plateau', { reason: result.plateau }))
  }
  const lines: TileLine[] = [{ text: parts.join(' · ') }]
  let pill: TilePill | null = null
  if (result.confidence?.level === 'cpu-bound') {
    lines.push({ text: t('test.tiles.cpuBound'), tone: 'warn' })
  } else if (result.confidence?.level === 'low') {
    pill = pills.low(t)
    lines.push({ text: t('test.tiles.lowConfidence', { reasons: confidenceReasons(result.confidence.reasons, context) }), tone: 'warn' })
  }
  return { ...tile, pill, number, unit, lines: [...lines, ...overhead] }
}

/** Idle latency as far as it went: live while it runs, then its part of the result. */
export interface IdleInput {
  idle: Pick<IdleResult, 'path' | 'medianMs' | 'minMs' | 'p90Ms' | 'jitterMs'> & { lossPercent?: number }
  resolutionMs: number
  /** The negotiated protocol token, which names the HTTP probe on the fallback path. */
  protocol: string | null
  live: boolean
  /** Stopped during idle latency (measurement.md section 10): the samples kept, of the pings sent. */
  stopped?: { samples: number; pings: number } | null
}

function pathText(input: IdleInput, t: Wording['t']): string {
  if (input.idle.path === 'websocket') {
    return t('test.tiles.pathWebsocket')
  }
  const protocol = protocolLabel(input.protocol)
  return protocol === null ? t('test.tiles.pathHttp') : t('test.tiles.pathProbe', { protocol })
}

/** Idle latency: the median, with min and p90, the path and the probe timeouts. */
export function idleTile(input: IdleInput | null, context: Wording): TileView {
  const { t, locale } = context
  const tile = blank(t('test.tiles.idle'), Activity, SERIES.latency)
  if (input === null) {
    return tile
  }
  const { idle, resolutionMs } = input
  const ms = (value: number | undefined) => (value === undefined ? t('test.tiles.empty') : latencyNumber(value, locale, resolutionMs))
  const loss = idle.lossPercent === undefined ? null : formatPercent(idle.lossPercent, locale)
  const path = pathText(input, t)
  if (idle.medianMs === undefined) {
    return input.live ? { ...tile, pill: pills.live(t) } : { ...tile, lines: [{ text: t('test.tiles.unavailable') }, { text: t('test.tiles.pathLoss', { path, loss: loss ?? t('test.tiles.empty') }) }] }
  }
  const pill = input.live ? pills.live(t) : input.stopped ? pills.partial(t) : null
  const line = input.stopped
    ? t('test.tiles.idlePartial', { k: input.stopped.samples, n: input.stopped.pings, path })
    : t('test.tiles.idleLine', { min: ms(idle.minMs), p90: ms(idle.p90Ms), path, loss: loss ?? t('test.tiles.empty') })
  return { ...tile, pill, number: latencyNumber(idle.medianMs, locale, resolutionMs), unit: 'ms', lines: [{ text: line }] }
}

/** Idle latency that ended with an error: how far it came. */
export function idleErrorTile(progress: { pings: number; count: number }, context: Wording): TileView {
  const { t } = context
  const tile = blank(t('test.tiles.idle'), Activity, SERIES.latency)
  return { ...tile, pill: pills.error(t), lines: [{ text: t('test.tiles.idleError', { n: progress.pings, count: progress.count }), tone: 'danger' }] }
}

/** Jitter: the mean of consecutive differences of the idle samples. */
export function jitterTile(input: IdleInput | null, context: Wording): TileView {
  const { t, locale } = context
  const tile = blank(t('test.tiles.jitter'), Activity, SERIES.latency)
  if (input?.idle.jitterMs === undefined) {
    return tile
  }
  const pill = input.live ? pills.live(t) : input.stopped ? pills.partial(t) : null
  return { ...tile, pill, number: latencyNumber(input.idle.jitterMs, locale, input.resolutionMs), unit: 'ms', lines: [{ text: t('test.tiles.jitterNote') }] }
}

export function dataTile(bytes: number | null, context: Wording): TileView {
  const tile = blank(context.t('test.tiles.data'), Database, SERIES.neutral)
  return bytes === null ? tile : { ...tile, ...bytesParts(bytes, context.locale) }
}

export function durationTile(ms: number | null, context: Wording): TileView {
  const tile = blank(context.t('test.tiles.duration'), Timer, SERIES.neutral)
  return ms === null ? tile : { ...tile, number: secondsNumber(ms, context.locale), unit: 's' }
}

/** The browser row of the Test and Session cards: family, major version and operating system, a dash when unrecognized. */
export function browserRow(browser: BrowserIdentity, context: Wording): MetaRow {
  const value = browser.name === 'unknown' ? null : context.t('test.tiles.browserValue', { name: browser.name, major: browser.major, os: browser.os })
  return { key: 'browser', icon: Globe, label: context.t('test.tiles.browser'), value }
}
