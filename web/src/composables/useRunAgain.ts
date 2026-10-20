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

import type { StartOptions } from '@/composables/useRun'
import type { Result } from '@/engine/messages'

// Run again from the Result detail (ui/screens.md section 2): the Test screen starts a run with the
// result's settings and label, as soon as it can start one. The result records its preset, phases,
// streams, data cap, overhead compensation, warm-up and ping count; durations come from the preset,
// which the result does not record apart from it, and the context label from this browser. A
// Continuous result also records the one direction it ran and its run length, which run again; a
// result without one runs again without one.

let pending: StartOptions | null = null

/** The start options that run `result`'s settings again. */
function runAgainOptions(result: Result): StartOptions {
  const { preset, phases, streams, dataCapBytes, overheadCompensationPercent, warmup, pingCount, continuousDirection, runLengthMs } = result.settings
  // A fixed stream count is the count a direction ran with; auto and single keep the count unused.
  const direction = [result.download, result.upload].find((part) => part !== undefined && part.status !== 'skipped')
  const ran = direction?.streams ?? 1
  const fixed = streams.mode === 'fixed' ? Math.min(Math.max(1, ran), streams.max) : 1
  // A Continuous result without a run length ran until stopped, whatever is configured now: null says none.
  const continuous = preset === 'continuous' ? { continuousDirection: continuousDirection ?? 'download', runLengthMs: runLengthMs ?? null } : {}
  return {
    ...(result.label === '' ? {} : { label: result.label }),
    settings: { preset, phases: [...phases], streams: { mode: streams.mode, max: streams.max, fixed }, dataCapBytes, overheadCompensationPercent, warmup, pingCount, ...continuous },
  }
}

/** Asks the Test screen to run `result`'s settings again once it opens. */
export function requestRunAgain(result: Result): void {
  pending = runAgainOptions(result)
}

/** The pending run-again request, taken once. */
export function takeRunAgain(): StartOptions | null {
  const request = pending
  pending = null
  return request
}
