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

// The design tokens a chart's canvas paints with, read from the page since a canvas knows no CSS.

export interface ChartPalette {
  download: string
  upload: string
  sending: string
  latency: string
  band: string
  hatch: string
  grid: string
  text: string
  mark: string
  font: string
}

export function chartPalette(element: Element | null): ChartPalette {
  const style = getComputedStyle(element ?? document.documentElement)
  const token = (name: string) => style.getPropertyValue(name).trim() || 'currentColor'
  return {
    download: token('--series-download'),
    upload: token('--series-upload'),
    sending: token('--sending'),
    latency: token('--series-latency'),
    band: token('--chart-band'),
    hatch: token('--chart-hatch'),
    grid: token('--chart-grid'),
    text: token('--fg-subtle'),
    mark: token('--fg-muted'),
    font: `${token('--text-micro')} ${token('--font-mono')}`,
  }
}

/** The plot's height at a width: shorter on a narrow screen. */
export function chartHeight(width: number): number {
  return width < 600 ? 150 : 300
}
