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

import type { Confidence, ConfidenceReason, Direction } from '@/engine/messages'
import { type BucketSeries, coefficientOfVariation } from '@/engine/stats/buckets'
import { BUCKET_MS } from '@/engine/stats/units'

// The hybrid warm-up with guards (measurement.md section 8.3), read on the evaluation series
// (section 8.1): download's live series, or upload's confirmed series. It is evaluated at each
// newly known bucket, on the series up to that bucket, and only known buckets count.

/** The buckets conditions 2 and 3 read: the last 10 known ones. */
const RECENT = 10
/** Condition 2: non-empty buckets among those 10. */
const NON_EMPTY = 8
/** Condition 2: confirmed (or completed) requests per active stream. */
const REQUESTS_PER_STREAM = 2
/** Condition 3: the largest coefficient of variation that is stable. */
const MAX_VARIATION = 0.1
/** The cap: max(3 s, 25 % of the phase max), moved by a running ramp to at most 50 % of the max. */
const CAP_FLOOR_MS = 3000
const CAP_SHARE = 0.25
const BOUND_SHARE = 0.5

/** What the warm-up reads of the ramp. */
export interface RampView {
  /** The settle instant on the series, null while the ramp runs. */
  settledAt: number | null
  /** Where the last streams were added. */
  lastAdd: number | null
  /** I_s in buckets. */
  settle: number
}

export interface WarmupOptions {
  direction: Direction
  /** The phase's maximum duration. */
  maxMs: number
  /** A fixed warm-up in milliseconds, or null for the auto rule. */
  fixedMs: number | null
}

/** The end of warm-up, as a bucket of the series, and the confidence it leaves. */
export interface WarmupEnd {
  bucket: number
  confidence: Confidence
}

function buckets(ms: number): number {
  return Math.ceil(ms / BUCKET_MS)
}

function confidence(reasons: ConfidenceReason[]): Confidence {
  return { level: reasons.length === 0 ? 'normal' : 'low', reasons }
}

export class Warmup {
  /** Set once warm-up has ended. */
  end: WarmupEnd | null = null

  private readonly direction: Direction
  private readonly fixed: number | null
  private readonly cap: number
  private readonly bound: number
  /** The next bucket to evaluate the series up to (exclusive). */
  private next: number | null = null
  /** Whether the ramp's settle instant has been taken into account. */
  private settleSeen = false

  constructor(options: WarmupOptions) {
    this.direction = options.direction
    this.fixed = options.fixedMs === null ? null : buckets(options.fixedMs)
    this.cap = buckets(Math.max(CAP_FLOOR_MS, CAP_SHARE * options.maxMs))
    this.bound = buckets(BOUND_SHARE * options.maxMs)
  }

  /**
   * Evaluates every bucket the series gained since the last call. `requestsPerStream` holds, for
   * each active stream, its completed (download) or confirmed (upload) requests since the phase
   * began. Update the ramp on the same series first.
   */
  update(series: BucketSeries, ramp: RampView, requestsPerStream: readonly number[]): WarmupEnd | null {
    let from = this.next ?? series.first + 1
    if (ramp.settledAt !== null && !this.settleSeen) {
      // A ramp can settle at a bucket already evaluated (a 429 settles it at the end of the series
      // it read): evaluate again from there, once, so warm-up can end at the settle instant.
      this.settleSeen = true
      from = Math.min(from, Math.max(ramp.settledAt, series.first + 1))
    }
    for (let at = from; this.end === null && at <= series.end; at++) {
      this.end = this.evaluate(series, ramp, requestsPerStream, at)
      this.next = at + 1
    }
    return this.end
  }

  /** Warm-up's verdict on the series up to bucket `at`, or null while it continues. */
  private evaluate(
    series: BucketSeries,
    ramp: RampView,
    requestsPerStream: readonly number[],
    at: number,
  ): WarmupEnd | null {
    // The cap, its bound and a fixed warm-up count known buckets, like conditions 1 and 4.
    const elapsed = series.known(series.first, at).length
    const settled = ramp.settledAt !== null && ramp.settledAt <= at
    if (this.fixed !== null) {
      return elapsed >= this.fixed ? { bucket: at, confidence: confidence(settled ? [] : ['ramp-unsettled']) } : null
    }
    const reasons = this.unmet(series, ramp, requestsPerStream, at)
    if (reasons.length === 0) {
      return { bucket: at, confidence: confidence([]) }
    }
    // At the cap, or, while the ramp runs, at its settle instant or the bound, whichever is first.
    const ends = elapsed >= this.cap && (settled || elapsed >= this.bound)
    return ends ? { bucket: at, confidence: confidence(reasons) } : null
  }

  /** The reasons of the conditions that do not hold on the series up to bucket `at`. */
  private unmet(
    series: BucketSeries,
    ramp: RampView,
    requestsPerStream: readonly number[],
    at: number,
  ): ConfidenceReason[] {
    const reasons: ConfidenceReason[] = []

    // 1. Ramp settled, with I_s of known series after the last add.
    const settled = ramp.settledAt !== null && ramp.settledAt <= at
    if (!settled || ramp.lastAdd === null || series.known(ramp.lastAdd, at).length < ramp.settle) {
      reasons.push('ramp-unsettled')
    }

    // 2. Meaningful observations. Conditions 2 and 3 read the last 10 known buckets and need all
    // of them, so 4, a known second of series, holds whenever they can.
    const recent = series.lastKnown(RECENT, at)
    const nonEmpty = recent.filter((bytes) => bytes > 0).length
    const continuous = this.direction === 'download' && recent.length === RECENT && nonEmpty === RECENT
    const perStream =
      requestsPerStream.length > 0 && requestsPerStream.every((count) => count >= REQUESTS_PER_STREAM)
    const observed = recent.length === RECENT && nonEmpty >= NON_EMPTY && (perStream || continuous)
    if (!observed) {
      reasons.push('insufficient-samples')
    }

    // 3. Stability of the last 10 known buckets.
    const variation = recent.length === RECENT ? coefficientOfVariation(recent) : null
    if (variation === null || variation > MAX_VARIATION) {
      reasons.push('unstable')
    }
    return reasons
  }
}
