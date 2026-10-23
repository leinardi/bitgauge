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

import type { MeasuringPhase } from '@/engine/messages'

// The phase indicator's steps (ui/screens.md section 1, design_system/components/phase-indicator.md).

/** What a step shows; the Test screen derives it from the engine's phase events and the result. */
export type StepState = 'pending' | 'active' | 'done' | 'failed' | 'cancelled' | 'skipped' | 'capped'

export interface PhaseStep {
  phase: MeasuringPhase
  state: StepState
  /** Active: how much of the phase has run, 0 to 1; failed, cancelled and capped stop the bar there. */
  progress?: number
  /** Active: the time left to the phase's minimum, or past it to its maximum, when known. */
  leftMs?: number
  /** Active or cancelled idle latency: the pings so far, of the count. */
  pings?: { n: number; count: number }
  /** Pending: the phase's duration range, or for idle latency its approximate length. */
  estimate?: { minMs: number; maxMs: number } | { aboutMs: number }
  /** Done: the phase's result, already formatted. */
  value?: string
  /** Done: the direction ended without a number; a stopped bounded one reads cancelled instead. */
  insufficient?: boolean
  /** Cancelled: when the user stopped the phase, on its phase timeline. */
  stoppedAtMs?: number
  /** Failed: how long the phase ran before it was interrupted. */
  interruptedMs?: number
  /** A Continuous direction: its elapsed time, against the run length when one is set. */
  continuous?: { elapsedMs: number; runLengthMs?: number }
}
