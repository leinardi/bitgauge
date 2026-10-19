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

import type { Bufferbloat, DirectionResult, Experience, IdleResult, ScoreBand, ScoreInput, Scores } from '@/engine/messages'

// The AIM quality scores (measurement.md section 13): each input's points from its threshold
// table, each experience's clamped sum and band, the inputs an experience misses, and the basis
// the scores share with the bufferbloat grade. Pure: the result's own fields are the inputs.

/** A threshold table: below the first threshold the first points, at or above threshold i the points i + 1. */
interface Table {
  thresholds: readonly number[]
  points: readonly number[]
}

const LATENCY: Table = { thresholds: [10, 20, 50, 100, 500], points: [20, 10, 5, 0, -10, -20] }
const JITTER: Table = { thresholds: [10, 20, 100, 500], points: [10, 5, 0, -10, -20] }
const DOWNLOAD: Table = { thresholds: [1e6, 10e6, 50e6, 100e6], points: [0, 5, 10, 20, 30] }
/** Packet loss is not measured: 0 points in every experience (section 13.4). */
const PACKET_LOSS_POINTS = 0
const BANDS: readonly ScoreBand[] = ['bad', 'poor', 'average', 'good', 'great']

/** Each experience's inputs, in the order of section 13.1, and its band thresholds (section 13.3). */
const EXPERIENCES: Record<'streaming' | 'gaming' | 'rtc', { inputs: readonly ScoreInput[]; bands: readonly number[] }> = {
  streaming: { inputs: ['idle-latency', 'loaded-latency', 'download'], bands: [15, 20, 40, 60] },
  gaming: { inputs: ['idle-latency', 'loaded-latency'], bands: [5, 15, 25, 30] },
  rtc: { inputs: ['idle-latency', 'jitter', 'loaded-latency'], bands: [5, 15, 25, 40] },
}

/** The step of `value` in `thresholds`: how many of them it is at or above. */
function step(value: number, thresholds: readonly number[]): number {
  return thresholds.filter((threshold) => value >= threshold).length
}

/** The points `value` gets from `table` (section 13.2). */
function points(value: number, table: Table): number {
  return table.points[step(value, table.thresholds)] ?? 0
}

/** The band of an experience's clamped points (section 13.3). */
function band(sum: number, thresholds: readonly number[]): ScoreBand {
  return BANDS[step(sum, thresholds)] ?? 'great'
}

/** What the scores read of a result: the quantized idle statistics, the grade and the download headline. */
export interface ScoreInputs {
  idle?: Pick<IdleResult, 'medianMs' | 'jitterMs'> | undefined
  bufferbloat?: Bufferbloat | undefined
  download?: Pick<DirectionResult, 'bitsPerSecond'> | undefined
}

/** The result's scores: every experience scored or naming what it misses, and the grade's basis. */
export function scores(inputs: ScoreInputs): Scores {
  const values: Record<ScoreInput, number | undefined> = {
    'idle-latency': inputs.idle?.medianMs === undefined ? undefined : points(inputs.idle.medianMs, LATENCY),
    jitter: inputs.idle?.jitterMs === undefined ? undefined : points(inputs.idle.jitterMs, JITTER),
    'loaded-latency': inputs.bufferbloat === undefined ? undefined : points(inputs.bufferbloat.increaseMs, LATENCY),
    download: inputs.download?.bitsPerSecond === undefined ? undefined : points(inputs.download.bitsPerSecond, DOWNLOAD),
  }
  const experience = (name: keyof typeof EXPERIENCES): Experience => {
    const { inputs: used, bands } = EXPERIENCES[name]
    const missing = used.filter((input) => values[input] === undefined)
    if (missing.length > 0) {
      return { missing }
    }
    const sum = Math.max(0, used.reduce((total, input) => total + (values[input] ?? 0), PACKET_LOSS_POINTS))
    return { points: sum, band: band(sum, bands) }
  }
  return {
    basis: inputs.bufferbloat?.basis ?? 'none',
    packetLoss: 'not-measured',
    streaming: experience('streaming'),
    gaming: experience('gaming'),
    rtc: experience('rtc'),
  }
}
