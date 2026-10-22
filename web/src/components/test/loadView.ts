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

import type { Direction, LoadedLatency, MeasuringPhase, PhaseState, Responsiveness, Result } from '@/engine/messages'
import { type GradeView, loadRow, type LoadRow, gradeView, plannedResponsivenessView, responsivenessView, type ResponsivenessView } from '@/components/result/load'
import type { Wording } from '@/components/test/wording'
import type { AnsweredPings } from '@/composables/useLoadedSeries'
import type { RunStatus } from '@/composables/useRunState'
import { percentile } from '@/lib/percentile'
import { latencyNumber } from '@/lib/format'

// The Test screen's load card (ui/screens.md sections 1 and 6): the grade and a loaded-latency row
// per direction, live from the pings so far, then the result's with its qualifiers, and the HTTP
// loaded responsiveness: on every state of a standard run, each direction's from its end, as the
// kit's Test screen shows it, and only in a Continuous run's finished result (ui/screens.md
// section 1).

/** What the Test screen's load card needs of the run (ui/screens.md sections 1 and 6). */
export interface LoadInput {
  status: RunStatus
  /** The run's phases in order: the settings it runs with, or the next run's. */
  phases: readonly MeasuringPhase[]
  /** Each direction's phase state in the run shown. */
  states: Record<Direction, PhaseState | 'pending'>
  /** Each ended direction's HTTP loaded responsiveness, as its finished or failed phase carried it. */
  responsiveness?: Partial<Record<Direction, Responsiveness>>
  /** A run stopped during idle latency that returned to idle: its directions never ran. */
  stoppedEarly?: boolean
  /** Each direction's answered loaded-latency pings, whether or not the chart has placed them. */
  pings: AnsweredPings | undefined
  /**
   * Idle latency's median as its finished phase reports it, the baseline of the live increase;
   * null while there is none, or when idle latency ended without one (fewer than 5 samples), as
   * the result will have no increase either.
   */
  idleMedianMs: number | null
  result: Result | null
  /** The protocol the info phase recorded, path B's capability check; null before it. */
  protocol?: string | null
  /** A Continuous run, whose HTTP loaded responsiveness waits for its finished result. */
  continuous?: boolean
}

export interface LoadView {
  /** Null when the run has no idle latency, so no grade (measurement.md section 11.3). */
  grade: GradeView | null
  rows: LoadRow[]
  /** The HTTP loaded responsiveness; a Continuous run's only once complete, null before. */
  responsiveness: ResponsivenessView | null
}

/**
 * A direction's loaded latency before the result: the median and p90 of its pings so far and the
 * increase over the idle median; live while the direction runs, settled once it has finished.
 * Formatted without the timer resolution, as the live idle tile is: the clock's resolution comes
 * with the result, whose rows then replace these.
 */
function pingsRow(direction: Direction, pings: readonly { ms: number }[], idleMedianMs: number | null, live: boolean, { t, locale }: Wording): LoadRow {
  const values = pings.map((ping) => ping.ms)
  const medianMs = percentile(values, 50) ?? 0
  const p90 = latencyNumber(percentile(values, 90) ?? 0, locale)
  const label = direction === 'download' ? t('result.load.during.download') : t('result.load.during.upload')
  const sub = idleMedianMs === null ? t('result.load.noIdle', { p90 }) : t('result.load.increase', { p90, increase: latencyNumber(Math.max(0, medianMs - idleMedianMs), locale) })
  return { direction, label, sub, value: latencyNumber(medianMs, locale), live }
}

/**
 * A result's row with what the kit's Test screen adds to it: "partial" on a direction stopped early,
 * "last hour" on a Continuous one, and why a direction has no number when it failed, or when the
 * upload stopped in its warm-up.
 */
function qualified(row: LoadRow, loaded: LoadedLatency, result: Result, { t }: Wording): LoadRow {
  const outcome = result[row.direction]
  if (!('status' in loaded)) {
    // A Continuous direction's loaded latency is the last hour's (measurement.md section 15).
    if (result.settings.preset === 'continuous') {
      return { ...row, sub: t('test.load.lastHour', { sub: row.sub }) }
    }
    return outcome?.status === 'partial' ? { ...row, sub: t('test.load.partial', { sub: row.sub }) } : row
  }
  if (outcome?.status === 'error') {
    return { ...row, sub: t('test.load.failed', { sub: row.sub, direction: row.direction === 'download' ? t('result.load.download') : t('result.load.upload') }) }
  }
  if (row.direction === 'upload' && outcome?.status === 'partial' && outcome.windowMs === undefined) {
    return { ...row, sub: t('test.load.stoppedWarmup', { sub: row.sub }) }
  }
  return row
}

/**
 * A result without a grade, in the kit's Test screen words: an error ended the test, no direction
 * ran, or none that ran is gradable; a direction measured without a grade lacks idle latency.
 */
function ungraded(result: Result, context: Wording): GradeView {
  const { t } = context
  const loaded = (['download', 'upload'] as const).map((direction) => result[direction]?.loadedLatency).filter((value) => value !== undefined)
  if (loaded.some((value) => !('status' in value))) {
    return gradeView(result, context, true)
  }
  const words = result.status === 'error' ? t('test.load.incomplete') : loaded.length === 0 ? t('test.load.noLoaded') : t('test.load.noGradable')
  return { grade: null, words, basis: '' }
}

/**
 * The load card of the Test screen: the grade once the result has it, "graded after" the last
 * direction while there is none yet, and absent without idle latency; a row per direction of the
 * run, pending until it runs, live as its pings come, then the result's, with its source and
 * qualifiers. Null for a run with neither direction.
 */
export function loadView(input: LoadInput, context: Wording): LoadView | null {
  const { t } = context
  const order = input.phases.filter((phase): phase is Direction => phase !== 'idle')
  const last = order.at(-1)
  if (last === undefined) {
    return null
  }
  const { result, status } = input
  // A run that ended without a result: an error before it, or a stop during idle latency.
  const ended = (status === 'ended' && result === null) || input.stoppedEarly === true
  const rows = order.map((direction): LoadRow => {
    const label = direction === 'download' ? t('result.load.during.download') : t('result.load.during.upload')
    const loaded = result?.[direction]?.loadedLatency
    if (loaded !== undefined && result !== null) {
      return qualified(loadRow(direction, loaded, result.client.timerResolutionMs, context), loaded, result, context)
    }
    const state = input.states[direction]
    const pings = status === 'idle' ? [] : (input.pings?.[direction] ?? [])
    if (pings.length > 0 && result === null && !ended) {
      return pingsRow(direction, pings, input.idleMedianMs, state === 'started', context)
    }
    if (!ended && (status === 'idle' || (status === 'running' && (state === 'pending' || state === 'started')))) {
      return { direction, label, sub: t('test.load.pending'), value: null }
    }
    if (state === 'pending' || state === 'skipped') {
      return { direction, label, sub: t('test.load.notRun'), value: null }
    }
    return { direction, label, sub: ended ? t('test.load.noResult') : t('test.load.none'), value: null }
  })
  const responsiveness =
    input.continuous === true
      ? result?.status === 'complete'
        ? responsivenessView(result, context)
        : null
      : plannedResponsivenessView(result, order, input.protocol ?? null, context, status === 'idle' ? {} : input.responsiveness)
  if (!input.phases.includes('idle')) {
    return { grade: null, rows, responsiveness }
  }
  if (result !== null) {
    return { grade: result.bufferbloat === undefined ? ungraded(result, context) : gradeView(result, context, true), rows, responsiveness }
  }
  if (input.stoppedEarly === true) {
    return { grade: { grade: null, words: t('test.load.noLoaded'), basis: '' }, rows, responsiveness }
  }
  if (ended) {
    return { grade: { grade: null, words: t('test.load.incomplete'), basis: '' }, rows, responsiveness }
  }
  const words = last === 'upload' ? t('test.load.afterUpload') : t('test.load.afterDownload')
  return { grade: { grade: null, words, basis: '', pending: true }, rows, responsiveness }
}
