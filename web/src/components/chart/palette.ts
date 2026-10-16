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

// The design tokens a chart's canvas paints with, read from the page since a canvas knows no CSS
// (design_system/components/charts/charts.css).

export interface ChartPalette {
  download: string
  upload: string
  sending: string
  latency: string
  band: string
  hatch: string
  grid: string
  /** Phase separators. */
  separator: string
  mark: string
  now: string
  /** The end dot's fill: the card the chart sits on. */
  surface: string
  /** Line widths and dash patterns, in CSS pixels. */
  stroke: number
  strokeMark: number
  dashSeparator: number[]
  dashMark: number[]
  nowOpacity: number
}

export function chartPalette(element: Element | null): ChartPalette {
  const style = getComputedStyle(element ?? document.documentElement)
  const token = (name: string) => style.getPropertyValue(name).trim()
  const color = (name: string) => token(name) || 'currentColor'
  const numbers = (name: string, fallback: number[]) => {
    const values = token(name).split(/\s+/).map(Number).filter((value) => Number.isFinite(value) && value > 0)
    return values.length === 0 ? fallback : values
  }
  const number = (name: string, fallback: number) => numbers(name, [fallback])[0] ?? fallback
  return {
    download: color('--series-download'),
    upload: color('--series-upload'),
    sending: color('--sending'),
    latency: color('--series-latency'),
    band: color('--chart-band'),
    hatch: color('--chart-hatch'),
    grid: color('--chart-grid'),
    separator: color('--border-default'),
    mark: color('--fg-muted'),
    now: color('--fg-subtle'),
    surface: color('--surface-2'),
    stroke: number('--chart-stroke', 1),
    strokeMark: number('--chart-stroke-mark', 1.5),
    dashSeparator: numbers('--chart-dash-sep', [2, 3]),
    dashMark: numbers('--chart-dash-mark', [3, 3]),
    nowOpacity: number('--chart-now-opacity', 0.5),
  }
}

/** The plot's height: shorter in the compact layout, below the desktop breakpoint. */
export function chartHeight(compact: boolean): number {
  return compact ? 150 : 300
}

/** A color at a share of its strength, for the area under a series and the faint sending line. */
export function faded(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`
}
