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

import type { ChartGeometry } from '@/components/chart/geometry'

// The uPlot options both live charts share: no cursor, legend or axes of uPlot's own, the plot box
// of the chart's geometry as padding, and scales fixed from 0, or a Continuous tier's start, to
// the geometry's ends, so the series land where the gridlines and the labels over the canvas put
// them.

export function frameOptions(size: { width: number; height: number }, geometry: () => ChartGeometry, ends: () => { xMin?: number; xMax: number; yMax: number }): uPlot.Options {
  return {
    width: size.width,
    height: size.height,
    cursor: { show: false },
    legend: { show: false },
    padding: [() => geometry().top, () => geometry().width - geometry().right, () => geometry().height - geometry().bottom, () => geometry().left],
    scales: { x: { time: false, range: () => [ends().xMin ?? 0, ends().xMax] }, y: { range: () => [0, ends().yMax] } },
    axes: [{ show: false }, { show: false }],
    series: [{}],
  }
}
