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

import { Activity, ArrowDown, ArrowUp } from '@lucide/vue'
import type { Component } from 'vue'

import { markLabel } from '@/components/chart/text'
import { stoppedAt } from '@/components/result/parameters'
import { cutSeries, directionModel, idleModel, type PhaseModel } from '@/components/result/phase'
import { pingGroups, windowTable } from '@/components/result/windowTable'
import type { Wording } from '@/components/test/wording'
import type { Direction, DirectionResult, IdleResult, Result } from '@/engine/messages'
import { clockTime, formatDuration, formatLatency, formatLimit, formatPercent, formatRate, formatSpan, secondsNumber } from '@/lib/format'

// The Result detail's per-phase charts (ui/screens.md section 2): one card per direction that
// stored a series, in the run's order, and one for the idle latency samples, each with its meta
// line, its summary for assistive technology, its key and the table that is its text alternative.
// A Continuous run's names how long it ran, its stored cells, and that only its last 7 days were
// saved when it ran longer (measurement.md section 15).

const DASH = '—'

export interface ChartCard {
  key: Direction | 'idle'
  title: string
  icon: Component
  /** The icon's color token. */
  color: string
  meta: string
  summary: string
  warmup: string | null
  gap: string | null
  model: PhaseModel
  table: { label: string; columns: string[]; rows: string[][]; foot: string }
}

function summary(title: string, meta: string, model: PhaseModel, wording: Wording): string {
  const { t } = wording
  let text = t('result.charts.summary', { title, meta })
  if (model.warmupEnd !== null) {
    text += t('result.charts.warmupExcluded')
  }
  if (model.latency !== null) {
    text += t('result.charts.latencyAxis')
  }
  if (model.marks.length > 0) {
    text += t('result.charts.events', { marks: model.marks.map((mark) => markLabel(mark, wording, { continuous: model.continuous === true })).join(', ') })
  }
  return text
}

// The gaps' legend entry: what a failure gap is and where, as the kit's PhaseChart names it; unknown
// cells alone have no reason to give.
function gapLegend(part: DirectionResult, model: PhaseModel, wording: Wording): string | null {
  const { t, locale } = wording
  const failures = part.events.flatMap((event) => (event.code === 'failure-gap' ? [t('result.charts.gapSpan', { from: secondsNumber(event.startMs, locale), to: secondsNumber(event.endMs, locale) })] : []))
  if (failures.length > 0) {
    return t('result.charts.failedGap', { spans: failures.join(', ') })
  }
  return model.gaps.length === 0 ? null : t('result.charts.gap')
}

/**
 * A Continuous direction's meta: how long it ran, that only its last 7 days were saved when it ran
 * longer, the size of its stored cells when coarser than the 2 s windows, and its streams.
 */
function continuousMeta(part: DirectionResult, endMs: number, size: string | null, { t, locale }: Wording): string {
  const parts = [formatSpan(endMs, locale), ...(cutSeries(part) ? [t('result.charts.lastSevenDays')] : []), ...(size === null ? [] : [t('result.charts.cells', { size })]), t('result.charts.streams', { n: part.streams }, part.streams)]
  return parts.join(' · ')
}

function directionCard(direction: Direction, part: DirectionResult, result: Result, units: 'bits' | 'bytes', wording: Wording): ChartCard | null {
  const { t, locale } = wording
  const continuous = result.settings.preset === 'continuous'
  const model = directionModel(part, units, continuous)
  if (model === null || part.series === undefined) {
    return null
  }
  const series = part.series
  const title = direction === 'download' ? t('result.charts.download') : t('result.charts.upload')
  const loaded = part.loadedLatency
  const table = windowTable(series, loaded !== undefined && 'series' in loaded ? loaded.series : [])
  // A Continuous run's cells are minutes or longer, their spans on its clock.
  const size = table.cellMs === null ? null : continuous ? formatSpan(table.cellMs, locale) : formatLimit(table.cellMs, locale)
  // A bounded direction the user stopped ran to its stop, the instant the Test screen and the
  // parameters name; a Continuous stop is its normal end, which its series ends at.
  const duration = stoppedAt(result, direction) ?? series.endMs
  const meta = continuous ? continuousMeta(part, series.endMs, size, wording) : t('result.charts.meta', { duration: formatDuration(duration, locale), n: part.streams }, part.streams)
  const resolution = result.client.timerResolutionMs
  const span = (fromMs: number, toMs: number) =>
    continuous && table.cellMs !== null ? t('result.charts.clockSpan', { from: clockTime(fromMs, locale), to: clockTime(toMs, locale) }) : t('result.charts.span', { from: secondsNumber(fromMs, locale), to: secondsNumber(toMs, locale) })
  const rows = table.rows.map((row) => [
    span(row.fromMs, row.toMs),
    formatDuration(row.knownMs, locale),
    row.bitsPerSecond === null ? DASH : formatRate(row.bitsPerSecond, units, locale),
    row.latencyMs === null ? DASH : formatLatency(row.latencyMs, locale, resolution),
  ])
  const at = secondsNumber(series.warmupEndMs, locale)
  const overhead = result.settings.overheadCompensationPercent
  const notes = overhead > 0 ? ` ${t('result.charts.overhead', { percent: formatPercent(overhead, locale) })}` : ''
  // A cut series starts past the warm-up end: its foot names the 7 days it kept instead (ResultDetail.jsx).
  const cut = continuous && size !== null && cutSeries(part)
  const foot = size === null ? t('result.charts.foot', { at }) : cut ? t('result.charts.cutFoot', { size, span: formatSpan(series.endMs, locale), from: clockTime(series.firstCellMs, locale) }) : t('result.charts.cellsFoot', { size, at })
  return {
    key: direction,
    title,
    icon: direction === 'download' ? ArrowDown : ArrowUp,
    color: direction === 'download' ? 'var(--series-download)' : 'var(--series-upload)',
    meta,
    summary: summary(title, meta, model, wording),
    warmup: model.warmupEnd === null ? null : t('result.charts.warmup', { end: at }),
    gap: gapLegend(part, model, wording),
    model,
    table: {
      label: title,
      columns: [size === null ? t('result.charts.columns.windows') : t('result.charts.columns.cells', { size }), t('result.charts.columns.known'), t('result.charts.columns.throughput'), t('result.charts.columns.latency')],
      rows,
      foot: foot + notes,
    },
  }
}

function idleCard(idle: IdleResult, resolution: number, wording: Wording): ChartCard {
  const { t, locale } = wording
  const n = idle.samples.length
  const ms = (value: number) => formatLatency(value, locale, resolution)
  const title = t('result.charts.idle')
  const meta = idle.medianMs === undefined ? t('result.charts.idleCount', { n }, n) : t('result.charts.idleMeta', { n, median: ms(idle.medianMs) }, n)
  const model = idleModel(idle.samples)
  return {
    key: 'idle',
    title,
    icon: Activity,
    color: 'var(--series-latency)',
    meta,
    summary: summary(title, meta, model, wording),
    warmup: null,
    gap: null,
    model,
    table: {
      label: title,
      columns: [t('result.charts.columns.pings'), t('result.charts.columns.median'), t('result.charts.columns.min'), t('result.charts.columns.max')],
      rows: pingGroups(idle.samples).map((group) => [t('result.charts.pingSpan', { first: group.first, last: group.last }), ms(group.medianMs), ms(group.minMs), ms(group.maxMs)]),
      foot: t('result.charts.idleFoot'),
    },
  }
}

/** The charts of a result: each direction with a stored series, then the idle latency samples. */
export function chartCards(result: Result, units: 'bits' | 'bytes', wording: Wording): ChartCard[] {
  const directions = result.settings.phases.filter((phase): phase is Direction => phase !== 'idle')
  const cards = directions.flatMap((direction) => {
    const part = result[direction]
    const card = part === undefined ? null : directionCard(direction, part, result, units, wording)
    return card === null ? [] : [card]
  })
  const idle = result.idle
  return idle === undefined || idle.samples.length === 0 ? cards : [...cards, idleCard(idle, result.client.timerResolutionMs, wording)]
}
