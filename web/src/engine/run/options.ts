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

import type { Direction, DurationBounds, NoBounds } from '@/engine/messages'
import type { WarmupEnd } from '@/engine/phases/warmup'
import type { LoadedProbes } from '@/engine/run/latency'
import type { ResponsivenessProbes } from '@/engine/run/responsiveness'
import type { RunSettings } from '@/engine/settings'
import type { Clock, Info, Transport } from '@/engine/types'

// A throughput phase's options as the run sets them (measurement.md sections 5, 8.5 and 15): the
// settings' bounds, none in Continuous, which has its run length instead, the data used so far, the
// probe reservation, and the hooks that end loaded latency and start path B.

export interface PhaseContext {
  clock: Clock
  transport: Transport
  settings: RunSettings
  limits: Info['limits']
  /** The data the run used before this phase. */
  dataUsedBefore: number
  /** The idle-latency median, which sizes the first requests. */
  rttMs: number | null
  loaded: LoadedProbes
  responsiveness: ResponsivenessProbes
  /** A Continuous direction's warm-up ended: the steady start, from which its cpu-bound check reads. */
  steady: (end: WarmupEnd) => void
}

/** The bounds a bounded preset resolved; null for Continuous, which has neither a minimum nor a maximum. */
function boundsOf(bounds: DurationBounds | NoBounds): DurationBounds | null {
  return bounds.minMs === null || bounds.maxMs === null ? null : { minMs: bounds.minMs, maxMs: bounds.maxMs }
}

export function phaseOptions(direction: Direction, context: PhaseContext) {
  const { settings, loaded, responsiveness } = context
  const continuous = settings.preset === 'continuous'
  return {
    clock: context.clock,
    transport: context.transport,
    preset: settings.preset,
    streams: settings.streams,
    bounds: continuous ? null : boundsOf(settings[direction]),
    ...(continuous ? { continuous: { runLengthMs: settings.runLengthMs ?? null } } : {}),
    warmup: settings.warmup,
    dataCapBytes: settings.dataCapBytes,
    dataUsedBefore: context.dataUsedBefore,
    limits: context.limits,
    rttMs: context.rttMs,
    ...loaded.reserve(direction),
    ended: (graceMs: number) => {
      loaded.end(direction, graceMs)
      responsiveness.end(direction)
    },
    warmedUp: (end: WarmupEnd) => {
      responsiveness.warmedUp(direction, end, continuous)
      if (continuous) {
        context.steady(end)
      }
    },
  }
}
