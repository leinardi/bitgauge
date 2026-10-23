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

import type { LatencySample } from '@/components/chart/draw'
import { type ContinuousSeries, TIER_BUCKETS } from '@/composables/useContinuousSeries'
import type { LoadedPoint } from '@/composables/useLoadedSeries'
import type { DirectionLive } from '@/composables/runLive'
import type { Direction, DirectionEvent, FailureCode, NoticeCode } from '@/engine/messages'

// The live chart's data (ui/screens.md section 1, design_system/components/charts.md), built
// from the run's live state: each direction is a segment of the time axis, in run order, each
// bucket placed at its start with unknown ones as gaps, and the last one held to the segment's
// end, so it keeps its width (draw.ts holdLinear holds one before a gap). Download sits on its own
// buckets from the phase start; upload on server grid cells from P_start, with the sending line
// in the cell the engine placed it in by the display-only offset (measurement.md section 7.4), as
// the loaded-latency pings are. A Continuous run's direction is built from the tier its elapsed
// time picks instead (buildContinuous below). Nothing here is a number of the result: it only places
// what the engine sent.

const BUCKET_S = 0.1

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
  /**
   * The direction events: extended, data cap, cancelled, error with the notice it ended on; live,
   * those the samples raised (extended, data cap) until the result's replace them.
   */
  marks: { at: number; code: MarkCode; notice?: NoticeCode | FailureCode }[]
  /** The end of the last bucket: the "now" of a live chart. */
  end: number
  /** Where the time axis starts: 0, or a Continuous tier's oldest retained cell. */
  start: number
  /** The loaded-latency pings of each direction drawn, in time order. */
  latency: LatencySample[]
}

export interface ChartInput {
  /** The directions in the order the run ran them. */
  order: readonly Direction[]
  live: Readonly<Record<Direction, DirectionLive | null>>
  units: 'bits' | 'bytes'
  /** Each direction's events, live from its samples, then the result's; times are from its phase start. */
  events?: Partial<Record<Direction, readonly DirectionEvent[]>>
  /** Each direction's loaded-latency pings, on its own axis in buckets. */
  loaded?: Partial<Record<Direction, readonly LoadedPoint[]>>
  /** A Continuous run's tier and overlay rings, which its one direction is drawn from. */
  continuous?: ContinuousSeries | null
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

// A Continuous direction's live chart (measurement.md section 15, Live chart; frontend.md section
// 6): the tier the elapsed time picks, built from the cells its ring still holds. Its first cell is
// max(min(origin, first cell), evictedBefore): before any eviction the chart is anchored as a
// bounded direction's, an upload's leading unknown cells included; after it the chart starts at the
// oldest retained cell, x keeping the elapsed time, and the sending and latency points before it
// are dropped. A tier of n cells is drawn as at most 2000 points: k = ceil(n / 2000) adjacent cells
// summed, bytes and known time, each point's rate bytes x 8 / known time and unknown with no
// known time; an exact re-binning, not smoothing. The latency overlay is the tier's own overlay
// ring as it is, never re-binned.

/** The most throughput points a tier is drawn with. */
const MAX_POINTS = 2000

interface ContinuousChartInput {
  series: ContinuousSeries
  live: DirectionLive | null
  units: 'bits' | 'bytes'
  events?: readonly DirectionEvent[]
}

const EMPTY: ChartModel = { data: [[], [], [], []], warmup: [], separators: [], marks: [], end: 0, start: 0, latency: [] }

function buildContinuous({ series, live, units, events = [] }: ContinuousChartInput): ChartModel {
  if (live === null) {
    return EMPTY
  }
  const { direction, tier } = series
  const ring = series.cells[tier]
  const width = TIER_BUCKETS[tier]
  // The native ring holds absolute buckets; a coarse one counts its cells from the steady start.
  const base = tier === 'native' ? 0 : series.base
  if (base === null) {
    return EMPTY
  }
  const origin = direction === 'upload' ? Math.floor(live.start ?? live.firstBucket) : 0
  const bucketOf = (cell: number) => base + cell * width
  const evicted = ring.evictedBefore === Number.NEGATIVE_INFINITY ? Number.NEGATIVE_INFINITY : bucketOf(ring.evictedBefore)
  const firstHeld = ring.length === 0 ? origin : bucketOf(ring.firstIndex)
  const first = Math.max(Math.min(origin, firstHeld), evicted)
  const at = (bucket: number) => (bucket - origin) * BUCKET_S

  // The cells from the one holding `first` to the last received or sent, in tier cells.
  const trace = live.sendingTrace.filter((point) => point.cell >= first)
  const lastSent = trace.at(-1)
  const from = Math.floor((first - base) / width)
  const to = Math.max(ring.endIndex, lastSent === undefined ? from : Math.floor((lastSent.cell - base) / width) + 1)
  const n = to - from
  if (n <= 0) {
    return EMPTY
  }
  const k = Math.ceil(n / MAX_POINTS)
  const groups = Math.ceil(n / k)
  const x: number[] = []
  const rates: (number | null)[] = []
  for (let group = 0; group < groups; group++) {
    let bytes = 0
    let knownMs = 0
    for (let cell = from + group * k; cell < Math.min(to, from + (group + 1) * k); cell++) {
      const held = ring.at(cell)
      if (held !== undefined && held !== null) {
        bytes += held.bytes
        knownMs += held.knownMs
      }
    }
    x.push(at(Math.max(first, bucketOf(from + group * k))))
    rates.push(knownMs === 0 ? null : display((bytes * 8) / (knownMs / 1000), units))
  }
  const sending: (number | null)[] = rates.map(() => null)
  for (const point of trace) {
    const group = Math.floor((Math.floor((point.cell - base) / width) - from) / k)
    if (group >= 0 && group < groups) {
      sending[group] = display(point.bitsPerSecond, units)
    }
  }
  // One more boundary closes the last point, which holds its value to it.
  const end = at(bucketOf(to))
  x.push(end)
  rates.push(rates.at(-1) ?? null)
  sending.push(sending.at(-1) ?? null)
  const blank = x.map(() => null)
  const data: ChartModel['data'] = direction === 'download' ? [x, rates, blank, [...blank]] : [x, blank, rates, sending]

  const start = x[0] ?? 0
  const warmupEnd = live.warmupEnd
  const warmup = warmupEnd === null ? [{ from: start, to: end }] : warmupEnd > first ? [{ from: start, to: at(warmupEnd) }] : []
  const phaseStart = direction === 'upload' ? at(live.start ?? origin) : 0
  const marks: ChartModel['marks'] = []
  // A mark before the oldest retained cell is dropped with it.
  for (const event of events) {
    if (event.code === 'failure-gap' || phaseStart + event.atMs / 1000 < start) {
      continue
    }
    const mark = phaseStart + event.atMs / 1000
    marks.push(event.code === 'error' ? { at: mark, code: event.code, notice: event.notice } : { at: mark, code: event.code })
  }
  const latency: LatencySample[] = series.overlay[tier]
    .toArray()
    .filter((point) => point.at >= first)
    .map((point) => ({ at: at(point.at), ms: point.ms }))
  return { data, warmup, separators: [], marks, end, start, latency }
}

export function buildChart(input: ChartInput): ChartModel {
  const continuous = input.continuous ?? null
  if (continuous !== null) {
    const { direction } = continuous
    return buildContinuous({ series: continuous, live: input.live[direction], units: input.units, ...(input.events?.[direction] === undefined ? {} : { events: input.events[direction] }) })
  }
  const x: number[] = []
  // Download, upload received and sending, one value per x.
  const columns: (number | null)[][] = [[], [], []]
  const warmup: Span[] = []
  const separators: number[] = []
  const marks: ChartModel['marks'] = []
  const latency: LatencySample[] = []
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
    // bucket until a request has placed it), so every segment starts on a whole bucket. Once the
    // live ring has overwritten its oldest buckets, the segment starts at the oldest it holds: the
    // elapsed time stays in x, never in leading placeholders (measurement.md section 15).
    const origin = direction === 'upload' ? Math.floor(live.start ?? live.firstBucket) : 0
    const first = Math.max(Math.min(origin, live.firstBucket), live.evictedBefore ?? Number.NEGATIVE_INFINITY)
    const received: (number | null)[] = []
    const sending: (number | null)[] = []
    live.values.forEach((bytes, index) => {
      const at = live.firstBucket + index - first
      if (at >= 0) {
        put(received, at, rate(bytes, input.units))
      }
    })
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
    // A warm-up end the ring has overwritten is clipped to the oldest bucket it holds.
    const warmupEnd = live.warmupEnd === null || live.evictedBefore === undefined ? live.warmupEnd : Math.max(first, live.warmupEnd)
    warmup.push({ from: at(first), to: warmupEnd === null ? end : at(warmupEnd) })
    // Event times run from the phase start: P_start on upload.
    const phaseStart = direction === 'upload' ? at(live.start ?? origin) : offset
    for (const event of input.events?.[direction] ?? []) {
      if (event.code === 'error') {
        marks.push({ at: phaseStart + event.atMs / 1000, code: event.code, notice: event.notice })
      } else if (event.code !== 'failure-gap') {
        marks.push({ at: phaseStart + event.atMs / 1000, code: event.code })
      }
    }
    // A ping sent before the segment's first bucket would land in the previous direction's.
    for (const point of input.loaded?.[direction] ?? []) {
      if (point.at >= first) {
        latency.push({ at: at(point.at), ms: point.ms })
      }
    }
    offset = end
  }
  const [download = [], received = [], sending = []] = columns
  return { data: [x, download, received, sending], warmup, separators, marks, end: offset, start: 0, latency }
}
