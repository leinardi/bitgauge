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

import { Activity, ArrowDown, ArrowUp, Database, Signal, Timer } from '@lucide/vue'
import type { Component } from 'vue'

import type { ConfidenceReason, Direction, DirectionResult, IdleResult, Plateau, SteadySoFar } from '@/engine/messages'
import type { Wording } from '@/components/test/wording'
import { bytesParts, formatLatency, formatPercent, formatRate, latencyNumber, rateParts, secondsNumber } from '@/lib/format'

// The metric tiles' contents (ui/screens.md section 6, design_system/components/tiles.md), worded
// from what the engine sent: a live direction's steady numbers so far, or the result's fields. The
// error, partial-without-a-window and insufficient-data states never show a number.

export interface TileLine {
  text: string
  tone?: 'warn' | 'danger'
}

export interface TileView {
  label: string
  icon: Component
  /** The icon's colour token. */
  colour: string
  /** The number, or null for "—". */
  number: string | null
  unit: string
  lines: TileLine[]
  /** A live tile is tagged as such. */
  live: boolean
}

const SERIES = { download: 'var(--series-download)', upload: 'var(--series-upload)', latency: 'var(--series-latency)', neutral: 'var(--fg-subtle)' }

/** A direction's confidence reasons as a list in words: ramp unsettled and unstable. */
export function confidenceReasons(list: readonly ConfidenceReason[], { t, locale }: Wording): string {
  const words = list.map((reason) =>
    reason === 'ramp-unsettled' ? t('test.tiles.reasons.rampUnsettled') : reason === 'insufficient-samples' ? t('test.tiles.reasons.insufficientSamples') : t('test.tiles.reasons.unstable'),
  )
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(words)
}

function plateau(kind: Plateau, streams: string, { t }: Wording): string {
  return kind === 'no-gain' ? t('test.tiles.plateau.noGain', { streams }) : kind === 'cap' ? t('test.tiles.plateau.cap', { streams }) : t('test.tiles.plateau.floorLimited', { streams })
}

/** What ended a direction with an error, from its error event (tiles.md: "error · connection lost"). */
function errorCause(result: DirectionResult, t: Wording['t']): string {
  const event = result.events.find((entry) => entry.code === 'error')
  switch (event?.code === 'error' ? event.notice : null) {
    case 'requests-failed':
      return t('test.tiles.errorCause.requestsFailed')
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

/** What a direction tile is given: the run's live numbers while it runs, then the result's. */
export interface DirectionInput {
  direction: Direction
  units: 'bits' | 'bytes'
  /** While the direction runs: its steady numbers so far, null while warming up. */
  live?: { steady: SteadySoFar | null } | null
  result?: DirectionResult | null
  overheadPercent?: number
}

export function directionTile(input: DirectionInput, context: Wording): TileView {
  const { t, locale } = context
  const tile: TileView = {
    label: input.direction === 'download' ? t('test.tiles.download') : t('test.tiles.upload'),
    icon: input.direction === 'download' ? ArrowDown : ArrowUp,
    colour: SERIES[input.direction],
    number: null,
    unit: '',
    lines: [],
    live: false,
  }
  const rate = (bps: number) => formatRate(bps, input.units, locale)
  const result = input.result ?? null
  if (result === null) {
    if (input.live === undefined || input.live === null) {
      return tile
    }
    const steady = input.live.steady
    if (steady === null) {
      return { ...tile, live: true, lines: [{ text: t('test.tiles.warmingUp') }] }
    }
    const { number, unit } = rateParts(steady.avgBitsPerSecond, input.units, locale)
    return { ...tile, live: true, number, unit, lines: [{ text: t('test.tiles.soFar', { avg: rate(steady.avgBitsPerSecond), peak: rate(steady.peakBitsPerSecond) }) }] }
  }
  switch (result.status) {
    case 'insufficient-data':
      return { ...tile, lines: [{ text: t('test.tiles.insufficient') }] }
    case 'skipped':
      return { ...tile, lines: [{ text: t('test.tiles.skipped') }] }
    case 'error':
      return { ...tile, lines: [{ text: errorCause(result, t), tone: 'danger' }] }
    case 'partial':
    case 'measured':
      break
  }
  const lines: TileLine[] = []
  if (result.status === 'partial') {
    lines.push({ text: t('test.tiles.partial') })
  }
  if (result.bitsPerSecond === undefined) {
    return { ...tile, lines: [...lines, { text: t('test.tiles.insufficient') }] }
  }
  if (result.peakBitsPerSecond !== undefined) {
    lines.push({ text: t('test.tiles.peak', { peak: rate(result.peakBitsPerSecond) }) })
  }
  if (result.confidence?.level === 'cpu-bound') {
    lines.push({ text: t('test.tiles.cpuBound'), tone: 'warn' })
  } else if (result.confidence?.level === 'low') {
    lines.push({ text: t('test.tiles.lowConfidence', { reasons: confidenceReasons(result.confidence.reasons, context) }), tone: 'warn' })
  }
  const streams = t('test.tiles.streams', { n: result.streams }, result.streams)
  lines.push({ text: result.plateau === undefined ? streams : plateau(result.plateau, streams, context) })
  if ((input.overheadPercent ?? 0) > 0) {
    lines.push({ text: t('test.tiles.overhead', { percent: formatPercent(input.overheadPercent ?? 0, locale) }) })
  }
  const { number, unit } = rateParts(result.bitsPerSecond, input.units, locale)
  return { ...tile, number, unit, lines }
}

/** Idle latency: the median, with min and p90, the path and the probe timeouts. */
export function idleTile(idle: IdleResult | null | undefined, resolutionMs: number, context: Wording): TileView {
  const { t, locale } = context
  const tile: TileView = { label: t('test.tiles.idle'), icon: Activity, colour: SERIES.latency, number: null, unit: '', lines: [], live: false }
  if (idle === null || idle === undefined) {
    return tile
  }
  const loss = formatPercent(idle.lossPercent, locale)
  const path = idle.path === 'websocket' ? t('test.tiles.pathWebsocket', { loss }) : t('test.tiles.pathHttp', { loss })
  if (idle.medianMs === undefined) {
    return { ...tile, lines: [{ text: t('test.tiles.unavailable') }, { text: path }] }
  }
  const ms = (value: number | undefined) => (value === undefined ? t('test.tiles.empty') : formatLatency(value, locale, resolutionMs))
  return {
    ...tile,
    number: latencyNumber(idle.medianMs, locale, resolutionMs),
    unit: 'ms',
    lines: [{ text: t('test.tiles.idleStats', { min: ms(idle.minMs), p90: ms(idle.p90Ms) }) }, { text: path }],
  }
}

/** Jitter: the mean of consecutive differences of the idle samples. */
export function jitterTile(idle: IdleResult | null | undefined, resolutionMs: number, context: Wording): TileView {
  const { t, locale } = context
  const tile: TileView = { label: t('test.tiles.jitter'), icon: Activity, colour: SERIES.latency, number: null, unit: '', lines: [], live: false }
  if (idle?.jitterMs === undefined) {
    return tile
  }
  return { ...tile, number: latencyNumber(idle.jitterMs, locale, resolutionMs), unit: 'ms', lines: [{ text: t('test.tiles.jitterNote') }] }
}

export function dataTile(bytes: number | null, context: Wording): TileView {
  const tile: TileView = { label: context.t('test.tiles.data'), icon: Database, colour: SERIES.neutral, number: null, unit: '', lines: [], live: false }
  return bytes === null ? tile : { ...tile, ...bytesParts(bytes, context.locale) }
}

export function durationTile(ms: number | null, context: Wording): TileView {
  const tile: TileView = { label: context.t('test.tiles.duration'), icon: Timer, colour: SERIES.neutral, number: null, unit: '', lines: [], live: false }
  return ms === null ? tile : { ...tile, number: secondsNumber(ms, context.locale), unit: 's' }
}

/** The packet-loss slot: never a number, since a browser cannot see packet loss over TCP. */
export function packetLossTile(context: Wording): TileView {
  return { label: context.t('test.tiles.packetLoss'), icon: Signal, colour: SERIES.neutral, number: null, unit: '', lines: [{ text: context.t('test.tiles.notMeasured') }], live: false }
}
