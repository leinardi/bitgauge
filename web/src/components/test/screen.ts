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
import type { Direction, DirectionResult, MeasuringPhase, PhaseName, Result, TestSettings } from '@/engine/messages'
import { formatBytes, formatLatency, formatRate, latencyNumber, rateParts } from '@/lib/format'

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
/** Idle latency sends a ping no sooner than this after the previous one (measurement.md section 10). */
const PING_SPACING_MS = 100

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
function idleStopped(result: Result | null): boolean {
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
    const headline = run.phases[phase].headlineBitsPerSecond
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

/** The text a gauge shows in place of a reading: between runs, while connecting, after a stop or an error. */
export interface GaugeText {
  title: string
  message: string | null
  /** The message on a touch layout, where there is no Enter key. */
  touchMessage: string | null
  detail: string | null
  icon: 'cancelled' | 'error' | 'offline' | null
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
  /** The line under the reading: the ping counter and median, or the steady average and peak so far. */
  note: string | null
  /** The inner arc's value in words, so it is not told by colour alone. */
  innerLabel: string | null
  /** A textual state in place of the reading; the dial then shows no needle. */
  text: GaugeText | null
}

/** What the gauge words its readings with besides the run: the display units and the server's name. */
export interface GaugeContext extends Wording {
  units: 'bits' | 'bytes'
  server: string
}

const PHASE_WORDS: Record<MeasuringPhase, (t: Wording['t']) => string> = {
  idle: (t) => t('test.gauge.phase.idle'),
  download: (t) => t('test.gauge.phase.download'),
  upload: (t) => t('test.gauge.phase.upload'),
}

function isMeasuring(phase: PhaseName | null): phase is MeasuringPhase {
  return phase === 'idle' || phase === 'download' || phase === 'upload'
}

/** "avg so far 597 · peak 610" once warm-up has ended, "warming up" before. */
function steadyNote(live: DirectionLive | null, { t, locale, units }: GaugeContext): string {
  const steady = live?.steady
  if (steady === null || steady === undefined) {
    return t('test.tiles.warmingUp')
  }
  const number = (value: number) => rateParts(value, units, locale).number
  return t('test.tiles.soFar', { avg: number(steady.avgBitsPerSecond), peak: number(steady.peakBitsPerSecond) })
}

/** The ping counter, with the running median once there is one. */
function idleNote(idle: IdleLive | null, { t, locale }: GaugeContext): string | null {
  if (idle === null) {
    return null
  }
  const ping = t('test.tiles.pings', { n: idle.pings, count: idle.count })
  return idle.medianMs === undefined ? ping : t('test.gauge.median', { median: latencyNumber(idle.medianMs, locale), ping })
}

/** The error state: what was lost, in which phase, and the last thing measured before it. */
function errorText(run: RunView, context: GaugeContext): GaugeText {
  const { t, locale, units } = context
  const phase = run.error?.phase ?? null
  let detail: string | null = null
  if (phase === 'idle' && run.idle !== null) {
    detail = t('test.gauge.pingsBefore', { n: run.idle.pings, count: run.idle.count })
  } else if (phase === 'download' || phase === 'upload') {
    const live = run.live[phase]
    const last = phase === 'upload' ? live?.sending : live?.gauge
    detail = last === null || last === undefined ? null : t('test.gauge.lastSample', { rate: formatRate(last, units, locale) })
  }
  const message = isMeasuring(phase) ? t('test.gauge.errorDuring', { phase: PHASE_WORDS[phase](t) }) : null
  return { title: t('test.gauge.lost'), message, touchMessage: null, detail, icon: 'error' }
}

const NO_READING = { mode: 'rate', direction: null, value: null, peak: null, inner: null, label: '', at: null, note: null, innerLabel: null, text: null } as const

/** The offline state between runs: the server did not answer, and when it is checked again. */
export function offlineGauge({ t, server }: GaugeContext, nextCheckS: number | null): GaugeInput {
  const message = nextCheckS === null ? t('test.gauge.offlineMessage', { server }) : t('test.gauge.offlineNext', { server, seconds: nextCheckS })
  return { ...NO_READING, text: { title: t('test.gauge.offline'), message, touchMessage: null, detail: null, icon: 'offline' } }
}

/**
 * The gauge (design_system/components/gauge.md, Modes and states): Ready between runs, Connecting…
 * during the info phase, idle latency in milliseconds with the ping counter, the download rate
 * with its steady peak, the upload's sending progress; once a result is in, the download headline
 * with the upload headline inside; after a stop Cancelled over the final arc, and after an error
 * what was lost and where.
 */
export function gaugeInput(run: RunView, context: GaugeContext): GaugeInput {
  const { t, locale, units } = context
  const reading = NO_READING
  const textual = (text: Omit<GaugeText, 'touchMessage' | 'detail' | 'icon'> & Partial<GaugeText>): GaugeInput => ({
    ...reading,
    text: { touchMessage: null, detail: null, icon: null, ...text },
  })
  const ready = textual({ title: t('test.gauge.ready'), message: t('test.gauge.pressEnter'), touchMessage: t('test.gauge.tapStart') })
  if (run.status === 'running') {
    switch (run.phase) {
      case 'idle':
        return { ...reading, mode: 'ms', value: run.idle?.rttMs ?? null, label: t('test.gauge.idle'), note: idleNote(run.idle, context) }
      case 'download': {
        const live = run.live.download
        return { ...reading, direction: 'download', value: live?.gauge ?? null, peak: live?.steady?.peakBitsPerSecond ?? null, label: t('test.gauge.download'), at: elapsedMs('download', live), note: steadyNote(live, context) }
      }
      case 'upload': {
        const live = run.live.upload
        const sent = live?.sendingTrace.at(-1)
        return { ...reading, direction: 'upload', value: live?.sending ?? null, label: t('test.gauge.sending'), at: sent === undefined ? null : sent.cell * BUCKET_MS, note: steadyNote(live, context) }
      }
      default:
        return textual({ title: t('test.gauge.connecting'), message: t('test.gauge.reading', { server: context.server }) })
    }
  }
  if (run.status === 'idle') {
    return ready
  }
  if (screenState(run) === 'error') {
    return { ...reading, text: errorText(run, context) }
  }
  const result = run.result
  if (result === null) {
    return ready
  }
  const upload = result.upload?.bitsPerSecond ?? null
  if (screenState(run) === 'cancelled') {
    // The final arc stays, without a needle: the download's value, or its last sample when it has
    // none, with the upload's partial value inside.
    const download = result.download?.bitsPerSecond ?? run.live.download?.gauge ?? null
    const text: GaugeText = { title: t('test.gauge.cancelled'), message: t('test.gauge.notSaved'), touchMessage: null, detail: null, icon: 'cancelled' }
    if (idleStopped(result)) {
      return { ...reading, mode: 'ms', value: result.idle?.medianMs ?? null, text }
    }
    return { ...reading, direction: 'download', value: download, inner: upload, text }
  }
  const download = result.download?.bitsPerSecond ?? null
  if (download === null && upload !== null) {
    return { ...reading, direction: 'upload', value: upload, label: t('test.gauge.upload') }
  }
  const innerLabel = upload === null ? null : t('test.gauge.inner', { rate: formatRate(upload, units, locale) })
  return { ...reading, direction: 'download', value: download, peak: result.download?.peakBitsPerSecond ?? null, inner: upload, label: t('test.gauge.download'), innerLabel }
}

/** What the gauge reads, in one line: its state's title, or its label, number and unit. */
export function gaugeReadout(gauge: GaugeInput, { t, locale, units }: GaugeContext): string | null {
  if (gauge.text !== null) {
    return gauge.text.title
  }
  if (gauge.value === null) {
    return null
  }
  const { number, unit } = gauge.mode === 'ms' ? { number: latencyNumber(gauge.value, locale), unit: t('test.gauge.ms') } : rateParts(gauge.value, units, locale)
  return `${gauge.label} ${number} ${unit}`
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
    const share = run.phase === 'upload' && download.headlineBitsPerSecond === undefined ? download.bytes : undefined
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

/** The metric tiles: the four main ones, then data used and duration, and the packet-loss slot. */
export function screenTiles(run: RunView, settings: Pick<TestSettings, 'units' | 'overheadCompensationPercent'>, context: Wording, elapsedMs: number | null = null): { main: TileView[]; more: TileView[]; packetLoss: TileView } {
  const shown = run.status !== 'idle'
  const result = shown ? run.result : null
  // Live numbers only while the run is going: a run that ended without a result has none to show.
  const running = run.status === 'running'
  const units = settings.units
  const overheadPercent = settings.overheadCompensationPercent
  const direction = (name: Direction) => {
    const live = running && run.live[name] !== null ? { steady: run.live[name]?.steady ?? null } : null
    const tile = directionTile({ direction: name, units, live, result: result?.[name] ?? null, overheadPercent }, context)
    return shown && run.phases[name].state === 'skipped' ? { ...tile, lines: [{ text: context.t('test.tiles.skipped') }] } : tile
  }
  const resolution = result?.client.timerResolutionMs ?? 0
  const idleLive = running ? run.idle : null
  // A stop during idle latency keeps it, and its jitter, as partial.
  const stopped = (tile: TileView): TileView => (idleStopped(result) ? { ...tile, lines: [{ text: context.t('test.tiles.partial') }, ...tile.lines] } : tile)
  return {
    main: [
      direction('download'),
      direction('upload'),
      idleLive === null ? stopped(idleTile(result?.idle, resolution, context)) : idleLiveTile(idleLive, context),
      stopped(jitterTile(result?.idle, resolution, context)),
    ],
    more: [dataUsed(run, context), duration(run, elapsedMs, context)],
    packetLoss: packetLossTile(context),
  }
}
