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

import type { DirectionResult, EngineEvent, IdleResult, Notice, PhaseName, PhaseState } from '@/engine/messages'

// The `phase` event of architecture.md section 4, built from what the run knows when a phase
// starts, finishes, fails or is skipped.

/** What a phase event may carry beyond its phase, state and notices. */
interface PhaseDetails {
  protocol: string | null
  streams: number | undefined
  /** A finished or failed direction's result block. */
  result: DirectionResult | undefined
  /** A finished idle latency's result block. */
  idle: IdleResult | undefined
  /** A failed phase: how long it ran, in ms from its start on the engine's clock. */
  ranMs: number | undefined
}

/** The phase event, every optional field present only when it has a value. */
export function phaseEvent(phase: PhaseName, state: PhaseState, notices: Notice[], { protocol, streams, result, idle, ranMs }: PhaseDetails): EngineEvent {
  return {
    type: 'phase',
    phase,
    state,
    notices,
    ...(protocol === null ? {} : { protocol }),
    ...(streams === undefined ? {} : { streams }),
    ...(result === undefined ? {} : { result }),
    ...(idle === undefined ? {} : { idle }),
    ...(ranMs === undefined ? {} : { ranMs }),
  }
}
