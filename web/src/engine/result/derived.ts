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

import { bufferbloat } from '@/engine/latency/grade'
import type { Result } from '@/engine/messages'
import { scores } from '@/engine/result/scores'
import { quantized } from '@/engine/result/loaded'

/** Independent nearest-quantum rounding of both medians and their difference (§10, §11). */
function latencyProblems(result: Result): string[] {
  const problems: string[] = []
  const resolution = result.client.timerResolutionMs
  const quantum = Number.isFinite(resolution) && resolution > 0 ? resolution : 0
  const idle = result.idle?.medianMs
  for (const direction of ['download', 'upload'] as const) {
    const loaded = result[direction]?.loadedLatency
    if (loaded === undefined || 'status' in loaded) continue
    const path = `result.${direction}.loadedLatency`
    const values = [idle, loaded.medianMs, loaded.increaseMs].filter((value): value is number => value !== undefined)
    // Nanosecond serialization can move a grid point by half a nanosecond. For sub-nanosecond
    // clocks, testing quantized(value) alone is not idempotent; find a grid point in that interval.
    const onGrid = (value: number) => quantum === 0 || [Math.floor(value / quantum), Math.ceil(value / quantum)]
      .some((step) => quantized(step * quantum, quantum) === value)
    if (values.some((value) => !onGrid(value))) problems.push(`${path}: latency is not on the clock grid`)
    if (idle === undefined) {
      if (loaded.increaseMs !== undefined) problems.push(`${path}.increaseMs: requires idle latency`)
    } else {
      const increase = loaded.increaseMs
      const expected = Math.max(0, loaded.medianMs - idle)
      // Three independently rounded values: at most one quantum between their grid indices,
      // plus three half-nanosecond serializer errors and floating-point arithmetic error.
      const error = quantum + (quantum > 0 ? 1.5e-6 : 0) + Number.EPSILON * Math.max(idle, loaded.medianMs, increase ?? 0) * 4
      if (increase === undefined || Math.abs(increase - expected) > error) problems.push(`${path}.increaseMs: inconsistent with idle and loaded medians`)
    }
  }
  return problems
}

/** Checks imported derived values using the engine's own rules, not UI copies of the tables. */
export function validateDerivedResult(result: Result): string[] {
  const problems = latencyProblems(result)
  if (problems.length > 0) return problems
  if (result.bufferbloat !== undefined) {
    const expected = bufferbloat(result.download?.loadedLatency, result.upload?.loadedLatency, result.idle?.medianMs !== undefined)
    if (expected === undefined || result.bufferbloat.grade !== expected.grade || result.bufferbloat.basis !== expected.basis || result.bufferbloat.increaseMs !== expected.increaseMs) {
      problems.push('result.bufferbloat: inconsistent with its loaded-latency basis')
    }
  }
  if (result.scores !== undefined) {
    const expected = scores(result)
    for (const name of ['streaming', 'gaming', 'rtc'] as const) {
      const actual = result.scores[name]
      const wanted = expected[name]
      const same = 'points' in actual && 'points' in wanted
        ? actual.points === wanted.points && actual.band === wanted.band
        : 'missing' in actual && 'missing' in wanted && [...actual.missing].sort().join(',') === [...wanted.missing].sort().join(',')
      if (!same) problems.push(`result.scores.${name}: inconsistent with its inputs`)
    }
  }
  return problems
}
