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

// Where a chart's parts sit, as the export's chartGeometry places them.

import { describe, expect, it } from 'vitest'

import { chartGeometry, niceMax, valueMax } from '@/components/chart/geometry'

const LABELS = ['0', '200', '400', '600', '800 Mbit/s']

describe('niceMax', () => {
  it.each([
    [1, 1],
    [1.1, 1.2],
    [661, 800],
    [9.1, 10],
    [0.31, 0.4],
  ])('rounds %d up to %d', (value, nice) => {
    expect(niceMax(value)).toBeCloseTo(nice)
  })

  it('leaves 8 % of headroom over the largest value', () => {
    expect(valueMax(612e6)).toBe(8e8)
    expect(valueMax(0)).toBeCloseTo(1.2)
  })
})

describe('chartGeometry', () => {
  const geometry = chartGeometry({ width: 672, height: 300, xMax: 26, yMax: 8e8, yLabels: LABELS, xLabel: (s) => `${s}s`, compact: false })

  it('sizes the label gutter to the top label and leaves room for the time labels', () => {
    expect([geometry.left, geometry.right, geometry.top, geometry.bottom]).toEqual([81, 660, 10, 278])
  })

  it('draws a gridline at each quarter, labeled left of it', () => {
    expect(geometry.grid.map((line) => [line.y, line.label.x, line.label.text])).toEqual([
      [278, 73, '0'],
      [211, 73, '200'],
      [144, 73, '400'],
      [77, 73, '600'],
      [10, 73, '800 Mbit/s'],
    ])
  })

  it('ticks the time axis in round steps, wider in the compact layout', () => {
    expect(geometry.ticks.map((tick) => tick.text)).toEqual(['0s', '5s', '10s', '15s', '20s', '25s'])
    const narrow = chartGeometry({ width: 311, height: 150, xMax: 26, yMax: 8e8, yLabels: LABELS, xLabel: (s) => `${s}s`, compact: true })
    expect(narrow.ticks.map((tick) => tick.text)).toEqual(['0s', '8s', '16s', '24s'])
  })

  it('has no second scale unless given one', () => {
    expect(geometry.grid2).toEqual([])
  })

  it('sizes a gutter right of the plot for a second scale, labeled at 0, half and the top', () => {
    const both = chartGeometry({ width: 672, height: 300, xMax: 26, yMax: 8e8, yLabels: LABELS, xLabel: (s) => `${s}s`, compact: false, y2Labels: ['0', '50', '100 ms'] })
    expect(both.right).toBe(672 - 55)
    expect(both.grid2.map((label) => [label.x, label.y, label.text])).toEqual([
      [625, 281.5, '0'],
      [625, 147.5, '50'],
      [625, 13.5, '100 ms'],
    ])
  })
})
