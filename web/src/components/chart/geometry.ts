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

import { latencyAxisLabels } from '@/lib/format'

// Where a chart's parts sit (design_system/components/charts/Chart.jsx chartGeometry): the plot
// box inside the chart's size, a value scale that ends on a round number, five gridlines at the
// quarters of it with their labels, and the time ticks. Pure, so uPlot draws the series into the
// same box the labels and the hooks use.

/** The plot box's margins, in CSS pixels: a gutter for the value labels on the left, room for the time labels below. */
const TOP = 10
const RIGHT = 12
const BOTTOM = 22
const LEFT_MIN = 44
/** The narrowest gutter right of the plot for a second value scale's labels. */
const RIGHT_MIN = 40
/** The width of a character of the axis labels (mono, --text-nano), to size the label gutter to the longest label. */
const LABEL_CHAR = 6.7
const LABEL_PAD = 14
/** Where a value label ends, left of the plot, and how far below its gridline its baseline sits. */
const LABEL_GAP = 8
const LABEL_DROP = 3.5
/** Where the time labels sit, above the chart's bottom edge. */
const TICK_RISE = 6

const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

/** The smallest round number at or above `value`: 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 times a power of ten. */
export function niceMax(value: number): number {
  const decade = 10 ** Math.floor(Math.log10(value))
  return (NICE.find((multiple) => multiple * decade >= value) ?? 10) * decade
}

/**
 * The loaded latency's second scale (Chart.jsx, latMax): its top well above the largest sample, so
 * the line runs under the series' peaks, and its labels at 0, the middle and the top; null without
 * samples.
 */
export function latencyScale(samples: readonly { ms: number }[], locale: string): { top: number; labels: string[] } | null {
  if (samples.length === 0) {
    return null
  }
  const top = niceMax(Math.max(1, ...samples.map((sample) => sample.ms)) * 1.9)
  const labels = latencyAxisLabels(top, locale)
  return { top, labels: [labels[0] ?? '', labels[2] ?? '', labels[4] ?? ''] }
}

/** The value scale's top over a chart's largest value: 8 % of headroom, rounded up. */
export function valueMax(largest: number): number {
  return niceMax(Math.max(1, largest) * 1.08)
}

export interface Label {
  x: number
  y: number
  text: string
}

export interface ChartGeometry {
  width: number
  height: number
  /** The plot box. */
  left: number
  right: number
  top: number
  bottom: number
  /** One gridline per quarter of the value scale, bottom first; the label sits at its left. */
  grid: { y: number; label: Label }[]
  /** The time ticks, from 0. */
  ticks: Label[]
  /** A second value scale's labels right of the plot, bottom first, at 0, half and the whole of it. */
  grid2: Label[]
  /** A time (s) and a value as positions in the chart. */
  x: (seconds: number) => number
  y: (value: number) => number
}

export interface GeometryInput {
  width: number
  height: number
  /** The time axis's end, in seconds. */
  xMax: number
  /** The value scale's top. */
  yMax: number
  /** The five value labels, at 0 and each quarter of yMax (rateAxisLabels, latencyAxisLabels). */
  yLabels: readonly string[]
  /** A time tick's label. */
  xLabel: (seconds: number) => string
  /** The compact layout spaces the time ticks wider on a long axis. */
  compact: boolean
  /** A second value scale's three labels, at 0, half and the whole of it, in a gutter right of the plot. */
  y2Labels?: readonly string[]
}

function tickStep(xMax: number, compact: boolean): number {
  if (compact && xMax > 20) {
    return xMax > 40 ? 18 : 8
  }
  const step = niceMax(xMax / 6)
  return step > 0 && Number.isFinite(step) ? step : Math.max(xMax, 1)
}

const gutter = (labels: readonly string[], least: number) => Math.max(least, Math.ceil(Math.max(...labels.map((label) => label.length)) * LABEL_CHAR) + LABEL_PAD)

export function chartGeometry({ width, height, xMax, yMax, yLabels, xLabel, compact, y2Labels = [] }: GeometryInput): ChartGeometry {
  const left = gutter(yLabels, LEFT_MIN)
  const right = width - (y2Labels.length === 0 ? RIGHT : gutter(y2Labels, RIGHT_MIN))
  const bottom = height - BOTTOM
  const x = (seconds: number) => left + ((right - left) * seconds) / xMax
  const y = (value: number) => TOP + (bottom - TOP) * (1 - value / yMax)
  const grid = yLabels.map((text, index) => {
    const at = y((yMax * index) / (yLabels.length - 1))
    return { y: at, label: { x: left - LABEL_GAP, y: at + LABEL_DROP, text } }
  })
  const step = tickStep(xMax, compact)
  const ticks: Label[] = []
  for (let seconds = 0; seconds <= xMax + 1e-9; seconds += step) {
    ticks.push({ x: x(seconds), y: height - TICK_RISE, text: xLabel(Math.round(seconds * 10) / 10) })
  }
  const grid2 = y2Labels.map((text, index) => ({ x: right + LABEL_GAP, y: TOP + (bottom - TOP) * (1 - index / Math.max(1, y2Labels.length - 1)) + LABEL_DROP, text }))
  return { width, height, left, right, top: TOP, bottom, grid, ticks, grid2, x, y }
}
