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

import type { useI18n } from 'vue-i18n'

import { gradeWord } from '@/components/history/rows'
import { directions } from '@/components/result/parameters'
import { bandName, EXPERIENCES, experienceName } from '@/components/result/qualityList'
import { presetName } from '@/components/settings/changes'
import type { Bufferbloat, Direction, DirectionResult, Responsiveness, Result, ScoreBand } from '@/engine/messages'
import { formatBytes, formatDuration, formatLatency, formatPercent, formatRate, rpmNumber } from '@/lib/format'
import { protocolLabel } from '@/lib/protocol'

// Compare two results (ui/screens.md section 3, ui/flows.md section 6): the
// older by start is A and the newer B, and each change is B's against A. A rate within ±2 % of A's
// and a latency within 1 ms of A's read "same"; grades compare by their order, A+ best; any other
// difference is better or worse. A metric absent on either side is not comparable. Probe timeouts,
// data used and duration show both values without a judgment. The results are not directly
// comparable when they differ in preset, protocol or label. The HTTP loaded responsiveness of each
// direction compares its RPM as a rate is, only when both sides are measured, and each
// quality-score experience compares by band order, great best.

type Translate = ReturnType<typeof useI18n>['t']

export type Verdict = 'better' | 'worse' | 'same' | 'not-comparable'

/** The share of A's rate within which B's reads the same. */
const SAME_RATE = 0.02
/** The latency difference, in milliseconds, within which B's reads the same. */
const SAME_LATENCY_MS = 1

const GRADES: readonly Bufferbloat['grade'][] = ['A+', 'A', 'B', 'C', 'D', 'F']

/** The older result first: A and B. */
export function pair(x: Result, y: Result): [Result, Result] {
  return Date.parse(x.startedAt) <= Date.parse(y.startedAt) ? [x, y] : [y, x]
}

/** A rate change: higher is better; the change in percent of A's. */
export function rateChange(a: number | undefined, b: number | undefined): { verdict: Verdict; percent?: number } {
  if (a === undefined || b === undefined) {
    return { verdict: 'not-comparable' }
  }
  const verdict = Math.abs(b - a) <= SAME_RATE * a ? 'same' : b > a ? 'better' : 'worse'
  // A change from nothing has no percentage, only its direction.
  return a > 0 ? { verdict, percent: ((b - a) / a) * 100 } : { verdict }
}

/** A latency change: lower is better; the change in milliseconds. */
export function latencyChange(a: number | undefined, b: number | undefined): { verdict: Verdict; deltaMs?: number } {
  if (a === undefined || b === undefined) {
    return { verdict: 'not-comparable' }
  }
  const deltaMs = b - a
  return { verdict: Math.abs(deltaMs) <= SAME_LATENCY_MS ? 'same' : deltaMs < 0 ? 'better' : 'worse', deltaMs }
}

/** A grade change, by the grades' order. */
export function gradeChange(a: Bufferbloat['grade'] | undefined, b: Bufferbloat['grade'] | undefined): Verdict {
  if (a === undefined || b === undefined) {
    return 'not-comparable'
  }
  const order = GRADES.indexOf(b) - GRADES.indexOf(a)
  return order === 0 ? 'same' : order < 0 ? 'better' : 'worse'
}

const BANDS: readonly ScoreBand[] = ['bad', 'poor', 'average', 'good', 'great']

/** A band change, by the bands' order. */
export function bandChange(a: ScoreBand | undefined, b: ScoreBand | undefined): Verdict {
  if (a === undefined || b === undefined) {
    return 'not-comparable'
  }
  const order = BANDS.indexOf(b) - BANDS.indexOf(a)
  return order === 0 ? 'same' : order > 0 ? 'better' : 'worse'
}

export type Difference = 'preset' | 'protocol' | 'label'

/** What keeps the two from being directly comparable, in that order. */
export function differences(a: Result, b: Result): Difference[] {
  const kinds: [Difference, string, string][] = [
    ['preset', a.settings.preset, b.settings.preset],
    ['protocol', a.client.protocol, b.client.protocol],
    ['label', a.label, b.label],
  ]
  return kinds.filter(([, x, y]) => x !== y).map(([kind]) => kind)
}

export interface CompareRow {
  key: string
  name: string
  a: string
  b: string
  /** A parameter that differs, and whether it is one that keeps the results apart; null when equal. */
  differs?: 'apart' | 'differs' | null
  /** A metric's verdict and its change on B, or null for a row shown without a judgment. */
  verdict?: Verdict | null
  change?: string
}

export interface Comparison {
  a: Result
  b: Result
  warning: string | null
  parameters: CompareRow[]
  metrics: CompareRow[]
}

const DASH = '—'

function loaded(direction: DirectionResult | undefined): number | undefined {
  const latency = direction?.loadedLatency
  return latency !== undefined && !('status' in latency) ? latency.medianMs : undefined
}

function rpmStateWord(block: Responsiveness, t: Translate): string {
  switch (block.state) {
    case 'measured':
      return t('history.compare.rpmStates.measured')
    case 'uncertain':
      return t('history.compare.rpmStates.uncertain')
    case 'unavailable_h1':
      return protocolLabel(block.protocol) === null ? t('history.compare.rpmStates.treatedH1') : t('history.compare.rpmStates.needsH2')
    case 'unavailable_insufficient':
      return t('history.compare.rpmStates.insufficient')
  }
}

/**
 * The loaded-quality rows: a responsiveness row per direction either side has one for, the RPM
 * compared when both are measured, and a row per experience when either side has scores.
 */
function loadedQualityRows(a: Result, b: Result, locale: string, t: Translate): CompareRow[] {
  const rpmText = (block: Responsiveness | undefined) => {
    if (block === undefined) {
      return DASH
    }
    const values = { state: rpmStateWord(block, t), protocol: protocolLabel(block.protocol) ?? t('result.load.rpm.notReported') }
    return 'rpm' in block ? t('history.compare.rpmValue', { ...values, rpm: rpmNumber(block.rpm, locale) }) : t('history.compare.rpmState', values)
  }
  const measured = (block: Responsiveness | undefined) => (block?.state === 'measured' ? block.rpm : undefined)
  const rpmRow = (direction: Direction): CompareRow[] => {
    const [x, y] = [a[direction]?.responsiveness, b[direction]?.responsiveness]
    if (x === undefined && y === undefined) {
      return []
    }
    const change = rateChange(measured(x), measured(y))
    const percent = change.percent === undefined ? {} : { change: `${change.percent > 0 ? '+' : change.percent < 0 ? '−' : '±'}${formatPercent(Math.abs(change.percent), locale)}` }
    const name = direction === 'download' ? t('history.compare.rpmDownload') : t('history.compare.rpmUpload')
    return [{ key: `rpm-${direction}`, name, a: rpmText(x), b: rpmText(y), verdict: change.verdict, ...percent }]
  }
  const scored = a.scores !== undefined || b.scores !== undefined
  const band = (result: Result, experience: (typeof EXPERIENCES)[number]) => {
    const score = result.scores?.[experience]
    return score !== undefined && 'band' in score ? score.band : undefined
  }
  const wording = { t, locale }
  const bands = scored
    ? EXPERIENCES.map((experience): CompareRow => {
        const [x, y] = [band(a, experience), band(b, experience)]
        const text = (value: ScoreBand | undefined) => (value === undefined ? t('history.compare.notScored') : bandName(value, wording))
        return { key: `quality-${experience}`, name: t('history.compare.quality', { name: experienceName(experience, wording) }), a: text(x), b: text(y), verdict: bandChange(x, y) }
      })
    : []
  return [...rpmRow('download'), ...rpmRow('upload'), ...bands]
}

export function compare(x: Result, y: Result, units: 'bits' | 'bytes', locale: string, t: Translate): Comparison {
  const [a, b] = pair(x, y)
  const rate = (value: number | undefined) => (value === undefined ? DASH : formatRate(value, units, locale))
  const latency = (value: number | undefined, result: Result) => (value === undefined ? DASH : formatLatency(value, locale, result.client.timerResolutionMs))
  const signed = (value: number, text: string) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${text}`

  const label = (result: Result) => (result.label === '' ? t('history.table.noLabel') : result.label)
  const streams = (result: Result) =>
    result.settings.streams.mode === 'auto'
      ? t('history.compare.streamsAuto', { max: result.settings.streams.max })
      : result.settings.streams.mode === 'single'
        ? t('history.compare.streamsSingle')
        : // The settings keep the auto ceiling; a fixed run's count is what its directions ran.
          t('history.compare.streamsFixed', { n: directions(result).map((direction) => result[direction]?.streams).find((n) => n !== undefined && n > 0) ?? DASH })
  const browser = (result: Result) => `${result.client.browser.name} ${result.client.browser.major} · ${result.client.browser.os}`
  const cap = (result: Result) => (result.settings.dataCapBytes === null ? t('history.compare.noCap') : formatBytes(result.settings.dataCapBytes, locale))
  const kinds = differences(a, b)
  const parameter = (key: string, name: string, of: (result: Result) => string, apart = false): CompareRow => {
    const [va, vb] = [of(a), of(b)]
    return { key, name, a: va, b: vb, differs: va === vb ? null : apart ? 'apart' : 'differs' }
  }
  const parameters = [
    parameter('label', t('history.compare.label'), label, true),
    parameter('context', t('history.compare.context'), (result) => result.client.contextLabel || DASH),
    parameter('preset', t('history.compare.preset'), (result) => presetName(result.settings.preset, t), true),
    parameter('protocol', t('history.compare.protocol'), (result) => result.client.protocol || DASH, true),
    parameter('streams', t('history.compare.streams'), streams),
    parameter('cap', t('history.compare.cap'), cap),
    parameter('browser', t('history.compare.browser'), browser),
  ]

  const rateRow = (key: string, name: string, of: (result: Result) => number | undefined): CompareRow => {
    const change = rateChange(of(a), of(b))
    const percent = change.percent === undefined ? undefined : signed(change.percent, formatPercent(Math.abs(change.percent), locale))
    return { key, name, a: rate(of(a)), b: rate(of(b)), verdict: change.verdict, ...(percent === undefined ? {} : { change: percent }) }
  }
  const latencyRow = (key: string, name: string, of: (result: Result) => number | undefined): CompareRow => {
    const change = latencyChange(of(a), of(b))
    const delta = change.deltaMs === undefined ? undefined : signed(change.deltaMs, formatLatency(Math.abs(change.deltaMs), locale))
    return { key, name, a: latency(of(a), a), b: latency(of(b), b), verdict: change.verdict, ...(delta === undefined ? {} : { change: delta }) }
  }
  const grade = (result: Result) => result.bufferbloat?.grade
  const gradeText = (result: Result) => {
    const value = grade(result)
    return value === undefined ? DASH : `${value} · ${gradeWord(value, t)}`
  }
  const loss = (result: Result) => (result.idle === undefined ? DASH : formatPercent(result.idle.lossPercent, locale))
  const metrics: CompareRow[] = [
    rateRow('download', t('history.compare.download'), (result) => result.download?.bitsPerSecond),
    rateRow('upload', t('history.compare.upload'), (result) => result.upload?.bitsPerSecond),
    rateRow('peakDownload', t('history.compare.peakDownload'), (result) => result.download?.peakBitsPerSecond),
    rateRow('peakUpload', t('history.compare.peakUpload'), (result) => result.upload?.peakBitsPerSecond),
    latencyRow('idle', t('history.compare.idle'), (result) => result.idle?.medianMs),
    latencyRow('jitter', t('history.compare.jitter'), (result) => result.idle?.jitterMs),
    latencyRow('loadedDownload', t('history.compare.loadedDownload'), (result) => loaded(result.download)),
    latencyRow('loadedUpload', t('history.compare.loadedUpload'), (result) => loaded(result.upload)),
    { key: 'grade', name: t('history.compare.grade'), a: gradeText(a), b: gradeText(b), verdict: gradeChange(grade(a), grade(b)) },
    ...loadedQualityRows(a, b, locale, t),
    { key: 'loss', name: t('history.compare.loss'), a: loss(a), b: loss(b), verdict: null },
    { key: 'data', name: t('history.compare.data'), a: formatBytes(a.dataUsedBytes, locale), b: formatBytes(b.dataUsedBytes, locale), verdict: null },
    { key: 'duration', name: t('history.compare.duration'), a: formatDuration(a.durationMs, locale), b: formatDuration(b.durationMs, locale), verdict: null },
  ]

  const different = (row: CompareRow) => {
    const values = { a: row.a, b: row.b }
    return row.key === 'label' ? t('history.compare.differentLabel', values) : row.key === 'preset' ? t('history.compare.differentPreset', values) : t('history.compare.differentProtocol', values)
  }
  const apart = parameters.filter((row) => row.differs === 'apart' && kinds.includes(row.key as Difference))
  const warning = apart.length === 0 ? null : apart.map(different).join('; ')
  return { a, b, warning, parameters, metrics }
}

export function verdictWord(verdict: Verdict, t: Translate): string {
  switch (verdict) {
    case 'better':
      return t('history.compare.better')
    case 'worse':
      return t('history.compare.worse')
    case 'same':
      return t('history.compare.same')
    case 'not-comparable':
      return t('history.compare.notComparable')
  }
}

/** The comparison as plain text, for Copy comparison: the same rows, in the page's language. */
export function comparisonText(comparison: Comparison, heading: { a: string; b: string }, t: Translate): string {
  const row = (item: CompareRow) => {
    const judged = item.verdict === null || item.verdict === undefined ? '' : ` (${[item.change, verdictWord(item.verdict, t)].filter(Boolean).join(', ')})`
    return `${item.name}: ${item.a} → ${item.b}${judged}`
  }
  return [
    t('history.compare.title'),
    `A: ${heading.a}`,
    `B: ${heading.b}`,
    ...(comparison.warning === null ? [] : [`${t('history.compare.apart')} ${comparison.warning}`]),
    '',
    t('history.compare.parameters'),
    ...comparison.parameters.map(row),
    '',
    t('history.compare.results'),
    ...comparison.metrics.map(row),
  ].join('\n')
}
