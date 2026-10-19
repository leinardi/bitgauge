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

import type { Responsiveness } from '@/engine/messages'
import { quantized } from '@/engine/result/loaded'
import { mean, percentile } from '@/engine/stats/buckets'

// HTTP loaded responsiveness, path B (measurement.md sections 12.3 to 12.6): from the valid probes
// of a direction's window, the state and its precedence, TM95 over the last 4 s, the RPM and the
// result block. Pure: the prober (run/responsiveness.ts) collects the samples.

/** The fewest window samples `measured` needs (section 12.4). */
const MEASURED_SAMPLES = 10
/** The formula's four 1 s intervals, ending at the direction's end instant (section 12.5). */
const FORMULA_MS = 4000
/** The fewest samples in them that give a number. */
const FORMULA_SAMPLES = 4
/** TM95 drops floor(5 % × n) samples from the slow end. */
const TRIM_SHARE = 0.05
const MS_PER_MINUTE = 60_000

/** Whether a probe opened a new connection, reused one, or does not say (section 12.3). */
export type ConnectionEvidence = 'reused' | 'new' | 'unknown'

/** A valid path B probe, its instants on the client clock. */
export interface PathBSample {
  /** When the probe was sent: its entry's fetchStart. */
  fetchStart: number
  /** http_l = responseStart − requestStart. */
  httpMs: number
  /** responseEnd − fetchStart, whose median is `totalMedianMs`. */
  totalMs: number
  /** The probe's own nextHopProtocol. */
  protocol: string
  connection: ConnectionEvidence
}

export interface PathBInput {
  /** The capability check's nextHopProtocol; empty when it was not reported, failed or had no entry. */
  protocol: string
  /** The valid probes of the direction's window, in send order; in Continuous the last 64 (section 15). */
  samples: readonly PathBSample[]
  /** Every valid probe since the warm-up end; more than `samples` holds once a Continuous ring dropped some. */
  count?: number
  /** The direction's end instant on the client clock; null when its prober never ran. */
  endAt: number | null
  /** Whether the direction has a steady window: it is measured, or partial with a window. */
  window: boolean
  /** Whether its warm-up ended at the cap, with a condition unmet. */
  cappedWarmup: boolean
  resolutionMs: number
}

/** Whether the capability check's protocol lets path B run: h2 or h3, nothing else. */
export function pathBRuns(protocol: string): boolean {
  return protocol === 'h2' || protocol === 'h3'
}

/** The connection evidence of an entry's connect fields: none, or both zero, says nothing. */
export function connectionOf(connectStart: number | undefined, connectEnd: number | undefined): ConnectionEvidence {
  if (connectStart === undefined || connectEnd === undefined || (connectStart === 0 && connectEnd === 0)) {
    return 'unknown'
  }
  return connectStart === connectEnd ? 'reused' : 'new'
}

/** TM95: the mean after dropping floor(5 % × n) samples from the slow end; null without samples. */
export function tm95(values: readonly number[]): { meanMs: number; trimmed: number } | null {
  const trimmed = Math.floor(TRIM_SHARE * values.length)
  const kept = [...values].sort((left, right) => left - right).slice(0, values.length - trimmed)
  const meanMs = mean(kept)
  return meanMs === null ? null : { meanMs, trimmed }
}

/** The direction's responsiveness block, its state by the precedence of section 12.4. */
export function responsiveness(input: PathBInput): Responsiveness {
  const { protocol, samples, endAt, resolutionMs } = input
  const total = input.count ?? samples.length
  const counted = { protocol, samples: total }
  if (!pathBRuns(protocol)) {
    return { state: 'unavailable_h1', ...counted }
  }
  const last = endAt === null ? [] : samples.filter((sample) => sample.fetchStart >= endAt - FORMULA_MS && sample.fetchStart <= endAt)
  const trimmedMean = last.length < FORMULA_SAMPLES ? null : tm95(last.map((sample) => sample.httpMs))
  const tm95Ms = trimmedMean === null ? 0 : quantized(trimmedMean.meanMs, resolutionMs)
  const totalMedian = percentile(samples.map((sample) => sample.totalMs), 50)
  // A quantized TM95 of 0 gives no RPM (section 12.5).
  if (!input.window || trimmedMean === null || tm95Ms <= 0 || totalMedian === null) {
    return { state: 'unavailable_insufficient', ...counted }
  }
  const uncertain =
    total < MEASURED_SAMPLES || input.cappedWarmup || samples.some((sample) => sample.connection !== 'reused' || sample.protocol !== protocol)
  return {
    state: uncertain ? 'uncertain' : 'measured',
    ...counted,
    rpm: Math.round(MS_PER_MINUTE / tm95Ms),
    tm95Ms,
    trimmed: trimmedMean.trimmed,
    totalMedianMs: quantized(totalMedian, resolutionMs),
  }
}
