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

import { Activity, ArrowDown, ArrowUp, ArrowUpDown, Database, Timer, TrendingUp } from '@lucide/vue'

import type { MetaRow } from '@/components/layout/MetaList.vue'
import { browserRow, confidenceReasons, type TileLine, type TileView } from '@/components/test/tiles'
import type { Wording } from '@/components/test/wording'
import type { DirectionLive } from '@/composables/runLive'
import type { BrowserIdentity, ContinuousSoFar, Direction, DirectionResult } from '@/engine/messages'
import { bytesParts, clockTime, formatBytes, formatLatency, formatPercent, latencyNumber, rateParts } from '@/lib/format'

// The Continuous live view (ui/screens.md section 1, ui/flows.md section 7, kit TestScreen.jsx
// states continuous, cont-upload, cont-warmup and cont-done), in place of the direction's tile:
// the current rate, the run-wide average, the "p90, last hour" with the run-wide maximum, the
// loaded latency of the last minute, and data used with its rate; then the session: the elapsed
// time against the run length with its end time, or alone without one, the run-wide minimum and
// maximum, idle latency and the browser. The rates read "—" until the engine sends them, after three fully
// known 1 s cells, never 0. Once the run has ended, the result's run-wide numbers, its
// minimum, and the loaded latency of the last hour. Nothing here is a number of its own.

const SERIES = { download: 'var(--series-download)', upload: 'var(--series-upload)', latency: 'var(--series-latency)', neutral: 'var(--fg-subtle)' }
const MINUTE_MS = 60_000

/** What the live view is given of the run. */
export interface ContinuousInput {
  direction: Direction
  units: 'bits' | 'bytes'
  /** The direction's live state; null before its first sample. */
  live: DirectionLive | null
  /** The direction's part of the ended run's result; null while it runs. */
  result: DirectionResult | null
  dataUsedBytes: number
  /** The run length, absent for a run that lasts until stopped. */
  runLengthMs?: number
  /** Idle latency's median, measured at the start; null without one. */
  idleMedianMs: number | null
  resolutionMs: number
  overheadPercent: number
  /** The clock now, for the run's end time. */
  nowMs: number
  browser: BrowserIdentity
}

export interface ContinuousView {
  tiles: TileView[]
  session: MetaRow[]
}

const blank = (label: string, icon: TileView['icon'], color: string, lines: TileLine[] = []): TileView => ({ label, icon, color, number: null, unit: '', word: null, lines, pill: null })

function rateTile(label: string, icon: TileView['icon'], color: string, bps: number | undefined, lines: TileLine[], dash: string, { units, locale }: { units: 'bits' | 'bytes'; locale: string }): TileView {
  if (bps === undefined) {
    return blank(label, icon, color, [{ text: dash }])
  }
  return { ...blank(label, icon, color, lines), ...rateParts(bps, units, locale) }
}

/** The rate tiles' numbers: the live figures while the run goes on, the result's once it has ended. */
function figures(input: ContinuousInput): Pick<ContinuousSoFar, 'avgBitsPerSecond' | 'minBitsPerSecond' | 'maxBitsPerSecond' | 'peakLastHourBitsPerSecond'> {
  const { result } = input
  if (result === null) {
    const live = input.live?.continuous ?? null
    return live === null ? {} : live
  }
  return {
    ...(result.bitsPerSecond === undefined ? {} : { avgBitsPerSecond: result.bitsPerSecond }),
    ...(result.minBitsPerSecond === undefined ? {} : { minBitsPerSecond: result.minBitsPerSecond }),
    ...(result.maxBitsPerSecond === undefined ? {} : { maxBitsPerSecond: result.maxBitsPerSecond }),
    ...(result.peakBitsPerSecond === undefined ? {} : { peakLastHourBitsPerSecond: result.peakBitsPerSecond }),
  }
}

/** The run's elapsed time on its direction's clock: the live figures', or how long the phase ran. */
function elapsedOf(input: ContinuousInput): number {
  return input.live?.continuous?.elapsedMs ?? input.live?.phaseMs ?? 0
}

/** "702 / 941 Mbit/s": the minimum without its unit when it shares the maximum's. */
function minMax(min: number | undefined, max: number | undefined, units: 'bits' | 'bytes', locale: string): string | null {
  if (min === undefined || max === undefined) {
    return null
  }
  const low = rateParts(min, units, locale)
  const high = rateParts(max, units, locale)
  return low.unit === high.unit ? `${low.number} / ${high.number} ${high.unit}` : `${low.number} ${low.unit} / ${high.number} ${high.unit}`
}

/** The qualifiers of an ended run's headline: low confidence, a CPU-bound device, overhead compensation. */
function qualifiers(input: ContinuousInput, context: Wording): TileLine[] {
  const { t, locale } = context
  const confidence = input.result?.confidence
  const lines: TileLine[] = []
  if (confidence?.level === 'low') {
    lines.push({ text: t('test.tiles.lowConfidence', { reasons: confidenceReasons(confidence.reasons, context) }), tone: 'warn' })
  } else if (confidence?.level === 'cpu-bound') {
    lines.push({ text: t('test.tiles.cpuBound'), tone: 'warn' })
  }
  if (input.overheadPercent > 0) {
    lines.push({ text: t('test.tiles.overhead', { percent: formatPercent(input.overheadPercent, locale) }) })
  }
  return lines
}

export function continuousView(input: ContinuousInput, context: Wording): ContinuousView {
  const { t, locale } = context
  const { direction, live, result, units } = input
  const ended = result !== null
  const color = SERIES[direction]
  const icon = direction === 'download' ? ArrowDown : ArrowUp
  const values = figures(input)
  const warming = live === null || live.warmupEnd === null
  // A rate the engine has not sent yet: during warm-up, then until three fully known 1 s cells.
  const dash = warming ? t('test.continuous.warmup') : t('test.continuous.known')
  const rate = { units, locale }
  const max = values.maxBitsPerSecond
  const peakLines = max === undefined ? [] : [{ text: t('test.continuous.peakSub', { max: rateParts(max, units, locale).number }) }]
  const average = rateTile(t('test.continuous.average'), icon, color, values.avgBitsPerSecond, [{ text: t('test.continuous.averageSub') }, ...(ended ? qualifiers(input, context) : [])], dash, rate)
  const peak = rateTile(t('test.continuous.peak'), TrendingUp, color, values.peakLastHourBitsPerSecond, peakLines, dash, rate)

  const loadedMs = ended ? (result.loadedLatency !== undefined && 'medianMs' in result.loadedLatency ? result.loadedLatency.medianMs : undefined) : live?.continuous?.loadedLastMinuteMedianMs
  const loaded = blank(t('test.continuous.loaded'), Activity, SERIES.latency, [{ text: ended ? t('test.continuous.loadedDone') : warming ? t('test.continuous.warmup') : t('test.continuous.loadedLive') }])
  const loadedTile = loadedMs === undefined ? loaded : { ...loaded, number: latencyNumber(loadedMs, locale, input.resolutionMs), unit: 'ms' }

  const elapsedMs = elapsedOf(input)
  const bytes = input.dataUsedBytes
  const perMinute = elapsedMs >= MINUTE_MS ? t('test.continuous.dataRate', { bytes: formatBytes((bytes * MINUTE_MS) / elapsedMs, locale) }) : null
  const data = { ...blank(t('test.tiles.data'), Database, SERIES.neutral, [{ text: warming && !ended ? t('test.continuous.warmupIncluded') : (perMinute ?? '') }]), ...(bytes === 0 ? {} : bytesParts(bytes, locale)) }

  let tiles: TileView[]
  if (ended) {
    const minimum = rateTile(t('test.continuous.minimum'), icon, color, values.minBitsPerSecond, [{ text: t('test.continuous.minimumSub') }], dash, rate)
    tiles = [average, peak, minimum, loadedTile, data]
  } else {
    const now = direction === 'download' ? live?.gauge : (live?.sending ?? undefined)
    const label = direction === 'download' ? t('test.continuous.current') : t('test.continuous.currentSending')
    const sub = direction === 'download' ? t('test.continuous.lastHalfSecond') : t('test.continuous.sendingProgress')
    const current = now === undefined || now === null ? blank(label, icon, color, [{ text: sub }]) : { ...blank(label, icon, color, [{ text: sub }]), ...rateParts(now, units, locale), pill: { text: t('test.tiles.live'), tone: 'info' as const } }
    tiles = [current, average, peak, loadedTile, data]
  }

  const length = input.runLengthMs
  const end = length === undefined ? null : new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(input.nowMs - elapsedMs + length))
  const time = clockTime(elapsedMs, locale)
  const elapsedRow: MetaRow = ended
    ? { key: 'elapsed', icon: Timer, label: t('test.continuous.duration'), sub: length === undefined ? t('test.continuous.ran') : t('test.continuous.planned', { length: clockTime(length, locale) }), value: time }
    : { key: 'elapsed', icon: Timer, label: t('test.continuous.elapsed'), sub: length === undefined || end === null ? t('test.continuous.noRunLength') : t('test.continuous.runLength', { length: clockTime(length, locale), end }), value: time }
  const directionWord = direction === 'download' ? t('test.continuous.download') : t('test.continuous.upload')
  const session: MetaRow[] = [
    elapsedRow,
    { key: 'min-max', icon: ArrowUpDown, label: t('test.continuous.minMax'), sub: t('test.continuous.minMaxSub', { direction: directionWord }), value: minMax(values.minBitsPerSecond, values.maxBitsPerSecond, units, locale) },
    { key: 'idle', icon: Activity, label: t('test.continuous.idle'), sub: t('test.continuous.idleSub'), value: input.idleMedianMs === null ? null : formatLatency(input.idleMedianMs, locale, input.resolutionMs) },
    browserRow(input.browser, context),
  ]
  return { tiles, session }
}
