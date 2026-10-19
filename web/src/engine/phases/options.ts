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

import type { DurationBounds, Preset, TestSettings } from '@/engine/messages'
import type { WarmupEnd } from '@/engine/phases/warmup'
import type { Clock } from '@/engine/types'

/** What a throughput phase, download or upload, takes from the run. */
export interface ThroughputOptions {
  clock: Clock
  preset: Preset
  streams: TestSettings['streams']
  /** Null in Continuous, which has no minimum and no maximum (measurement.md section 15). */
  bounds: DurationBounds | null
  /** Continuous only: the run length from the phase start, null for a run until stopped. */
  continuous?: { runLengthMs: number | null }
  warmup: TestSettings['warmup']
  dataCapBytes: number | null
  /** The data the test used before this phase, which counts against the data cap. */
  dataUsedBefore: number
  /** The idle-latency median, or null when idle latency was skipped. */
  rttMs: number | null
  /** The HTTP/1.1 probe reservation's bound on the streams and the requests in flight (measurement.md section 11.2). */
  streamCap?: number
  /** Called once at the phase's end instant with the grace its loaded-latency pings get (section 11.4). */
  ended?: (graceMs: number) => void
  /** Called once when the phase learns its warm-up has ended, which starts path B (section 12.3). */
  warmedUp?: (end: WarmupEnd) => void
}

/** The grace is min(2 s, 2 × d), d the expected duration of the longest request in flight (measurement.md section 5). */
const MAX_GRACE_MS = 2000

/**
 * The grace for requests in flight with these expected durations, null for one without a rate;
 * with none in flight d is 0, so there is no grace and the pings still outstanding are lost.
 */
export function graceFor(expected: readonly (number | null)[]): number {
  const longest = Math.max(0, ...expected.map((ms) => ms ?? MAX_GRACE_MS))
  return Math.min(MAX_GRACE_MS, 2 * longest)
}

/** The bound on requests in flight: the server's, lowered by the probe reservation. */
export function serverBound(serverMax: number, streamCap: number | undefined): number {
  return Math.min(serverMax, streamCap ?? serverMax)
}

/**
 * What the data cap still allows after the data used, this phase's included, and the bytes still
 * to move of the requests in flight (measurement.md section 3); null without a data cap.
 */
export function dataBudget(options: Pick<ThroughputOptions, 'dataCapBytes' | 'dataUsedBefore'>, used: number, pending: number): number | null {
  return options.dataCapBytes === null ? null : options.dataCapBytes - options.dataUsedBefore - used - pending
}
