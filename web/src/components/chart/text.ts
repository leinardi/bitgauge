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

import type { ChartModel, MarkCode } from '@/components/chart/series'
import type { Wording } from '@/components/test/wording'
import type { DirectionLive } from '@/composables/useRunState'
import type { Direction, TestSettings } from '@/engine/messages'
import { secondsNumber } from '@/lib/format'

// What the live chart says in words (design_system/components/charts.md, Chart or table): its
// title, its legend, the meta line of where the run stands, and the summary that labels it for
// assistive technology, built from the readout the gauge shows, never a static title.

/** Where the run the chart shows stands. */
export type ChartState = 'empty' | 'running' | 'done' | 'stopped'

export interface LegendEntry {
  key: 'download' | 'upload' | 'received' | 'sending' | 'warmup' | 'rtt'
  label: string
  colour: string
  faint: boolean
  band: boolean
}

export interface ChartTextInput {
  state: ChartState
  order: readonly Direction[]
  live: Readonly<Record<Direction, DirectionLive | null>>
  model: ChartModel
  /** The phase durations the run runs with; null before they are known. */
  durations: Pick<TestSettings, 'download' | 'upload'> | null
  /** The whole run's duration, once its result is in. */
  totalMs: number | null
  /** What the gauge reads: its label, number and unit, or its state's title. */
  readout: string | null
}

const hasValue = (live: DirectionLive | null) => live !== null && live.values.some((value) => value !== null)

/** The series drawn and the warm-up band; an empty chart names the two directions it will draw. */
export function chartLegend({ state, order, live, model }: ChartTextInput, { t }: Wording): LegendEntry[] {
  const entry = (key: LegendEntry['key'], label: string, colour: string, faint = false, band = false): LegendEntry => ({ key, label, colour, faint, band })
  const download = entry('download', t('test.chart.legend.download'), 'var(--series-download)')
  const upload = entry('upload', t('test.chart.legend.upload'), 'var(--series-upload)')
  if (state === 'empty') {
    return order.map((direction) => (direction === 'download' ? download : upload))
  }
  const entries = order.flatMap((direction): LegendEntry[] => {
    const shown = live[direction]
    if (shown === null) {
      return []
    }
    if (direction === 'download') {
      return [download]
    }
    // A finished run shows what the server received; a running or stopped one also the sending line.
    if (state === 'done') {
      return [upload]
    }
    const received = hasValue(shown) ? [entry('received', t('test.chart.legend.received'), 'var(--series-upload)')] : []
    return [...received, entry('sending', t('test.chart.legend.sending'), 'var(--sending)', true)]
  })
  const banded = model.warmup.some((span) => span.to > span.from)
  return banded ? [...entries, entry('warmup', t('test.chart.legend.warmup'), 'var(--chart-band)', false, true)] : entries
}

/** Where the run stands: elapsed over the current phase's minimum, the total, or where it stopped. */
export function chartMeta({ state, order, live, model, durations, totalMs }: ChartTextInput, { t, locale }: Wording): string {
  const seconds = (s: number) => secondsNumber(s * 1000, locale)
  switch (state) {
    case 'empty':
      return ''
    case 'done':
      return totalMs === null ? '' : t('test.chart.total', { s: secondsNumber(totalMs, locale) })
    case 'stopped':
      return t('test.chart.stopped', { s: seconds(model.end) })
    case 'running': {
      const current = order.filter((direction) => live[direction] !== null).at(-1)
      if (current === undefined || durations === null) {
        return ''
      }
      const start = model.separators.at(-1) ?? 0
      return t('test.chart.elapsed', { s: seconds(model.end), of: seconds(start + durations[current].minMs / 1000) })
    }
  }
}

const MARK_LABELS: Record<MarkCode, (t: Wording['t']) => string> = {
  extended: (t) => t('test.chart.marks.extended'),
  'data-cap': (t) => t('test.chart.marks.dataCap'),
  cancelled: (t) => t('test.chart.marks.cancelled'),
  error: (t) => t('test.chart.marks.error'),
}

/** A mark's label: a failed request that ends an upload over HTTP/1.1 is named for what it is. */
export function markLabel(mark: ChartModel['marks'][number], { t }: Wording): string {
  return mark.notice === 'upload-interrupted' ? t('test.chart.marks.requestFailed') : MARK_LABELS[mark.code](t)
}

/** The chart's accessible name: what it shows, its warm-up and its marks (charts.md). */
export function chartSummary(input: ChartTextInput, wording: Wording): string {
  const { t } = wording
  const title = t('test.chart.title')
  if (input.state === 'empty') {
    return t('test.chart.empty', { title })
  }
  const parts = [input.readout, chartMeta(input, wording)].filter((part) => part !== null && part !== '')
  let summary = t('test.chart.summary', { title, parts: parts.join(', ') })
  if (input.model.warmup.some((span) => span.to > span.from)) {
    summary += t('test.chart.warmupShaded')
  }
  if (input.model.marks.length > 0) {
    summary += t('test.chart.marked', { marks: input.model.marks.map((mark) => markLabel(mark, wording)).join(', ') })
  }
  return summary
}
