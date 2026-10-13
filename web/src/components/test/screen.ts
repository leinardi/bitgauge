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
import { dataTile, directionTile, durationTile, idleLiveTile, idleTile, jitterTile, packetLossTile, type TileView } from '@/components/test/tiles'
import type { Wording } from '@/components/test/wording'
import type { DirectionLive, IdleLive, PhaseView, RunError, RunStatus } from '@/composables/useRunState'
import type { Direction, MeasuringPhase, PhaseName, Result, TestSettings } from '@/engine/messages'
import { formatLatency, formatRate } from '@/lib/format'

// The Test screen's states (ui/screens.md section 1) and what each shows, derived from the run's
// live view: which state, the phase steps, the gauge's input and the metric tiles. Nothing here is
// a number of its own: it only places and words what the engine sent.

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

const BUCKET_MS = 100

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

/** How far a running direction has come, in milliseconds from its phase start; null before it is known. */
function elapsedMs(direction: Direction, live: DirectionLive | null): number | null {
  if (live === null) {
    return null
  }
  if (direction === 'download') {
    return (live.firstBucket + live.values.length) * BUCKET_MS
  }
  const sent = live.sendingTrace.at(-1)
  return sent === undefined || live.start === null ? null : (sent.cell - live.start) * BUCKET_MS
}

function activeStep(phase: MeasuringPhase, run: RunView, settings: TestSettings): PhaseStep {
  if (phase === 'idle') {
    return run.idle === null ? { phase, state: 'active' } : { phase, state: 'active', progress: run.idle.pings / run.idle.count }
  }
  const elapsed = elapsedMs(phase, run.live[phase])
  if (elapsed === null) {
    return { phase, state: 'active', progress: 0 }
  }
  const { minMs, maxMs } = settings[phase]
  return { phase, state: 'active', progress: elapsed / maxMs, ...(elapsed < minMs ? { leftMs: minMs - elapsed } : {}) }
}

/** A finished measuring phase as the result tells it: done with its value, capped, cancelled or failed. */
function finishedStep(phase: MeasuringPhase, run: RunView, units: 'bits' | 'bytes', locale: string): PhaseStep {
  const result = run.result
  if (phase === 'idle') {
    const median = result?.idle?.medianMs ?? run.idle?.medianMs
    return median === undefined ? { phase, state: 'done' } : { phase, state: 'done', value: formatLatency(median, locale, result?.client.timerResolutionMs) }
  }
  const direction = result?.[phase]
  if (direction === undefined) {
    return { phase, state: 'done' }
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

/** The phase indicator's steps, in the run's order; between runs every step is pending. */
export function phaseSteps(run: RunView, settings: TestSettings, locale: string): PhaseStep[] {
  return settings.phases.map((phase): PhaseStep => {
    const pending: PhaseStep = phase === 'idle' ? { phase, state: 'pending' } : { phase, state: 'pending', estimate: settings[phase] }
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
      case 'failed':
        return { phase, state: 'failed', progress: 1 }
      case 'skipped':
        return { phase, state: 'skipped' }
    }
  })
}

/** What the gauge shows. */
export interface GaugeInput {
  mode: 'rate' | 'ms'
  direction: Direction | null
  value: number | null
  peak: number | null
  inner: number | null
  label: string
  at: number | null
}

/**
 * The gauge: idle latency in milliseconds, the download rate with its steady peak, the upload's
 * sending progress; once a result is in, the download headline with the upload headline inside.
 */
export function gaugeInput(run: RunView, { t }: Wording): GaugeInput {
  const none: GaugeInput = { mode: 'rate', direction: null, value: null, peak: null, inner: null, label: t('test.gauge.ready'), at: null }
  if (run.status === 'running') {
    switch (run.phase) {
      case 'idle':
        return { ...none, mode: 'ms', value: run.idle?.rttMs ?? null, label: t('test.gauge.idle') }
      case 'download': {
        const live = run.live.download
        return { ...none, direction: 'download', value: live?.gauge ?? null, peak: live?.steady?.peakBitsPerSecond ?? null, label: t('test.gauge.download'), at: elapsedMs('download', live) }
      }
      case 'upload': {
        const sent = run.live.upload?.sendingTrace.at(-1)
        return { ...none, direction: 'upload', value: run.live.upload?.sending ?? null, label: t('test.gauge.sending'), at: sent === undefined ? null : sent.cell * BUCKET_MS }
      }
      default:
        return none
    }
  }
  const result = run.result
  if (run.status === 'idle' || result === null) {
    return none
  }
  const download = result.download?.bitsPerSecond ?? null
  const upload = result.upload?.bitsPerSecond ?? null
  if (download === null && upload !== null) {
    return { ...none, direction: 'upload', value: upload, label: t('test.gauge.upload') }
  }
  return { ...none, direction: 'download', value: download, peak: result.download?.peakBitsPerSecond ?? null, inner: upload, label: t('test.gauge.download') }
}

/** The metric tiles: the four main ones, then data used and duration, and the packet-loss slot. */
export function screenTiles(run: RunView, settings: TestSettings, context: Wording): { main: TileView[]; more: TileView[]; packetLoss: TileView } {
  const shown = run.status !== 'idle'
  const result = shown ? run.result : null
  // Live numbers only while the run is going: a run that ended without a result has none to show.
  const running = run.status === 'running'
  const units = settings.units
  const overheadPercent = settings.overheadCompensationPercent
  const direction = (name: Direction) => {
    const live = running && run.live[name] !== null ? { steady: run.live[name]?.steady ?? null } : null
    return directionTile({ direction: name, units, live, result: result?.[name] ?? null, overheadPercent }, context)
  }
  const resolution = result?.client.timerResolutionMs ?? 0
  const idleLive = running ? run.idle : null
  return {
    main: [
      direction('download'),
      direction('upload'),
      idleLive === null ? idleTile(result?.idle, resolution, context) : idleLiveTile(idleLive, context),
      jitterTile(result?.idle, resolution, context),
    ],
    more: [dataTile(shown ? run.dataUsedBytes : null, context), durationTile(result?.durationMs ?? null, context)],
    packetLoss: packetLossTile(context),
  }
}
