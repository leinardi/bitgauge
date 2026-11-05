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

import { type DateRange, localDay } from '@/history/filters'

// The History trend's axes (ui/screens.md section 3; design_system/components/charts.md § Trend
// chart axes): they come from the date filter and the data, never from fixed ranges, so a single
// result or a narrow filter still draws a stable frame. Times are in seconds, as uPlot's time
// scale reads them.

const DAY_S = 86_400
/** The narrowest time window the trend draws. */
const MIN_SPAN_S = 7 * DAY_S
/** The most ticks the time axis shows; the step is the smallest that keeps to it. */
const MAX_TICKS = 5
/** The time steps, in days, then in calendar months. */
const DAY_STEPS = [1, 3, 7, 14] as const
const MONTH_STEPS = [1, 2, 3, 6, 12, 24, 60, 120] as const
/** The months from which a tick names its year instead of its day. */
const YEAR_LABEL_MONTHS = 6
/** The fewest decades a rate axis spans, and the two it shows when there is no rate at all. */
const MIN_DECADES = 2
const NO_RATE_DECADES = [7, 9] as const
/** The latency axis: at least to 80 ms, and a quarter above the highest value, rounded up. */
const MIN_LATENCY_TOP_MS = 80
const LATENCY_HEADROOM = 1.25
const NICE_STEPS = [1, 2, 2.5, 5, 10] as const
/** The SI prefixes a rate axis's decades are labeled with. */
const SI_PREFIXES = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k']] as const

export interface TimeWindow {
  from: number
  to: number
}

export interface TimeTick {
  at: number
  /** Whether the tick stands for today, which the axis names instead of its date. */
  today: boolean
  /** Whether the tick names its month and year, for a step of months that spans years. */
  year: boolean
}

/**
 * The date filter's window, from the first result's day to today for all time, at least
 * `MIN_SPAN_S` wide and never past now: the right edge stays where it is as results arrive.
 */
export function timeWindow(range: DateRange, firstStartedAt: string | undefined, now: Date): TimeWindow {
  const nowS = now.getTime() / 1000
  let from = nowS
  let to = nowS
  if (range.kind === 'days') {
    from = nowS - range.days * DAY_S
  } else if (range.kind === 'custom') {
    const start = localDay(range.from)
    const end = localDay(range.to)
    if (start !== null && end !== null) {
      from = start.getTime() / 1000
      // Both days inclusive, up to the midnight that ends `to`, and never past now.
      to = Math.min(nowS, new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime() / 1000)
    }
  } else if (firstStartedAt !== undefined) {
    const first = new Date(firstStartedAt)
    if (!Number.isNaN(first.getTime())) {
      from = new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime() / 1000
    }
  }
  return { from: Math.min(from, to - MIN_SPAN_S), to }
}

/** Three to five ticks back from the window's end, a step of days, weeks or months apart. */
export function timeTicks(window: TimeWindow, now: Date): TimeTick[] {
  const span = window.to - window.from
  const today = window.to === now.getTime() / 1000
  const days = DAY_STEPS.find((step) => Math.floor(span / (step * DAY_S)) + 1 <= MAX_TICKS)
  if (days !== undefined) {
    return Array.from({ length: Math.floor(span / (days * DAY_S)) + 1 }, (_, index) => ({ at: window.to - index * days * DAY_S, today: today && index === 0, year: false })).reverse()
  }
  const end = new Date(window.to * 1000)
  const back = (months: number, index: number) => new Date(end.getFullYear(), end.getMonth() - index * months, end.getDate(), end.getHours(), end.getMinutes(), end.getSeconds()).getTime() / 1000
  const months: number = MONTH_STEPS.find((step) => back(step, MAX_TICKS) < window.from)
    ?? Math.ceil(span / (365.25 * DAY_S * (MAX_TICKS - 1))) * 12
  const ticks: TimeTick[] = []
  for (let index = 0; index < MAX_TICKS && back(months, index) >= window.from; index++) {
    ticks.push({ at: back(months, index), today: today && index === 0, year: months >= YEAR_LABEL_MONTHS })
  }
  return ticks.reverse()
}

/** A rate axis's decades, as powers of ten: whole decades around the values, at least two. */
export function rateDecades(values: readonly number[]): [number, number] {
  const positive = values.filter((value) => value > 0)
  if (positive.length === 0) {
    return [...NO_RATE_DECADES]
  }
  const hi = Math.ceil(Math.log10(Math.max(...positive)))
  const lo = Math.floor(Math.log10(Math.min(...positive)))
  return [Math.min(lo, hi - MIN_DECADES), hi]
}

/** The top of the latency axis: 80 ms, or the highest value plus a quarter, rounded up. */
export function latencyTop(values: readonly number[]): number {
  if (values.length === 0) {
    return MIN_LATENCY_TOP_MS
  }
  const wanted = Math.max(...values) * LATENCY_HEADROOM
  const power = 10 ** Math.floor(Math.log10(wanted))
  const nice = NICE_STEPS.map((step) => step * power).find((value) => value >= wanted) ?? wanted
  return Math.max(MIN_LATENCY_TOP_MS, nice)
}

/** A rate axis's decade, short as the kit labels it: 10M, 100M, 1G. */
export function decadeLabel(value: number): string {
  const prefix = SI_PREFIXES.find(([scale]) => value >= scale)
  return prefix === undefined ? String(value) : `${Math.round(value / prefix[0])}${prefix[1]}`
}
