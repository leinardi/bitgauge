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

import type { LoadedPing, ResultSeries } from '@/engine/messages'
import { percentile } from '@/lib/percentile'
import { validSeriesExtent } from '@/lib/resultSeries'

// The Result detail's table, the text alternative of a direction's chart (ui/screens.md section 2):
// rows of 2 s windows from warm-up end on the direction's series timeline, each with its known time,
// its throughput as bytes over that known time and the median loaded latency of the samples in it.
// A row with no known time has no throughput, and a row without samples no latency; the last row
// keeps its real, shorter span. When the stored cells are coarser than 2 s, one row per cell. A
// cell counts in the window its start falls in, with its stored known time when the series has one
// (a Continuous upload's coarse cells), else all of it or none. The idle latency's table groups its
// pings by five.

const WINDOW_MS = 2000
const IDLE_GROUP = 5

export interface WindowRow {
  fromMs: number
  toMs: number
  knownMs: number
  /** Bytes over the known time, in bit/s; null with no known time. */
  bitsPerSecond: number | null
  /** The median loaded latency of the samples in the row; null without any. */
  latencyMs: number | null
}

export interface WindowTable {
  /** The size of a stored cell when rows are cells, coarser than the windows; null for 2 s windows. */
  cellMs: number | null
  rows: WindowRow[]
}

export function median(values: readonly number[]): number | null {
  return percentile(values, 50)
}

export interface SeriesCell {
  fromMs: number
  toMs: number
  /** The cell's bytes; null when none of it is known. */
  bytes: number | null
  /** How much of the cell is known. */
  knownMs: number
}

/** The series' cells: each one's span on the timeline, its bytes and its known time; the last ends at endMs. */
export function seriesCells(series: ResultSeries): SeriesCell[] {
  if (!validSeriesExtent(series)) return []
  return series.values.flatMap((value, index) => {
    const fromMs = series.firstCellMs + index * series.bucketMs
    const toMs = Math.min(fromMs + series.bucketMs, series.endMs)
    if (toMs <= fromMs) {
      return []
    }
    const knownMs = value === null ? 0 : Math.min(toMs - fromMs, series.knownMs?.[index] ?? toMs - fromMs)
    return [{ fromMs, toMs, bytes: knownMs > 0 ? value : null, knownMs }]
  })
}

function row(fromMs: number, toMs: number, cells: SeriesCell[], latency: readonly LoadedPing[], last: boolean): WindowRow {
  const known = cells.filter((cell) => cell.bytes !== null)
  const knownMs = known.reduce((sum, cell) => sum + cell.knownMs, 0)
  const bytes = known.reduce((sum, cell) => sum + (cell.bytes ?? 0), 0)
  const inside = latency.filter((ping) => ping.atMs >= fromMs && (ping.atMs < toMs || (last && ping.atMs === toMs)))
  return { fromMs, toMs, knownMs, bitsPerSecond: knownMs > 0 ? (bytes * 8 * 1000) / knownMs : null, latencyMs: median(inside.map((ping) => ping.rttMs)) }
}

/** The table of a direction's stored series and its loaded-latency samples. */
export function windowTable(series: ResultSeries, latency: readonly LoadedPing[] = []): WindowTable {
  const cells = seriesCells(series)
  if (cells.length === 0) return { cellMs: null, rows: [] }
  if (series.bucketMs > WINDOW_MS) {
    return { cellMs: series.bucketMs, rows: cells.map((cell, index) => row(cell.fromMs, cell.toMs, [cell], latency, index === cells.length - 1)) }
  }
  const start = series.warmupEndMs + Math.floor(Math.max(0, series.firstCellMs - series.warmupEndMs) / WINDOW_MS) * WINDOW_MS
  const count = Math.max(0, Math.ceil((series.endMs - start) / WINDOW_MS))
  if (!Number.isSafeInteger(count) || count > series.values.length + 1) return { cellMs: null, rows: [] }
  const windows = Array.from({ length: count }, (_, index) => ({ fromMs: start + index * WINDOW_MS, toMs: Math.min(start + (index + 1) * WINDOW_MS, series.endMs), cells: [] as typeof cells }))
  for (const cell of cells) {
    const index = Math.min(count - 1, Math.max(0, Math.floor((cell.fromMs - start) / WINDOW_MS)))
    windows[index]?.cells.push(cell)
  }
  return { cellMs: null, rows: windows.map((window, index) => row(window.fromMs, window.toMs, window.cells, latency, index === count - 1)) }
}

export interface PingGroup {
  /** The first and last ping of the group, counted from 1 in send order. */
  first: number
  last: number
  medianMs: number
  minMs: number
  maxMs: number
}

/** The idle samples in groups of five, in send order. */
export function pingGroups(samples: readonly number[]): PingGroup[] {
  const groups: PingGroup[] = []
  for (let index = 0; index < samples.length; index += IDLE_GROUP) {
    const group = samples.slice(index, index + IDLE_GROUP)
    groups.push({ first: index + 1, last: index + group.length, medianMs: median(group) ?? 0, minMs: Math.min(...group), maxMs: Math.max(...group) })
  }
  return groups
}
