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

import type { Plateau, StreamMode } from '@/engine/messages'
import type { BucketSeries } from '@/engine/stats/buckets'
import { BUCKET_MS } from '@/engine/stats/units'

// The adaptive stream count (measurement.md sections 4 and 8.2): a pure state machine over the
// evaluation series. It reads only interval means of known buckets and counts every interval in
// whole buckets of the series. The phase runner runs the stream count it asks for and, after an
// add, tells it where on the series the added streams took effect.

/** The auto ramp's stream counts, before the effective cap clamps them. */
const SEQUENCE = [1, 2, 4, 6]

/** A trial is kept, and the baseline keeps measuring, only above this ratio. */
const GAIN = 1.05

/** The baseline measures further intervals only while they end within this of its I_s. */
const BASELINE_CAP_MS = 3000

/** The floor rule: a trial is skipped when its per-stream rate would be below 8 KiB/s. */
const FLOOR_RATE = 8 * 1024

/** The request target a measurement interval may span (measurement.md section 3). */
const REQUEST_CYCLE_MS = 1000

/** A measurement interval of this many RTT keeps a restarted slow start's loss to its noise. */
const CYCLE_ROUND_TRIPS = 100

/** The RTT the intervals use when idle latency was skipped. */
const DEFAULT_RTT_MS = 100

/** An idle stream's request cycle stretches a measurement interval to at most this (measurement.md section 8.2). */
const IDLE_CYCLE_CAP_MS = 3000

export interface RampOptions {
  mode: StreamMode
  /** The stream count of fixed mode. */
  fixed: number
  /** The configured maximum stream count. */
  max: number
  /** limits.maxStreamsPerClient from GET /info. */
  serverMax: number
  /** The idle-latency median, or null when idle latency was skipped. */
  rttMs: number | null
}

function wholeBuckets(ms: number): number {
  return Math.ceil(ms / BUCKET_MS)
}

/** I_s, the settling interval, in whole buckets. */
export function settleBuckets(rttMs: number | null): number {
  return wholeBuckets(Math.max(1000, 4 * (rttMs ?? DEFAULT_RTT_MS)))
}

/**
 * I_m, the measurement interval, in whole buckets: at least 500 ms and 2 RTT, and long enough that
 * the few round trips a stream loses each request cycle cannot move its mean, either 100 RTT or a
 * whole request cycle (the 1 s request target and one round trip), whichever is shorter.
 */
export function measureBuckets(rttMs: number | null): number {
  const rtt = rttMs ?? DEFAULT_RTT_MS
  return wholeBuckets(Math.max(500, 2 * rtt, Math.min(CYCLE_ROUND_TRIPS * rtt, REQUEST_CYCLE_MS + rtt)))
}

function firstWithBytes(series: BucketSeries): number | null {
  for (let bucket = series.first; bucket < series.end; bucket++) {
    const cell = series.at(bucket)
    if (cell !== null && cell > 0) {
      return bucket
    }
  }
  return null
}

type Stage = 'fixed' | 'baseline' | 'placing' | 'trial' | 'settled'

export class Ramp {
  /** The stream count the phase runs. */
  streams: number
  /** Why the auto ramp stopped; undefined while it runs, and in fixed and single modes. */
  plateau: Plateau | undefined
  /** The effective cap: the configured and the server's maximum, lowered by one per 429. */
  cap: number
  /** The bucket where the last streams were added, for the warm-up's settle condition. */
  lastAdd: number | null = null
  /**
   * The settle instant on the series: the end of the interval that decided the plateau, I_s after
   * the start in fixed and single modes, or the end of the series read when a 429 ended a trial.
   */
  settledAt: number | null = null
  /** I_s in buckets. */
  readonly settle: number

  /** I_m from the RTT alone; an idle stream on upload stretches the interval read. */
  private readonly baseIm: number
  private readonly rttMs: number
  private im: number
  private stage: Stage
  /** Where the current step's I_s starts on the series; null until known. */
  private start: number | null = null
  /** The start of the next interval of the current step, once I_s has passed. */
  private from: number | null = null
  /** How many of them measured something. */
  private measuredCount = 0
  /** T_prev during the baseline, T_base after it. */
  private reference = 0
  /** The end of the longest series read so far. */
  private seen = 0
  /** The sum of rate_s over the current streams, in bytes per second; null before any completes. */
  private streamRate: number | null = null

  constructor(options: RampOptions) {
    this.cap = Math.max(1, Math.min(options.max, options.serverMax))
    this.settle = settleBuckets(options.rttMs)
    this.rttMs = options.rttMs ?? DEFAULT_RTT_MS
    this.baseIm = measureBuckets(options.rttMs)
    this.im = this.baseIm
    if (options.mode === 'auto') {
      this.streams = 1
      this.stage = 'baseline'
    } else {
      this.streams = Math.min(options.mode === 'single' ? 1 : options.fixed, this.cap)
      this.stage = 'fixed'
    }
  }

  /** Whether the ramp has settled: a plateau reached, or I_s passed in fixed and single modes. */
  get settled(): boolean {
    return this.stage === 'settled'
  }

  /** Whether the ramp waits to be told where the added streams took effect. */
  get placing(): boolean {
    return this.stage === 'placing'
  }

  /**
   * Places the added streams at bucket `bucket` of the series: on download the bucket of the add,
   * on upload the cell of the latest first byte among the added streams' first requests.
   */
  stepStarted(bucket: number): void {
    if (this.stage !== 'placing') {
      throw new Error('the ramp has no added streams to place')
    }
    this.start = bucket
    this.lastAdd = bucket
    this.from = null
    this.measuredCount = 0
    this.stage = 'trial'
  }

  /** Lowers the effective cap by one after a 429 (measurement.md section 4). */
  lowerCap(): void {
    this.cap = Math.max(1, this.cap - 1)
    if (this.streams <= this.cap) {
      return
    }
    this.streams = this.cap
    if (this.stage === 'placing') {
      // The added streams were never placed: count them as added at the end of the series read.
      this.lastAdd = this.seen
    }
    if (this.stage === 'placing' || this.stage === 'trial') {
      this.finish('cap', this.seen)
    }
  }

  /**
   * Advances as far as the known buckets of the evaluation series allow. On upload, `idleShare`
   * is the largest share of a request's client duration its stream sat idle beyond the round
   * trip (measurement.md section 8.2): a stream's request cycle is then about the request target
   * and the round trip over (1 − share), the aggregate of N staggered streams repeats about every
   * cycle / N, and an interval reads at least that, the cycle capped at 3 s. `streamRate` is the
   * sum of rate_s over the current streams, which the floor rule reads.
   */
  update(series: BucketSeries, idleShare: number | null = null, streamRate: number | null = null): void {
    this.streamRate = streamRate
    this.seen = Math.max(this.seen, series.end)
    const cycleMs = idleShare === null ? 0 : Math.min((REQUEST_CYCLE_MS + this.rttMs) / (1 - idleShare), IDLE_CYCLE_CAP_MS)
    this.im = Math.max(this.baseIm, wholeBuckets(cycleMs / this.streams))
    if (this.start === null) {
      // The baseline, and a fixed count, start at the first bucket holding bytes.
      const first = this.stage === 'baseline' || this.stage === 'fixed' ? firstWithBytes(series) : null
      if (first === null) {
        return
      }
      this.start = first
      this.lastAdd = first
    }
    const start = this.start
    if (this.stage === 'fixed') {
      if (series.end >= start + this.settle) {
        this.finish(undefined, start + this.settle)
      }
      return
    }
    while (this.stage === 'baseline' || this.stage === 'trial') {
      const from = this.from ?? start + this.settle
      if (series.end < from + this.im) {
        return
      }
      this.from = from + this.im
      const mean = series.mean(from, from + this.im)
      if (this.stage === 'baseline') {
        this.baselineMeasured(mean)
      } else {
        this.trialMeasured(mean)
      }
    }
  }

  /** Baseline: T_prev, then T_cur while the single stream keeps growing, up to the cap. */
  private baselineMeasured(mean: number | null): void {
    if (mean !== null) {
      this.measuredCount++
      if (this.measuredCount === 1 || (mean > GAIN * this.reference && this.nextIntervalFits())) {
        this.reference = mean
        return
      }
      this.reference = mean
      this.nextTrial()
      return
    }
    // An interval with no known bucket is measured again, unless the cap has been reached.
    if (this.measuredCount >= 2 && !this.nextIntervalFits()) {
      this.nextTrial()
    }
  }

  /** Whether one more interval of the baseline would end within its cap after I_s. */
  private nextIntervalFits(): boolean {
    return this.intervalEnd() + this.im - ((this.start ?? this.seen) + this.settle) <= wholeBuckets(BASELINE_CAP_MS)
  }

  /** Compare: keep the trial on a 5 % gain, otherwise plateau. */
  private trialMeasured(mean: number | null): void {
    if (mean === null) {
      return
    }
    if (mean < GAIN * this.reference) {
      this.finish('no-gain', this.intervalEnd())
      return
    }
    this.reference = mean
    if (this.streams >= this.cap) {
      this.finish('cap', this.intervalEnd())
    } else {
      this.nextTrial()
    }
  }

  /**
   * Moves to the next step of the sequence, clamped to the cap, unless the floor rule skips it:
   * L / N under 8 KiB/s, L the larger of T_base and the sum of rate_s (measurement.md section
   * 8.2), since T_base understates a link whose streams idle between requests and one rate_s a
   * link that overlapping streams share.
   */
  private nextTrial(): void {
    const next = SEQUENCE.map((count) => Math.min(count, this.cap)).find((count) => count > this.streams)
    if (next === undefined) {
      this.finish('cap', this.intervalEnd())
      return
    }
    const link = Math.max((this.reference * 1000) / BUCKET_MS, this.streamRate ?? 0)
    if (link / next < FLOOR_RATE) {
      this.finish('floor-limited', this.intervalEnd())
      return
    }
    this.streams = next
    this.start = null
    this.stage = 'placing'
  }

  /** The end of the interval measured last, or where the first one starts when none was. */
  private intervalEnd(): number {
    return this.from ?? (this.start ?? this.seen) + this.settle
  }

  private finish(plateau: Plateau | undefined, at: number): void {
    this.plateau = plateau
    this.settledAt = at
    this.stage = 'settled'
  }
}
