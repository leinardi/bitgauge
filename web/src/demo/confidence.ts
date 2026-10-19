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
import type { Confidence, Direction, Notice, Result } from '@/engine/messages'

// The Result detail's confidence choice (frontend.md section 9): the one place the demo sets a value
// the engine did not find, as the kit's panel does (App.jsx CONF_OPTS), since a link cannot be made
// to reach each confidence on demand. "normal" leaves the engine's own; any other choice replaces,
// on the finished result, the confidence of a direction that has a number, with the matching
// low-confidence notice in place of the engine's.

export type DemoConfidence = 'normal' | 'low:ramp-unsettled' | 'low:unstable' | 'low:ramp-unsettled,unstable' | 'low:insufficient-samples,unstable' | 'cpu-bound'

/** The choices in the kit's order, with its words. */
export const DEMO_CONFIDENCES: readonly (readonly [DemoConfidence, string])[] = [
  ['normal', 'normal'],
  ['low:ramp-unsettled', 'low · ramp unsettled'],
  ['low:unstable', 'low · unstable'],
  ['low:ramp-unsettled,unstable', 'low · ramp unsettled, unstable'],
  ['low:insufficient-samples,unstable', 'low · insufficient samples, unstable'],
  ['cpu-bound', 'CPU-bound'],
]

export function isDemoConfidence(value: unknown): value is DemoConfidence {
  return DEMO_CONFIDENCES.some(([choice]) => choice === value)
}

const CONFIDENCES: Record<Exclude<DemoConfidence, 'normal'>, Confidence> = {
  'low:ramp-unsettled': { level: 'low', reasons: ['ramp-unsettled'] },
  'low:unstable': { level: 'low', reasons: ['unstable'] },
  'low:ramp-unsettled,unstable': { level: 'low', reasons: ['ramp-unsettled', 'unstable'] },
  'low:insufficient-samples,unstable': { level: 'low', reasons: ['insufficient-samples', 'unstable'] },
  'cpu-bound': { level: 'cpu-bound', reasons: [] },
}

/** `result` with each direction's chosen confidence, where it has one to replace. */
export function withConfidence(result: Result, choice: Record<Direction, DemoConfidence>): Result {
  let next = result
  for (const direction of ['download', 'upload'] as const) {
    const part = next[direction]
    const chosen = choice[direction]
    if (chosen === 'normal' || part?.confidence === undefined || part.bitsPerSecond === undefined) {
      continue
    }
    const confidence = CONFIDENCES[chosen]
    // The chosen notice takes the engine's place in the list, or goes last where it had none.
    const engines = (notice: Notice) => notice.code === 'low-confidence' && notice.direction === direction
    const at = next.notices.findIndex(engines)
    const notices = next.notices.filter((notice) => !engines(notice))
    if (confidence.level === 'low') {
      notices.splice(at === -1 ? notices.length : at, 0, { code: 'low-confidence', direction, reasons: [...confidence.reasons] })
    }
    next = { ...next, [direction]: { ...part, confidence: { level: confidence.level, reasons: [...confidence.reasons] } }, notices }
  }
  return next
}
