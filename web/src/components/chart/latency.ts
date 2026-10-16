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

import { type ChartState, type LegendEntry } from '@/components/chart/text'
import type { Wording } from '@/components/test/wording'
import type { LatencyPoint } from '@/composables/useRunState'
import { secondsNumber } from '@/lib/format'

// The latency samples chart (ui/screens.md section 1): during idle latency the live chart draws each
// ping's round-trip time over the phase's time, a ping without one as a gap, never joined across.
// A run that stops or fails there keeps it, marked where it stopped. Nothing here is a number of
// the result: it only places what the engine sent.

/** How the run ended in idle latency, for the mark at its end. */
export type LatencyMark = 'cancelled' | 'error'

export interface LatencyChartInput {
  state: ChartState
  points: readonly LatencyPoint[]
  /** The phase's estimated duration. */
  aboutMs: number
  /** How long a failed phase ran, as its phase event carried it. */
  ranMs: number | null
  mark: LatencyMark | null
  /** What the gauge reads: its label, number and unit, or its state's title. */
  readout: string | null
}

export interface LatencyModel {
  /** x in seconds from the phase start, then each ping's RTT in ms. */
  data: [number[], (number | null)[]]
  /** The last ping, or how long a failed phase ran: the "now" of a live chart, where a stop is marked. */
  end: number
  /** The x axis runs to the phase's estimate, or further when the phase ran longer. */
  xMax: number
}

export function buildLatency({ points, aboutMs, ranMs }: Pick<LatencyChartInput, 'points' | 'aboutMs' | 'ranMs'>): LatencyModel {
  const x = points.map((point) => point.atMs / 1000)
  const end = Math.max(x.at(-1) ?? 0, (ranMs ?? 0) / 1000)
  return { data: [x, points.map((point) => point.rttMs)], end, xMax: Math.max(end, aboutMs / 1000) }
}

export function latencyLegend({ t }: Wording): LegendEntry[] {
  return [{ key: 'rtt', label: t('test.chart.legend.rtt'), color: 'var(--series-latency)', faint: false, band: false }]
}

/** Where the phase stands: its time against the estimate, or where it stopped. */
export function latencyMeta(input: LatencyChartInput, model: LatencyModel, { t, locale }: Wording): string {
  if (input.state === 'running') {
    const about = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.max(input.aboutMs, 1000) / 1000)
    return t('test.chart.latencyElapsed', { s: secondsNumber(model.end * 1000, locale), of: about })
  }
  return input.state === 'stopped' ? t('test.chart.stopped', { s: secondsNumber(model.end * 1000, locale) }) : ''
}

/** The chart's accessible name: what it shows and its mark (charts.md). */
export function latencySummary(input: LatencyChartInput, model: LatencyModel, wording: Wording): string {
  const { t } = wording
  const title = t('test.chart.latencyTitle')
  const parts = [input.readout, latencyMeta(input, model, wording)].filter((part) => part !== null && part !== '')
  const summary = t('test.chart.summary', { title, parts: parts.join(', ') })
  return input.mark === null ? summary : summary + t('test.chart.marked', { marks: latencyMarkLabel(input.mark, wording) })
}

export function latencyMarkLabel(mark: LatencyMark, { t }: Wording): string {
  return mark === 'cancelled' ? t('test.chart.marks.cancelled') : t('test.chart.marks.error')
}
