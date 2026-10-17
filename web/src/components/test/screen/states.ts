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

import type { PhaseStep } from '@/components/test/steps'
import { dataTile, directionTile, durationTile, type IdleInput, idleErrorTile, idleTile, jitterTile, packetLossTile, type TileView } from '@/components/test/tiles'
import type { Wording } from '@/components/test/wording'
import type { DirectionLive, IdleLive, PhaseView, RunError, RunStatus } from '@/composables/useRunState'
import type { Direction, DirectionResult, MeasuringPhase, PhaseName, Result, TestSettings } from '@/engine/messages'
import { formatBytes, formatLatency, formatRate } from '@/lib/format'

// The Test screen's states (ui/screens.md section 1), derived from the run's live view: which
// state, the phase steps and the metric tiles; the gauge is screen/view.ts. Nothing here is a
// number of its own: it only places and words what the engine sent.

/** The screen states of a run; offline and the countdown sit beside them. */
export type ScreenState = 'idle' | 'running' | 'done' | 'cancelled' | 'error'

/** The run's live view, as useRun keeps it. */
export interface RunView {
  status: RunStatus
  phase: PhaseName | null
  phases: Record<PhaseName, PhaseView>
  live: Record<Direction, DirectionLive | null>
  idle: IdleLive | null
  dataUsedBytes: number
  result: Result | null
  error: RunError | null
}

/** Idle latency sends a ping no sooner than this after the previous one (measurement.md section 10). */
export const PING_SPACING_MS = 100

export function screenState(run: Pick<RunView, 'status' | 'result' | 'error'>): ScreenState {
  if (run.status === 'running') {
    return 'running'
  }
  if (run.status === 'idle') {
    return 'idle'
  }
  switch (run.result?.status) {
    case 'complete':
      return 'done'
    case 'partial':
      return 'cancelled'
    default:
      return 'error'
  }
}

function activeStep(phase: MeasuringPhase, run: RunView, settings: TestSettings): PhaseStep {
  if (phase === 'idle') {
    const idle = run.idle
    return idle === null ? { phase, state: 'active' } : { phase, state: 'active', progress: idle.pings / idle.count, pings: { n: idle.pings, count: idle.count } }
  }
  const elapsed = run.live[phase]?.phaseMs ?? null
  if (elapsed === null) {
    return { phase, state: 'active', progress: 0 }
  }
  // The phase's own time, on the client clock as its duration rule runs; time left to the minimum,
  // and past it, while the phase extends, to the maximum.
  const { minMs, maxMs } = settings[phase]
  const left = (elapsed < minMs ? minMs : maxMs) - elapsed
  return { phase, state: 'active', progress: elapsed / maxMs, ...(left > 0 ? { leftMs: left } : {}) }
}

/** A stop during idle latency that kept its samples (measurement.md section 10): no direction ran. */
export function idleStopped(result: Result | null): boolean {
  const ran = (direction: DirectionResult | undefined) => direction !== undefined && direction.status !== 'skipped'
  return result?.status === 'partial' && result.idle !== undefined && !ran(result.download) && !ran(result.upload)
}

/** A finished measuring phase as the result tells it: done with its value, capped, cancelled or failed. */
function finishedStep(phase: MeasuringPhase, run: RunView, units: 'bits' | 'bytes', locale: string): PhaseStep {
  const result = run.result
  if (phase === 'idle' && idleStopped(result) && run.idle !== null) {
    return { phase, state: 'cancelled', progress: run.idle.pings / run.idle.count, pings: { n: run.idle.pings, count: run.idle.count } }
  }
  if (phase === 'idle') {
    const median = result?.idle?.medianMs ?? run.idle?.medianMs
    return median === undefined ? { phase, state: 'done' } : { phase, state: 'done', value: formatLatency(median, locale, result?.client.timerResolutionMs) }
  }
  const direction = result?.[phase]
  if (direction === undefined) {
    // Mid-run, before the result: the headline its phase event carried, or none at all.
    const headline = run.phases[phase].result?.bitsPerSecond
    return headline === undefined ? { phase, state: 'done', insufficient: true } : { phase, state: 'done', value: formatRate(headline, units, locale) }
  }
  if (direction.status === 'insufficient-data') {
    return { phase, state: 'done', insufficient: true }
  }
  if (direction.status === 'error') {
    return { phase, state: 'failed', progress: 1 }
  }
  if (direction.status === 'partial') {
    const stopped = result?.notices.find((notice) => notice.code === 'stopped-early' && notice.direction === phase)
    return { phase, state: 'cancelled', progress: 1, ...(stopped?.code === 'stopped-early' ? { coveredMs: stopped.coveredMs } : {}) }
  }
  if (direction.events.some((event) => event.code === 'data-cap')) {
    return { phase, state: 'capped', progress: 1 }
  }
  return direction.bitsPerSecond === undefined ? { phase, state: 'done' } : { phase, state: 'done', value: formatRate(direction.bitsPerSecond, units, locale) }
}

/** The steps before the server's settings are known: each phase pending, with no estimate. */
export const PENDING_STEPS: PhaseStep[] = [
  { phase: 'idle', state: 'pending' },
  { phase: 'download', state: 'pending' },
  { phase: 'upload', state: 'pending' },
]

/** The phase indicator's steps, in the run's order; between runs every step is pending. */
export function phaseSteps(run: RunView, settings: TestSettings, locale: string): PhaseStep[] {
  return settings.phases.map((phase): PhaseStep => {
    const pending: PhaseStep = { phase, state: 'pending', estimate: phase === 'idle' ? { aboutMs: settings.pingCount * PING_SPACING_MS } : settings[phase] }
    if (run.status === 'idle') {
      return pending
    }
    const view = run.phases[phase].state
    switch (view) {
      case 'pending':
        return pending
      case 'started':
        // A phase still started once the run is over was interrupted: a stop during idle latency.
        return run.status === 'running' ? activeStep(phase, run, settings) : { phase, state: 'cancelled' }
      case 'finished':
        return finishedStep(phase, run, settings.units, locale)
      case 'failed': {
        const ranMs = run.phases[phase].ranMs
        return { phase, state: 'failed', progress: 1, ...(ranMs === undefined ? {} : { interruptedMs: ranMs }) }
      }
      case 'skipped':
        return { phase, state: 'skipped' }
    }
  })
}

/**
 * Data used and its qualifier: "—" until the first byte, "so far" while running, with the
 * download's own bytes while upload runs after a download without a number; "not saved" after an
 * error.
 */
function dataUsed(run: RunView, context: Wording): TileView {
  const { t, locale } = context
  const tile = dataTile(run.status === 'idle' || run.dataUsedBytes === 0 ? null : run.dataUsedBytes, context)
  if (tile.number === null) {
    return tile
  }
  const download = run.phases.download
  let sub: string | null = null
  if (run.status === 'running') {
    const share = run.phase === 'upload' && download.result?.bitsPerSecond === undefined ? download.result?.bytes : undefined
    sub = share === undefined ? t('test.tiles.dataSoFar') : t('test.tiles.dataSoFarDownload', { bytes: formatBytes(share, locale) })
  } else if (screenState(run) === 'error') {
    sub = t('test.tiles.notSaved')
  }
  return sub === null ? tile : { ...tile, lines: [{ text: sub }] }
}

/** The duration: counting up "elapsed" while the run goes on, then the result's, or where it ended without one. */
function duration(run: RunView, elapsed: number | null, context: Wording): TileView {
  if (run.status === 'idle') {
    return durationTile(null, context)
  }
  const tile = durationTile(run.result?.durationMs ?? elapsed, context)
  return run.status === 'running' && tile.number !== null ? { ...tile, lines: [{ text: context.t('test.tiles.elapsed') }] } : tile
}

/** What the tiles need of the settings: the units and overhead, and when known the phases and bounds. */
export type TileSettings = Pick<TestSettings, 'units' | 'overheadCompensationPercent'> & Partial<Pick<TestSettings, 'phases' | 'download' | 'upload'>>

/** Idle latency for its two tiles: live while it runs, its part of the result once it finished. */
function idleInput(run: RunView, result: Result | null): IdleInput | null {
  const protocol = run.phases.info.protocol ?? result?.client.protocol ?? null
  const resolutionMs = result?.client.timerResolutionMs ?? 0
  if (run.status === 'running' && run.phase === 'idle') {
    return run.idle === null ? null : { idle: run.idle, resolutionMs, protocol, live: true }
  }
  const idle = result?.idle ?? run.phases.idle.idle
  if (idle === undefined) {
    return null
  }
  const stopped = idleStopped(result) ? { samples: idle.samples.length, pings: run.idle?.pings ?? idle.samples.length + 1 } : null
  return { idle, resolutionMs, protocol, live: false, stopped }
}

/** The metric tiles: the four main ones, then data used and duration, and the packet-loss slot. */
export function screenTiles(run: RunView, settings: TileSettings, context: Wording, elapsedMs: number | null = null): { main: TileView[]; more: TileView[]; packetLoss: TileView } {
  const shown = run.status !== 'idle'
  const result = shown ? run.result : null
  // Live numbers only while the run is going: a run that ended without a result has none to show.
  const running = run.status === 'running'
  const order = (settings.phases ?? ['download', 'upload']).filter((phase): phase is Direction => phase !== 'idle')
  const current = run.phase === 'download' || run.phase === 'upload' ? order.indexOf(run.phase) : -1
  const direction = (name: Direction) => {
    const view = run.live[name]
    const live = running && view !== null ? { steady: view.steady, confirmed: view.start !== null } : null
    // A finished direction shows its part of the result at once, before the run's result.
    const part = result?.[name] ?? (shown ? run.phases[name].result : undefined) ?? null
    const upNext = running && current >= 0 && order.indexOf(name) === current + 1 && run.phases[name].state === 'pending'
    const tile = directionTile({ direction: name, units: settings.units, live, result: part, overheadPercent: settings.overheadCompensationPercent, upNext, ...(settings[name] === undefined ? {} : { maxMs: settings[name].maxMs }) }, context)
    return shown && part === null && run.phases[name].state === 'skipped' ? { ...tile, lines: [{ text: context.t('test.tiles.skipped') }] } : tile
  }
  const idle = shown ? idleInput(run, result) : null
  const idleFailed = shown && idle === null && run.error?.phase === 'idle' && run.idle !== null
  return {
    main: [direction('download'), direction('upload'), idleFailed && run.idle !== null ? idleErrorTile(run.idle, context) : idleTile(idle, context), jitterTile(idle, context)],
    more: [dataUsed(run, context), duration(run, elapsedMs, context)],
    packetLoss: packetLossTile(context),
  }
}
