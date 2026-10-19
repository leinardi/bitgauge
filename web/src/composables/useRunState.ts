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

import { type ShallowRef, shallowRef } from 'vue'

import type {
  Direction,
  DirectionResult,
  EngineErrorCode,
  EngineEvent,
  IdleResult,
  MeasuringPhase,
  Notice,
  PhaseName,
  PhaseState,
  Result,
  TestSettings,
} from '@/engine/messages'
import { type DirectionLive, emptyLive, type LiveRings, liveRings, record } from '@/composables/runLive'

// The live view of a run (frontend.md section 4), fed by the engine's settings, phase, sample, idle,
// result and error events. No event marks the end of a run: it is read from their order (architecture.md
// section 4), which is what `settle` does after every event. A start the Worker cannot run, after a
// refused configure or once the Worker itself failed, ends at once.

/** Idle before and between runs; ended once the run has a result or an error to show. */
export type RunStatus = 'idle' | 'running' | 'ended'

/** A phase of the current run: pending until its first event. */
export interface PhaseView {
  state: PhaseState | 'pending'
  protocol?: string
  streams?: number
  /** A finished or failed direction's part of the result, as its phase event carried it. */
  result?: DirectionResult
  /** A finished idle latency's part of the result, as its phase event carried it. */
  idle?: IdleResult
  /** A failed phase: how long it ran, as its phase event carried it. */
  ranMs?: number
}

/** Idle latency so far, as the last `idle` event carried it. */
export type IdleLive = Omit<Extract<EngineEvent, { type: 'idle' }>, 'type'>

/** One ping of idle latency on the phase's clock: its round-trip time, null when it gave none. */
export interface LatencyPoint {
  atMs: number
  rttMs: number | null
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

/** The state of the current run and the reducer that applies the engine's events to it. */
export function createRunState() {
  const status = shallowRef<RunStatus>('idle')
  const phase = shallowRef<PhaseName | null>(null)
  const phases = shallowRef(pendingPhases())
  const live = shallowRef(emptyLive())
  /** Each direction's live rings, allocated at its phase start. */
  let rings: Partial<Record<Direction, LiveRings>> = {}
  const idle = shallowRef<IdleLive | null>(null)
  const latency = shallowRef<LatencyPoint[]>([])
  const configured = shallowRef<TestSettings | null>(null)
  const runSettings = shallowRef<TestSettings | null>(null)
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
    if (event.result !== undefined) {
      view.result = event.result
    }
    if (event.idle !== undefined) {
      view.idle = event.idle
    }
    if (event.ranMs !== undefined) {
      view.ranMs = event.ranMs
    }
    seenPhase = true
    phases.value = { ...phases.value, [event.phase]: view }
    if (event.state === 'started') {
      phase.value = event.phase
      if (event.phase === 'download' || event.phase === 'upload') {
        rings[event.phase] = liveRings(runSettings.value, event.phase)
      }
    }
    notices.value = event.notices
  }

  // A new record and direction object per sample, so that a component given them as props sees
  // the change; the rings behind them are written in place.
  function onSample(event: Extract<EngineEvent, { type: 'sample' }>): void {
    const own = (rings[event.direction] ??= liveRings(runSettings.value, event.direction))
    live.value = { ...live.value, [event.direction]: { ...record(live.value[event.direction], own, event) } }
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
    /** The settings the engine resolved from the last valid configure: what the next run starts from. */
    configured: configured as Readonly<ShallowRef<TestSettings | null>>,
    /** The settings of the current or last run, its override applied; null before the run starts. */
    runSettings: runSettings as Readonly<ShallowRef<TestSettings | null>>,
    /** Idle latency so far: the ping counter, the last RTT and the running median; null before the first ping. */
    idle: idle as Readonly<ShallowRef<IdleLive | null>>,
    /** Each ping after the warm-up one, for the latency samples chart; a restarted idle latency starts it afresh. */
    latency: latency as Readonly<ShallowRef<LatencyPoint[]>>,
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
      rings = {}
      idle.value = null
      latency.value = []
      runSettings.value = null
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
      if (event.type === 'settings') {
        // A configure is answered whether or not a run is in progress; a run's come as it starts.
        if (event.scope === 'configured') {
          configured.value = event.settings
        } else if (status.value === 'running') {
          runSettings.value = event.settings
        }
        return
      }
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
      } else if (event.type === 'idle') {
        const { type: _type, ...progress } = event
        idle.value = progress
        // The warm-up ping is no sample; each later one is its RTT, or a gap when it gave none.
        latency.value = event.pings <= 1 ? [] : [...latency.value, { atMs: event.phaseMs, rttMs: event.rttMs ?? null }]
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
