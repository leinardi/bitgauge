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

// Where the labels on a chart's top rows sit (design_system/components/charts.md, placeTopLabels
// in Chart.jsx): each phase's name right of its separator, each mark's label left of its line. A
// mark label that would cross another label, or leave the plot, takes the other side of its line
// when it fits there, else the first row below where it crosses nothing. Rows are
// --chart-label-row apart, or the tallest label's height when that is taller, so a second-row label
// never reaches into the first.

/** A label's text and the x of the line it belongs to. */
export interface LineLabel {
  x: number
  text: string
}

/** The two tokens and each rendered label's box, keyed `<kind>|<text>` (kind `phase` or `mark`). */
export interface LabelMetrics {
  gap: number
  row: number
  widths: Readonly<Record<string, number>>
  heights: Readonly<Record<string, number>>
}

export interface PlacedLabel {
  /** The label's left edge, or its right edge when `end` is true. */
  x: number
  y: number
  text: string
  end: boolean
}

export const DEFAULT_METRICS: LabelMetrics = { gap: 6, row: 12, widths: {}, heights: {} }

const MAX_ROWS = 6
/** Before the first render has measured a label, its width from its length, as the export estimates it. */
const CHAR_WIDTH = { phase: 7, mark: 6.6 } as const

interface Box {
  x0: number
  x1: number
  row: number
  right: boolean
}

export const metricKey = (kind: keyof typeof CHAR_WIDTH, text: string) => `${kind}|${text}`

function width(kind: keyof typeof CHAR_WIDTH, text: string, metrics: LabelMetrics): number {
  return metrics.widths[metricKey(kind, text)] ?? text.length * CHAR_WIDTH[kind]
}

/**
 * Places each mark label, after the boxes already `taken`: on its preferred side (left) on row 1,
 * else its other side on row 1, else the first free row on the side that fits the plot.
 */
function placeMarks(
  marks: readonly { x: number; w: number }[],
  taken: readonly Box[],
  { gap, left, right }: { gap: number; left: number; right: number },
): Box[] {
  const placed = [...taken]
  const crosses = (box: Box, row: number) => placed.some((other) => other.row === row && box.x0 < other.x1 + gap && box.x1 > other.x0 - gap)
  const at = (x: number, w: number, onRight: boolean): Box => (onRight ? { x0: x + gap, x1: x + gap + w, row: 1, right: true } : { x0: x - gap - w, x1: x - gap, row: 1, right: false })
  const fits = (box: Box) => box.x0 >= left && box.x1 <= right
  return marks.map(({ x, w }) => {
    const preferred = at(x, w, false)
    const other = at(x, w, true)
    let box: Box
    if (fits(preferred) && !crosses(preferred, 1)) {
      box = preferred
    } else if (fits(other) && !crosses(other, 1)) {
      box = other
    } else {
      const side = fits(preferred) || !fits(other) ? preferred : other
      let row = 2
      while (row < MAX_ROWS && crosses(side, row)) {
        row += 1
      }
      box = { ...side, row }
    }
    placed.push(box)
    return box
  })
}

/** The phase and mark labels of one chart, placed over its plot box. */
export function placeTopLabels(
  phases: readonly LineLabel[],
  marks: readonly LineLabel[],
  plot: { left: number; right: number; top: number },
  metrics: LabelMetrics,
): { phases: PlacedLabel[]; marks: PlacedLabel[] } {
  const { gap, row } = metrics
  const rowOne = plot.top + row
  const placedPhases = phases.map((phase) => ({ x: phase.x + gap, y: rowOne, text: phase.text, end: false }))
  const taken = placedPhases.map((phase): Box => ({ x0: phase.x, x1: phase.x + width('phase', phase.text, metrics), row: 1, right: true }))
  const boxes = placeMarks(
    marks.map((mark) => ({ x: mark.x, w: width('mark', mark.text, metrics) })),
    taken,
    { gap, left: plot.left, right: plot.right },
  )
  const pitch = Math.max(row, 0, ...Object.values(metrics.heights))
  const placedMarks = marks.map((mark, index) => {
    const box = boxes[index] ?? { row: 1, right: false }
    return { x: box.right ? mark.x + gap : mark.x - gap, y: rowOne + (box.row - 1) * pitch, text: mark.text, end: !box.right }
  })
  return { phases: placedPhases, marks: placedMarks }
}
