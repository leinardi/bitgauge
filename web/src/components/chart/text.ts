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
import type { DirectionLive } from '@/composables/runLive'
import type { ContinuousSeries } from '@/composables/useContinuousSeries'
import type { Direction, TestSettings } from '@/engine/messages'
import { clockTime, secondsNumber } from '@/lib/format'

// What the live chart says in words (design_system/components/charts.md, Chart or table): its
// title, its legend, the meta line of where the run stands, and the summary that labels it for
// assistive technology, built from the readout the gauge shows, never a static title.

/** Where the run the chart shows stands. */
export type ChartState = 'empty' | 'running' | 'done' | 'stopped'

export interface LegendEntry {
  key: 'download' | 'upload' | 'received' | 'sending' | 'warmup' | 'rtt' | 'latency'
  label: string
  color: string
  faint: boolean
  band: boolean
  /** A dashed swatch: the loaded latency, told apart by line style as well as color. */
  dashed?: boolean
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
  /** The loaded latency is drawn on its second scale: the toggle is on and there are pings. */
  latencyShown?: boolean
  /** A Continuous run's tier rings; its meta reads its elapsed time. */
  continuous?: ContinuousSeries | null
}

const hasValue = (live: DirectionLive | null) => live !== null && live.values.some((value) => value !== null)

/** The chart's title: a Continuous run's names the session it shows. */
export function chartTitle({ state, continuous }: Pick<ChartTextInput, 'state' | 'continuous'>, { t }: Wording): string {
  return state !== 'empty' && continuous !== undefined && continuous !== null ? t('test.chart.sessionTitle') : t('test.chart.title')
}

/**
 * The series drawn and the warm-up band; an empty chart names the two directions it will draw. The
 * loaded latency's entry is its toggle, listed in every state, before its first ping too
 * (ui/screens.md section 1). A Continuous run lists its warm-up only while it is in it, or
 * stopped there: past it, the band is a sliver of the session.
 */
export function chartLegend({ state, order, live, model, continuous }: ChartTextInput, { t }: Wording): LegendEntry[] {
  const entry = (key: LegendEntry['key'], label: string, color: string, faint = false, band = false): LegendEntry => ({ key, label, color, faint, band })
  const download = entry('download', t('test.chart.legend.download'), 'var(--series-download)')
  const upload = entry('upload', t('test.chart.legend.upload'), 'var(--series-upload)')
  const latency: LegendEntry = { ...entry('latency', t('test.chart.legend.latency'), 'var(--series-latency)'), dashed: true }
  if (state === 'empty') {
    return [...order.map((direction) => (direction === 'download' ? download : upload)), latency]
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
  const pastWarmup = continuous !== undefined && continuous !== null && live[continuous.direction]?.warmupEnd !== null
  const banded = model.warmup.some((span) => span.to > span.from) && !pastWarmup
  return banded ? [...entries, latency, entry('warmup', t('test.chart.legend.warmup'), 'var(--chart-band)', false, true)] : [...entries, latency]
}

/**
 * A Continuous run's place: the elapsed time against the run length, or alone without one, then
 * how it ended, on its direction's clock: stopped by the user, at the data cap or on an error, or
 * the elapsed time alone once its run length has passed. An upload's unknown cells are gaps.
 */
function continuousMeta({ state, live, model }: ChartTextInput, series: ContinuousSeries, { t, locale }: Wording): string {
  const runLengthMs = live[series.direction]?.continuous?.runLengthMs
  const elapsed = clockTime(series.elapsedMs, locale)
  const ended = (code: MarkCode) => model.marks.some((mark) => mark.code === code)
  let meta: string
  if (state === 'running') {
    meta = runLengthMs === undefined ? t('test.chart.continuousElapsed', { elapsed }) : t('test.chart.continuousOf', { elapsed, of: clockTime(runLengthMs, locale) })
  } else if (ended('cancelled')) {
    meta = t('test.chart.continuousByYou', { elapsed })
  } else if (ended('data-cap')) {
    meta = t('test.chart.continuousDataCap', { elapsed })
  } else if (ended('error')) {
    meta = t('test.chart.continuousStopped', { elapsed })
  } else {
    meta = elapsed
  }
  return series.direction === 'upload' ? t('test.chart.unknownGaps', { meta }) : meta
}

/** Where the run stands: elapsed over the current phase's minimum, the total, or where it stopped. */
export function chartMeta(input: ChartTextInput, wording: Wording): string {
  const { state, order, live, model, durations, totalMs } = input
  const { t, locale } = wording
  const seconds = (s: number) => secondsNumber(s * 1000, locale)
  if (state !== 'empty' && input.continuous !== undefined && input.continuous !== null) {
    return continuousMeta(input, input.continuous, wording)
  }
  switch (state) {
    case 'empty':
      return ''
    case 'done':
      return totalMs === null ? '' : t('test.chart.total', { s: secondsNumber(totalMs, locale) })
    case 'stopped':
      return t('test.chart.stopped', { s: seconds(model.end) })
    case 'running': {
      const current = order.filter((direction) => live[direction] !== null).at(-1)
      const minMs = current === undefined || durations === null ? null : durations[current].minMs
      if (minMs === null) {
        return ''
      }
      // The phase's planned end reads as briefly as it is: 10 s, 15.2 s (charts.md: "7.5 s / 10 s").
      const planned = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format((model.separators.at(-1) ?? 0) + minMs / 1000)
      return t('test.chart.elapsed', { s: seconds(model.end), of: planned })
    }
  }
}

/** The time ticks' spacing on a Continuous axis of `span` seconds: whole seconds, minutes or hours, about six ticks. */
const CONTINUOUS_STEPS = [10, 30, 60, 120, 300, 600, 1200, 1800, 3600, 7200, 10800, 21600, 43200, 86400]

export function continuousStep(span: number): number {
  return CONTINUOUS_STEPS.find((step) => step * 6 >= span) ?? 86400
}

/** A Continuous axis's tick: 30s, 10m, 2h, 1d as the run's span asks. */
export function continuousTick(seconds: number, { t, locale }: Wording): string {
  const whole = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)
  if (seconds < 60) {
    return t('test.chart.seconds', { n: whole(seconds) })
  }
  if (seconds < 3600 || seconds % 3600 !== 0) {
    return t('test.chart.minutes', { n: whole(seconds / 60) })
  }
  return seconds % 86400 === 0 && seconds > 0 ? t('test.chart.days', { n: whole(seconds / 86400) }) : t('test.chart.hours', { n: whole(seconds / 3600) })
}

/** A Continuous result's tick, as the kit's Result detail writes it: 0, 20m, 1h, 1h20, 1d. */
export function continuousResultTick(seconds: number, wording: Wording): string {
  const minutes = Math.round((seconds % 3600) / 60)
  if (seconds === 0) {
    return new Intl.NumberFormat(wording.locale).format(0)
  }
  if (seconds < 3600 || seconds % 86400 === 0 || minutes === 0) {
    return continuousTick(seconds, wording)
  }
  return wording.t('test.chart.hoursMinutes', { h: Math.floor(seconds / 3600), m: String(minutes).padStart(2, '0') })
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
  const title = chartTitle(input, wording)
  if (input.state === 'empty') {
    return t('test.chart.empty', { title })
  }
  const parts = [input.readout, chartMeta(input, wording)].filter((part) => part !== null && part !== '')
  let summary = t('test.chart.summary', { title, parts: parts.join(', ') })
  if (input.model.warmup.some((span) => span.to > span.from)) {
    summary += t('test.chart.warmupShaded')
  }
  if (input.latencyShown === true && input.model.latency.length > 0) {
    summary += t('test.chart.latencyAxis')
  }
  if (input.model.marks.length > 0) {
    summary += t('test.chart.marked', { marks: input.model.marks.map((mark) => markLabel(mark, wording)).join(', ') })
  }
  return summary
}
