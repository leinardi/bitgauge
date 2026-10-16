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

import type uPlot from 'uplot'

import type { ChartPalette } from '@/components/chart/palette'

// What a chart's canvas draws besides its series (design_system/components/charts/Chart.jsx), in
// uPlot's hooks: the gridlines, the warm-up bands, the phase separators, the marks, the "now" line
// and the dot at the end of the last series. Positions come from uPlot's scales, in canvas pixels.

const dpr = () => (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)

/** A crisp 1-pixel line sits on a pixel's middle. */
const crisp = (position: number) => Math.round(position) + 0.5

function line(u: uPlot, from: [number, number], to: [number, number], color: string, width: number, dash: readonly number[] = []): void {
  const { ctx } = u
  const scale = dpr()
  ctx.strokeStyle = color
  ctx.lineWidth = width * scale
  ctx.setLineDash(dash.map((length) => length * scale))
  ctx.beginPath()
  ctx.moveTo(...from)
  ctx.lineTo(...to)
  ctx.stroke()
}

/** A vertical line across the plot at time `at`. */
export function drawRule(u: uPlot, at: number, color: string, width: number, dash: readonly number[] = []): void {
  const x = crisp(u.valToPos(at, 'x', true))
  const { top, height } = u.bbox
  line(u, [x, top], [x, top + height], color, width, dash)
}

/** A horizontal gridline at each value. */
export function drawGrid(u: uPlot, values: readonly number[], palette: ChartPalette): void {
  const { left, width } = u.bbox
  for (const value of values) {
    const y = crisp(u.valToPos(value, 'y', true))
    line(u, [left, y], [left + width, y], palette.grid, palette.stroke)
  }
}

/** A warm-up band: the band's fill over the plot's height, edged left and right in the hatch color. */
export function drawBand(u: uPlot, from: number, to: number, palette: ChartPalette): void {
  const left = u.valToPos(from, 'x', true)
  const right = u.valToPos(to, 'x', true)
  if (right <= left) {
    return
  }
  const { top, height } = u.bbox
  u.ctx.fillStyle = palette.band
  u.ctx.fillRect(left, top, right - left, height)
  drawRule(u, from, palette.hatch, palette.stroke)
  drawRule(u, to, palette.hatch, palette.stroke)
}

/** The dot that ends the last series: the card's color, ringed in the series'. */
export function drawEndDot(u: uPlot, at: number, value: number, color: string, palette: ChartPalette): void {
  const { ctx } = u
  const scale = dpr()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.arc(u.valToPos(at, 'x', true), u.valToPos(value, 'y', true), 4 * scale, 0, 2 * Math.PI)
  ctx.fillStyle = palette.surface
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 2 * scale
  ctx.stroke()
}

/** The last known point of a series, or null when it has none. */
export function lastPoint(xs: readonly number[], values: readonly (number | null | undefined)[]): [number, number] | null {
  for (let index = values.length - 1; index >= 0; index--) {
    const value = values[index]
    const at = xs[index]
    if (value !== null && value !== undefined && at !== undefined) {
      return [at, value]
    }
  }
  return null
}

/**
 * Straight lines between a series' known points, with the area under them (charts.md). An unknown
 * point is a gap, never joined across; the point before it holds its value up to where the gap
 * starts, so the last bucket before a gap keeps its width. Unknown points with nothing known after
 * them are where the series has ended, not a gap, and hold nothing.
 */
export const holdLinear: uPlot.Series.PathBuilder = (u, seriesIdx, idx0, idx1) => {
  const xs = u.data[0]
  const values = u.data[seriesIdx] ?? []
  const stroke = new Path2D()
  const fill = new Path2D()
  const base = u.valToPos(0, 'y', true)
  let lastKnown = -1
  for (let index = idx1; index >= idx0; index--) {
    if (values[index] !== null && values[index] !== undefined) {
      lastKnown = index
      break
    }
  }
  let run: [number, number][] = []
  const close = () => {
    const first = run[0]
    const last = run.at(-1)
    if (first !== undefined && last !== undefined) {
      stroke.moveTo(...first)
      fill.moveTo(first[0], base)
      for (const point of run) {
        stroke.lineTo(...point)
        fill.lineTo(...point)
      }
      fill.lineTo(last[0], base)
      fill.closePath()
    }
    run = []
  }
  for (let index = idx0; index <= lastKnown; index++) {
    const x = u.valToPos(xs[index] ?? 0, 'x', true)
    const value = values[index]
    if (value === null || value === undefined) {
      const held = run.at(-1)
      if (held !== undefined) {
        run.push([x, held[1]])
        close()
      }
      continue
    }
    run.push([x, u.valToPos(value, 'y', true)])
  }
  close()
  return { stroke, fill }
}
