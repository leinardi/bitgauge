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

import { type LoadedContext, RESERVED_STREAMS } from '@/engine/latency/grade'
import type { LoadedOutcome, LoadedSample } from '@/engine/latency/loaded'
import type { IdleResult, LoadedLatency, LoadedPing, LoadedSource } from '@/engine/messages'
import { type BucketSink, percentile } from '@/engine/stats/buckets'

// Loaded latency under Continuous (measurement.md section 15): path A's counted samples fold into
// per-second medians, a one-second scratch buffer being the only per-sample store; each second's
// median enters an hour ring and the run-wide minimum, average and maximum. The direction's
// statistics are the last hour's. When the source changes, on HTTP/2 or HTTP/3 everything restarts
// from the later source's first sample; on HTTP/1.1 the reservation is broken.

const HOUR_SECONDS = 3600
const MINUTE_SECONDS = 60
const SECOND_MS = 1000
const MIN_LOADED_SAMPLES = 10

/** The pinger's counters, which restart with the counted source. */
export interface LoadedCounters {
  skippedTicks: number
  lost: number
}

/** The run-wide aggregates over the per-second medians, in milliseconds. */
export interface SecondAggregates {
  minMs: number | null
  averageMs: number | null
  maxMs: number | null
}

export class LoadedSeconds implements BucketSink<LoadedSample> {
  /** The source counted, the later one after a switch; null before the first counted sample. */
  source: LoadedSource | null = null
  /** The samples counted since the source's first. */
  samples = 0
  private readonly settleMs: number
  private readonly counters: () => LoadedCounters
  /** The pinger's counters when the counted source began. */
  private base: LoadedCounters = { skippedTicks: 0, lost: 0 }
  private readonly atMs = new Float64Array(HOUR_SECONDS)
  private readonly medians = new Float64Array(HOUR_SECONDS)
  private head = 0
  private filled = 0
  /** The second the scratch buffer holds, and its RTTs. */
  private second: number | null = null
  private scratch: number[] = []
  private seconds = 0
  private sum = 0
  private min: number | null = null
  private max: number | null = null

  /** `settleMs` is I_s from the phase start: samples sent earlier are slow start, as in a bounded direction. */
  constructor(settleMs: number, counters: () => LoadedCounters) {
    this.settleMs = settleMs
    this.counters = counters
  }

  /** Counts the answered pings sent under load after slow start, each into the second of its send. */
  append(...samples: LoadedSample[]): void {
    for (const sample of samples) {
      if (sample.source !== this.source) {
        this.switch(sample.source)
      }
      if (!sample.loaded || sample.atMs < this.settleMs) {
        continue
      }
      const second = Math.floor(sample.atMs / SECOND_MS)
      if (this.second !== null && second > this.second) {
        this.flush()
      }
      // A late answer of a second already closed joins the one still open.
      this.second ??= second
      this.scratch.push(sample.rttMs)
      this.samples++
    }
  }

  /** Closes the second in the scratch buffer: its median joins the hour ring and the aggregates. */
  flush(): void {
    const median = percentile(this.scratch, 50)
    if (median !== null && this.second !== null) {
      this.atMs[this.head] = this.second * SECOND_MS
      this.medians[this.head] = median
      this.head = (this.head + 1) % HOUR_SECONDS
      this.filled = Math.min(this.filled + 1, HOUR_SECONDS)
      this.seconds++
      this.sum += median
      this.min = Math.min(this.min ?? median, median)
      this.max = Math.max(this.max ?? median, median)
    }
    this.second = null
    this.scratch = []
  }

  /** The hour ring's per-second medians, oldest first. */
  hour(): LoadedPing[] {
    const pings: LoadedPing[] = []
    for (let index = 0; index < this.filled; index++) {
      const slot = (this.head - this.filled + index + HOUR_SECONDS) % HOUR_SECONDS
      pings.push({ atMs: this.atMs[slot] ?? 0, rttMs: this.medians[slot] ?? 0 })
    }
    return pings
  }

  /** The median of the last minute's per-second medians, for the live view; null without one. */
  lastMinuteMedianMs(): number | null {
    return percentile(
      this.hour()
        .slice(-MINUTE_SECONDS)
        .map((ping) => ping.rttMs),
      50,
    )
  }

  aggregates(): SecondAggregates {
    return { minMs: this.min, averageMs: this.seconds === 0 ? null : this.sum / this.seconds, maxMs: this.max }
  }

  /** The pinger's counters since the counted source began. */
  since(outcome: Pick<LoadedOutcome, 'skippedTicks' | 'lost'>): LoadedCounters {
    return { skippedTicks: outcome.skippedTicks - this.base.skippedTicks, lost: outcome.lost - this.base.lost }
  }

  /** The kept stores' lengths: the hour ring allocated up front and the scratch buffer. */
  footprint(): number {
    return this.atMs.length + this.medians.length + this.scratch.length
  }

  /** A new source: the first, or a switch, from whose first sample everything restarts. */
  private switch(source: LoadedSource): void {
    if (this.source !== null) {
      this.base = this.counters()
      this.second = null
      this.scratch = []
      this.head = 0
      this.filled = 0
      this.seconds = 0
      this.sum = 0
      this.min = null
      this.max = null
      this.samples = 0
    }
    this.source = source
  }
}

function pathOf(source: LoadedSource): IdleResult['path'] {
  return source === 'websocket' ? 'websocket' : 'http'
}

/** A Continuous direction's loaded latency: the last hour's statistics; `series` times are from the phase start. */
export function continuousLoadedResult(seconds: LoadedSeconds, outcome: LoadedOutcome, context: LoadedContext): LoadedLatency {
  seconds.flush()
  const source = outcome.sources.at(-1)
  const { skippedTicks, lost } = seconds.since(outcome)
  if (source === undefined) {
    return { status: 'unavailable', reason: 'no-probe-path', samples: 0, skippedTicks, lost }
  }
  const unavailable = (reason: Exclude<LoadedLatency, { medianMs: number }>['reason']): LoadedLatency => ({ status: 'unavailable', reason, source, samples: seconds.samples, skippedTicks, lost })
  if (!context.hasWindow) {
    return unavailable('no-steady-window')
  }
  if (source === 'http-h1-reserved' && (outcome.sources.length > 1 || !context.reservation || outcome.maxInFlight > RESERVED_STREAMS)) {
    return unavailable('reservation-broken')
  }
  const series = seconds.hour()
  const medians = series.map((ping) => ping.rttMs)
  const medianMs = percentile(medians, 50)
  const p90Ms = percentile(medians, 90)
  if (seconds.samples < MIN_LOADED_SAMPLES || medianMs === null || p90Ms === null) {
    return unavailable('insufficient-samples')
  }
  const idle = context.idleMedianMs
  return {
    source,
    ...(idle !== null && context.idleSource !== null && context.idleSource !== pathOf(source) ? { idleSource: context.idleSource } : {}),
    samples: seconds.samples,
    skippedTicks,
    lost,
    medianMs,
    p90Ms,
    ...(idle === null ? {} : { increaseMs: Math.max(0, medianMs - idle) }),
    series,
  }
}
