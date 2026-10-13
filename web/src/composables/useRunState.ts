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

import { type ShallowRef, shallowRef, triggerRef } from 'vue'

import type {
  Direction,
  EngineErrorCode,
  EngineEvent,
  MeasuringPhase,
  Notice,
  PhaseName,
  PhaseState,
  Result,
  SteadySoFar,
} from '@/engine/messages'

// The live view of a run (frontend.md section 4), fed by the engine's phase, sample, result and
// error events. No event marks the end of a run: it is read from their order (architecture.md
// section 4), which is what `settle` does after every event. A start the Worker cannot run, after a
// refused configure or once the Worker itself failed, ends at once.

/** Idle before and between runs; ended once the run has a result or an error to show. */
export type RunStatus = 'idle' | 'running' | 'ended'

/** A phase of the current run: pending until its first event. */
export interface PhaseView {
  state: PhaseState | 'pending'
  protocol?: string
  streams?: number
}

/** The live numbers of one direction, as the last `sample` carried them. */
export interface DirectionLive {
  /** The bucket of `values[0]`: from the phase start on download, a server grid cell on upload. */
  firstBucket: number
  /** Bytes per bucket; `null` is an unknown bucket, never zero. */
  values: (number | null)[]
  /** Upload only: the current window end on the server grid. */
  windowEnd: number | null
  /** Bits per second over the last 5 buckets. */
  gauge: number
  /** Upload only: the client's sending progress in bits per second. */
  sending: number | null
  /** The steady-window average and peak so far; null while warming up. */
  steady: SteadySoFar | null
}

/** An engine error code, or `internal` for the Worker's uncaught error (ui/flows.md section 5). */
export interface RunError {
  code: EngineErrorCode | 'internal'
  phase: PhaseName | null
  partial: boolean
}

const MEASURING: readonly MeasuringPhase[] = ['idle', 'download', 'upload']
const ENDED: readonly PhaseState[] = ['finished', 'failed', 'skipped']

function pendingPhases(): Record<PhaseName, PhaseView> {
  return { info: { state: 'pending' }, idle: { state: 'pending' }, download: { state: 'pending' }, upload: { state: 'pending' } }
}

function emptyLive(): Record<Direction, DirectionLive | null> {
  return { download: null, upload: null }
}

/** Writes a sample's range of buckets into the direction's buffer, unknown across any hole. */
function record(live: DirectionLive | null, event: Extract<EngineEvent, { type: 'sample' }>): DirectionLive {
  const buffer = live ?? { firstBucket: event.fromBucket, values: [], windowEnd: null, gauge: 0, sending: null, steady: null }
  const offset = event.fromBucket - buffer.firstBucket
  while (buffer.values.length < offset) {
    buffer.values.push(null)
  }
  buffer.values.splice(offset, event.values.length, ...event.values)
  buffer.windowEnd = event.windowEnd ?? null
  buffer.gauge = event.gauge
  buffer.sending = event.sending ?? null
  buffer.steady = event.steady ?? null
  return buffer
}

/** The state of the current run and the reducer that applies the engine's events to it. */
export function createRunState() {
  const status = shallowRef<RunStatus>('idle')
  const phase = shallowRef<PhaseName | null>(null)
  const phases = shallowRef(pendingPhases())
  const live = shallowRef(emptyLive())
  const direction = shallowRef<Direction | null>(null)
  const protocol = shallowRef<string | null>(null)
  const dataUsedBytes = shallowRef(0)
  const notices = shallowRef<Notice[]>([])
  const result = shallowRef<Result | null>(null)
  const error = shallowRef<RunError | null>(null)
  let stopSent = false
  /** Whether the run has had a phase event: a refused start is answered by an error alone. */
  let seenPhase = false
  /** A stopped run that returned to Idle: its late phase events and result still apply. */
  let lingering = false
  /** The Worker refused the last configure, so it would run older settings than the UI shows. */
  let configureRefused = false
  /** The Worker failed outside a run (it did not load, or threw at the top level). */
  let workerFailed = false

  // The run is over without a result once every measuring phase has had its last event (a stop
  // during idle latency gives it none) and none finished; otherwise a result is still to come.
  function settle(): void {
    if (status.value !== 'running') {
      return
    }
    const view = phases.value
    const over = MEASURING.every((name) => {
      const { state } = view[name]
      return (state !== 'pending' && ENDED.includes(state)) || (name === 'idle' && stopSent && state === 'started')
    })
    if (over && !MEASURING.some((name) => view[name].state === 'finished')) {
      lingering = error.value === null
      status.value = error.value === null ? 'idle' : 'ended'
    }
  }

  function onPhase(event: Extract<EngineEvent, { type: 'phase' }>): void {
    const view: PhaseView = { state: event.state }
    if (event.protocol !== undefined) {
      view.protocol = event.protocol
      protocol.value = event.protocol
    }
    if (event.streams !== undefined) {
      view.streams = event.streams
    }
    seenPhase = true
    phases.value = { ...phases.value, [event.phase]: view }
    if (event.state === 'started') {
      phase.value = event.phase
    }
    notices.value = event.notices
  }

  function onSample(event: Extract<EngineEvent, { type: 'sample' }>): void {
    live.value[event.direction] = record(live.value[event.direction], event)
    triggerRef(live)
    direction.value = event.direction
    dataUsedBytes.value = event.dataUsedBytes
  }

  return {
    status: status as Readonly<ShallowRef<RunStatus>>,
    /** The phase started last. */
    phase: phase as Readonly<ShallowRef<PhaseName | null>>,
    phases: phases as Readonly<ShallowRef<Record<PhaseName, PhaseView>>>,
    /** Each direction's live numbers and series buffer, null until its first sample. */
    live: live as Readonly<ShallowRef<Record<Direction, DirectionLive | null>>>,
    /** The direction of the last sample: the one the gauge shows. */
    direction: direction as Readonly<ShallowRef<Direction | null>>,
    protocol: protocol as Readonly<ShallowRef<string | null>>,
    dataUsedBytes: dataUsedBytes as Readonly<ShallowRef<number>>,
    /** The notices so far, then the result's. */
    notices: notices as Readonly<ShallowRef<Notice[]>>,
    result: result as Readonly<ShallowRef<Result | null>>,
    error: error as Readonly<ShallowRef<RunError | null>>,

    /**
     * Clears the last run's view for a new one; false when the Worker cannot run it, which ends the
     * run at once with the reason.
     */
    begin(): boolean {
      phase.value = null
      phases.value = pendingPhases()
      live.value = emptyLive()
      direction.value = null
      protocol.value = null
      dataUsedBytes.value = 0
      notices.value = []
      result.value = null
      error.value = null
      stopSent = false
      seenPhase = false
      lingering = false
      if (workerFailed || configureRefused) {
        error.value = { code: workerFailed ? 'internal' : 'invalid-settings', phase: null, partial: false }
        status.value = 'ended'
        return false
      }
      status.value = 'running'
      return true
    },

    /** A new configure is on its way; the Worker answers only when it refuses it. */
    configuring(): void {
      configureRefused = false
    },

    /** Records that the UI sent `stop`. */
    stopping(): void {
      stopSent = true
      settle()
    },

    /**
     * The Worker's uncaught error: a run in progress ends with no result, and outside a run the
     * Worker is taken as failed, so every later start ends at once.
     */
    crash(): void {
      if (status.value === 'running') {
        error.value = { code: 'internal', phase: null, partial: false }
        status.value = 'ended'
      } else {
        workerFailed = true
      }
    },

    apply(event: EngineEvent): void {
      if (event.type === 'result') {
        // A result is always shown, even one that arrives after a stop returned the screen to
        // Idle: its phase finished just before the stop reached the Worker.
        result.value = event.result
        notices.value = event.result.notices
        dataUsedBytes.value = event.result.dataUsedBytes
        lingering = false
        status.value = 'ended'
        return
      }
      if (event.type === 'error' && status.value !== 'running') {
        // With no run in progress, only a configure is answered.
        configureRefused ||= event.code === 'invalid-settings'
        return
      }
      if (status.value !== 'running' && !lingering) {
        return
      }
      if (event.type === 'phase') {
        onPhase(event)
      } else if (event.type === 'sample') {
        onSample(event)
      } else {
        error.value = { code: event.code, phase: event.phase ?? null, partial: event.partial }
        if (!seenPhase) {
          // A refused start: no phase event comes before or after its error.
          status.value = 'ended'
        }
      }
      settle()
    },
  }
}
