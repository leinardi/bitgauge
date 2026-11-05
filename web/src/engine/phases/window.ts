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

import type { Direction, DirectionStatus, DurationBounds, Notice, Preset } from '@/engine/messages'
import { MAX_VARIATION } from '@/engine/phases/warmup'
import { nextPreset } from '@/engine/presets'
import { type Cell, coefficientOfVariation, groupSums } from '@/engine/stats/buckets'

// The end condition, extension and shortfall (measurement.md sections 5, 8.4 and 8.6). A phase
// runs at least its minimum, ends at the first instant from then on that the end condition holds
// (the window condition and a stable window), is extended up to its maximum while it does not,
// and reports insufficient data when the maximum passes without the window condition.

/** The steady window's least length. */
export const MIN_WINDOW_MS = 3000

/** Upload: the confirmed requests wholly inside the window. */
export const MIN_UPLOAD_REQUESTS = 3

/** Download: the different requests that contributed bytes to the window. */
const MIN_DOWNLOAD_REQUESTS = 2

/** Upload stops issuing requests one request target before its maximum. */
const UPLOAD_STOP_MS = 1000

/**
 * The window condition: at least 3 s, and on upload at least 3 confirmed requests inside the
 * window, on download at least 2 requests contributing bytes to it.
 */
export function windowConditionHolds(direction: Direction, windowMs: number, requests: number): boolean {
  const least = direction === 'upload' ? MIN_UPLOAD_REQUESTS : MIN_DOWNLOAD_REQUESTS
  return windowMs >= MIN_WINDOW_MS && requests >= least
}

/** The window's stability is read over sums of this many buckets, the gauge's 500 ms (section 8.3). */
const STABILITY_GROUP = 5

/** The window's variation at the gauge's resolution: over its known buckets summed per five. */
export function windowVariation(cells: readonly Cell[]): number | null {
  return coefficientOfVariation(groupSums(cells, STABILITY_GROUP))
}

/**
 * The end condition's stability (section 5): the window's 500 ms sums vary by at most 10 %. A
 * variation without a value, a mean of zero, does not hold (section 2).
 */
export function windowStable(cells: readonly Cell[]): boolean {
  const variation = windowVariation(cells)
  return variation !== null && variation <= MAX_VARIATION
}

/** What a phase does next: keep going, or end (on upload: stop issuing requests). */
export type DurationVerdict = 'continue' | 'end'

/** The duration rule of one direction. */
export class DurationRule {
  /** Whether the end condition failed at the minimum, so the phase runs past it. */
  extended = false

  private readonly direction: Direction
  /** Null in Continuous, which has no minimum, no maximum and no extension (measurement.md section 5). */
  private readonly bounds: DurationBounds | null
  private readonly preset: Preset

  constructor(direction: Direction, bounds: DurationBounds | null, preset: Preset) {
    this.direction = direction
    this.bounds = bounds
    this.preset = preset
  }

  /**
   * The verdict at `elapsedMs` into the phase, with the end condition (the window condition and a
   * stable window) holding or not.
   */
  evaluate(elapsedMs: number, conditionHolds: boolean): DurationVerdict {
    if (this.bounds === null) {
      return 'continue'
    }
    if (elapsedMs >= this.bounds.minMs) {
      if (conditionHolds) {
        return 'end'
      }
      // A phase whose minimum is its maximum has nothing to be extended into.
      this.extended ||= this.bounds.maxMs > this.bounds.minMs
    }
    return elapsedMs >= this.bounds.maxMs - this.stopMs ? 'end' : 'continue'
  }

  /**
   * The last instant a new request may be issued at, in ms from the phase start: the maximum, and
   * on upload max - 1 s even when that comes before its minimum; null without a maximum.
   */
  get lastIssueMs(): number | null {
    return this.bounds === null ? null : this.bounds.maxMs - this.stopMs
  }

  private get stopMs(): number {
    return this.direction === 'upload' ? UPLOAD_STOP_MS : 0
  }

  /**
   * The direction's status and notices once the phase is over: measured when the final window
   * meets the condition, otherwise insufficient data with the next larger preset offered. A data
   * cap ends the phase as if its maximum had passed, but a larger preset would meet the same cap,
   * so a direction it ended without a number has no offer (section 8.6). An interrupted upload
   * suppresses the offer too, without suppressing the record of an extension already taken.
   */
  outcome(finalConditionHolds: boolean, suppressOffer = false): { status: Extract<DirectionStatus, 'measured' | 'insufficient-data'>; notices: Notice[] } {
    const notices: Notice[] = this.extended ? [{ code: 'slow-link-extended', direction: this.direction }] : []
    if (finalConditionHolds) {
      return { status: 'measured', notices }
    }
    notices.push({ code: 'insufficient-data', direction: this.direction, offer: suppressOffer ? null : nextPreset(this.preset) })
    return { status: 'insufficient-data', notices }
  }
}
