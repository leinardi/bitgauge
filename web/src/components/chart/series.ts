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

import type { DirectionLive } from '@/composables/useRunState'
import type { Direction, DirectionEvent } from '@/engine/messages'

// The live chart's data (ui/screens.md section 1, design_system/components/charts.md), built
// from the run's live state: each direction is a segment of the time axis, in run order, its
// buckets drawn stepwise from their start with unknown ones as gaps. Download sits on its own
// buckets from the phase start; upload on server grid cells from P_start, with the sending line
// in the cell the engine placed it in by the display-only offset (measurement.md section 7.4).
// Nothing here is a number of the result: it only places what the engine sent.

const BUCKET_S = 0.1

/**
 * How uPlot draws a bucket series: each value holds from its bucket's start to the next one's
 * (align 1), and a gap clips exactly its null buckets, from the first one's start to the next known
 * one's (alignGaps 1), so the bucket before a gap keeps its width (charts.md).
 */
export const STEPPED = { align: 1, alignGaps: 1 } as const

/** x in seconds from the chart's start; then download, upload received and sending, per x. */
export type ChartData = [number[], (number | null)[], (number | null)[], (number | null)[]]

/** A stretch of the x axis, in seconds. */
export interface Span {
  from: number
  to: number
}

export type MarkCode = Exclude<DirectionEvent['code'], 'failure-gap'>

export interface ChartModel {
  data: ChartData
  /** The warm-up of each direction: the band runs to warm-up end, or to the latest bucket before. */
  warmup: Span[]
  /** Where each direction after the first begins. */
  separators: number[]
  /** The events of the result: extended, data cap, cancelled, error. */
  marks: { at: number; code: MarkCode }[]
  /** The end of the last bucket: the "now" of a live chart. */
  end: number
}

export interface ChartInput {
  /** The directions in the order the run ran them. */
  order: readonly Direction[]
  live: Readonly<Record<Direction, DirectionLive | null>>
  units: 'bits' | 'bytes'
  /** Each direction's events, once the result has them; times are from its phase start. */
  events?: Partial<Record<Direction, readonly DirectionEvent[]>>
}

/** A bucket's bytes as a rate in the display unit: bit/s, or B/s. */
function rate(bytes: number | null, units: 'bits' | 'bytes'): number | null {
  if (bytes === null) {
    return null
  }
  return units === 'bits' ? (bytes * 8) / BUCKET_S : bytes / BUCKET_S
}

const display = (bitsPerSecond: number, units: 'bits' | 'bytes') => (units === 'bits' ? bitsPerSecond : bitsPerSecond / 8)

/** Puts `value` in the series at bucket `index` of a segment, growing the segment as needed. */
function put(series: (number | null)[], index: number, value: number | null): void {
  while (series.length <= index) {
    series.push(null)
  }
  series[index] = value
}

/** Holds a series' last known value to the segment's end, so its last bucket has a width. */
function hold(series: (number | null)[], length: number): void {
  const last = series.length - 1
  const value = series[last] ?? null
  while (series.length < length) {
    series.push(null)
  }
  if (value !== null && last < length - 1) {
    series[last + 1] = value
  }
}

export function buildChart(input: ChartInput): ChartModel {
  const x: number[] = []
  // Download, upload received and sending, one value per x.
  const columns: (number | null)[][] = [[], [], []]
  const warmup: Span[] = []
  const separators: number[] = []
  const marks: ChartModel['marks'] = []
  let offset = 0

  for (const direction of input.order) {
    const live = input.live[direction]
    if (live === null) {
      continue
    }
    if (x.length > 0) {
      separators.push(offset)
    }
    // Download counts from its phase start, bucket 0; upload from the cell of P_start (its first
    // bucket until a request has placed it), so every segment starts on a whole bucket.
    const origin = direction === 'upload' ? Math.floor(live.start ?? live.firstBucket) : 0
    const first = Math.min(origin, live.firstBucket)
    const received: (number | null)[] = []
    const sending: (number | null)[] = []
    live.values.forEach((bytes, index) => put(received, live.firstBucket + index - first, rate(bytes, input.units)))
    for (const point of live.sendingTrace) {
      const index = Math.floor(point.cell) - first
      if (index >= 0) {
        put(sending, index, display(point.bitsPerSecond, input.units))
      }
    }
    // One more bucket boundary closes the last bucket.
    const length = Math.max(received.length, sending.length) + 1
    hold(received, length)
    hold(sending, length)
    const own = direction === 'download' ? [received, [], []] : [[], received, sending]
    const at = (bucket: number) => offset + (bucket - origin) * BUCKET_S
    for (let index = 0; index < length; index++) {
      const values = own.map((series) => series[index] ?? null)
      // The previous segment's closing boundary is this one's first bucket start: one x, with
      // the previous direction's held value and this direction's first.
      if (index === 0 && x.length > 0 && x.at(-1) === at(first)) {
        values.forEach((value, column) => {
          const series = columns[column]
          if (value !== null && series !== undefined) {
            series[series.length - 1] = value
          }
        })
        continue
      }
      x.push(at(first + index))
      values.forEach((value, column) => columns[column]?.push(value))
    }
    const end = at(first + length - 1)
    warmup.push({ from: at(first), to: live.warmupEnd === null ? end : at(live.warmupEnd) })
    // Event times run from the phase start: P_start on upload.
    const phaseStart = direction === 'upload' ? at(live.start ?? origin) : offset
    for (const event of input.events?.[direction] ?? []) {
      if (event.code !== 'failure-gap') {
        marks.push({ at: phaseStart + event.atMs / 1000, code: event.code })
      }
    }
    offset = end
  }
  const [download = [], received = [], sending = []] = columns
  return { data: [x, download, received, sending], warmup, separators, marks, end: offset }
}
