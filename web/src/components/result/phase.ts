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

import type { ChartModel, Span } from '@/components/chart/series'
import { seriesCells } from '@/components/result/windowTable'
import type { DirectionResult } from '@/engine/messages'

// What a Result detail chart draws (ui/screens.md section 2, design_system/components/charts
// PhaseChart.jsx), from the stored result: a direction's steady-window cells on its own series
// timeline, each at its start with unknown cells as gaps and the last held to the window end, the
// warm-up as an excluded interval from 0, its event marks, and its loaded-latency samples, already
// on that timeline, for the second scale; or the idle latency samples by ping number. Times are in
// seconds.

export interface PhaseModel {
  x: number[]
  /** Rates in the display unit (bit/s or B/s), or round-trip times in ms; null is unknown. */
  y: (number | null)[]
  xMax: number
  /** Where warm-up ends; null where none is drawn. */
  warmupEnd: number | null
  gaps: Span[]
  marks: ChartModel['marks']
  /** The loaded-latency samples for the second scale; null without any. */
  latency: { at: number; ms: number }[] | null
  /** A Continuous run's: its time axis ticks in seconds, minutes, hours or days. */
  continuous?: true
}

const seconds = (ms: number) => ms / 1000

/**
 * Whether a Continuous direction's stored series is its last 7 days alone (measurement.md section
 * 15): the engine starts it at the warm-up end unless the long ring dropped its first cells.
 */
export function cutSeries(direction: DirectionResult): boolean {
  const series = direction.series
  return series !== undefined && series.firstCellMs > series.warmupEndMs
}

/** A direction's chart, or null when it stored no series; `continuous` ticks its axis for a long run. */
export function directionModel(direction: DirectionResult, units: 'bits' | 'bytes', continuous = false): PhaseModel | null {
  const series = direction.series
  if (series === undefined) {
    return null
  }
  const cells = seriesCells(series)
  // A cell's rate is its bytes over its known time.
  const rate = (bytes: number | null, ms: number) => (bytes === null ? null : ((units === 'bits' ? bytes * 8 : bytes) * 1000) / ms)
  const x = cells.map((cell) => seconds(cell.fromMs))
  const y = cells.map((cell) => rate(cell.bytes, cell.knownMs))
  // One more point closes the last cell, so it keeps its width.
  x.push(seconds(series.endMs))
  y.push(y.at(-1) ?? null)
  const gaps: Span[] = []
  let open: Span | null = null
  for (const cell of cells) {
    if (cell.bytes !== null) {
      open = null
    } else if (open === null) {
      open = { from: seconds(cell.fromMs), to: seconds(cell.toMs) }
      gaps.push(open)
    } else {
      open.to = seconds(cell.toMs)
    }
  }
  const marks: ChartModel['marks'] = direction.events.flatMap((event): ChartModel['marks'] => {
    if (event.code === 'failure-gap') {
      return []
    }
    return event.code === 'error' ? [{ at: seconds(event.atMs), code: event.code, notice: event.notice }] : [{ at: seconds(event.atMs), code: event.code }]
  })
  const loaded = direction.loadedLatency
  const latency = loaded !== undefined && 'series' in loaded && loaded.series.length > 0 ? loaded.series.map((ping) => ({ at: seconds(ping.atMs), ms: ping.rttMs })) : null
  const end = Math.max(seconds(series.endMs), ...marks.map((mark) => mark.at))
  // A Continuous series of its last 7 days alone holds no warm-up to draw.
  const warmupEnd = series.warmupEndMs > 0 && !(continuous && cutSeries(direction)) ? seconds(series.warmupEndMs) : null
  return { x, y, xMax: end, warmupEnd, gaps, marks, latency, ...(continuous ? { continuous: true as const } : {}) }
}

/** The idle latency samples by ping number, from 1, in send order. */
export function idleModel(samples: readonly number[]): PhaseModel {
  return { x: samples.map((_, index) => index + 1), y: [...samples], xMax: Math.max(1, samples.length), warmupEnd: null, gaps: [], marks: [], latency: null }
}
