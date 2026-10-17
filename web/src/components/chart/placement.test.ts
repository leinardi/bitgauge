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

// The top-row label placement of the export's placeTopLabels (charts.md): phase names right of
// their separator, mark labels left of their line, crossing nothing.

import { describe, expect, it } from 'vitest'

import { DEFAULT_METRICS, type LabelMetrics, placeTopLabels } from '@/components/chart/placement'

const PLOT = { left: 44, right: 600, top: 10 }

function measured(widths: Record<string, number>, heights: Record<string, number> = {}): LabelMetrics {
  return { ...DEFAULT_METRICS, widths, heights }
}

describe('placeTopLabels', () => {
  it('puts a phase name right of its separator and a mark label left of its line, on row 1', () => {
    const placed = placeTopLabels([{ x: 300, text: 'Upload' }], [{ x: 200, text: 'Cancelled' }], PLOT, measured({ 'phase|Upload': 40, 'mark|Cancelled': 50 }))
    expect(placed.phases).toEqual([{ x: 306, y: 22, text: 'Upload', end: false }])
    expect(placed.marks).toEqual([{ x: 194, y: 22, text: 'Cancelled', end: true }])
  })

  it('moves a mark label right of its line when the left would cross a phase name', () => {
    // The phase name spans 256 to 306; "Cancelled" left of 330 would span 274 to 324.
    const placed = placeTopLabels([{ x: 250, text: 'Upload' }], [{ x: 330, text: 'Cancelled' }], PLOT, measured({ 'phase|Upload': 50, 'mark|Cancelled': 50 }))
    expect(placed.marks).toEqual([{ x: 336, y: 22, text: 'Cancelled', end: false }])
  })

  it('takes a second row, one label height below, when neither side fits the first', () => {
    // Left would cross the phase name; right would leave the plot.
    const metrics = measured({ 'phase|Upload': 300, 'mark|Cancelled': 60 }, { 'phase|Upload': 17, 'mark|Cancelled': 17 })
    const placed = placeTopLabels([{ x: 250, text: 'Upload' }], [{ x: 580, text: 'Cancelled' }], PLOT, metrics)
    expect(placed.marks).toEqual([{ x: 574, y: 39, text: 'Cancelled', end: true }])
  })

  it('keeps the row pitch at --chart-label-row when the labels are shorter', () => {
    const metrics = measured({ 'phase|Upload': 300, 'mark|Cancelled': 60 }, { 'mark|Cancelled': 9 })
    const placed = placeTopLabels([{ x: 250, text: 'Upload' }], [{ x: 580, text: 'Cancelled' }], PLOT, metrics)
    expect(placed.marks[0]?.y).toBe(34)
  })

  it('estimates a label it has not measured from its length', () => {
    // "Request failed" is 14 characters, about 92 px: left of 120 it would leave the plot.
    const placed = placeTopLabels([], [{ x: 120, text: 'Request failed' }], PLOT, DEFAULT_METRICS)
    expect(placed.marks[0]).toEqual({ x: 126, y: 22, text: 'Request failed', end: false })
  })

  it('places a later mark clear of an earlier one', () => {
    const metrics = measured({ 'mark|Extended': 50, 'mark|Cancelled': 50 })
    const placed = placeTopLabels([], [{ x: 300, text: 'Extended' }, { x: 320, text: 'Cancelled' }], PLOT, metrics)
    expect(placed.marks.map((mark) => [mark.x, mark.end])).toEqual([[294, true], [326, false]])
  })
})
