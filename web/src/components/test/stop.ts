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

import type { Direction, DirectionEvent, DirectionResult, IdleResult, MeasuringPhase, Notice, Result, TestSettings } from '@/engine/messages'
import { runPhases } from '@/lib/continuous'
import { formatDuration } from '@/lib/format'

import type { Wording } from '@/components/test/wording'

// The stop notice (ui/flows.md section 4): what a stop left, worded from the stopped-early notice and
// the result it belongs to: the phases that completed, where the stopped direction stopped and why
// it has or has no value (and, without a probe path, why it has no loaded latency), and the phases
// that did not run. The upload's times are on its phase timeline from P_start, as its chart and
// events are. A Continuous run runs one direction, so the other is never among the phases that did
// not run.

type StoppedEarly = Extract<Notice, { code: 'stopped-early' }>

const isStop = (event: DirectionEvent): event is DirectionEvent & { code: 'cancelled'; atMs: number } => event.code === 'cancelled'

/** A phase as the stop notice names it, lower case within a sentence. */
function phaseName(phase: MeasuringPhase, { t }: Wording): string {
  return phase === 'idle' ? t('notices.stoppedEarly.phases.idle') : phase === 'download' ? t('notices.stoppedEarly.phases.download') : t('notices.stoppedEarly.phases.upload')
}

/** The phases as a sentence's subject: "Latency and download", in the locale's list style. */
function phaseList(phases: readonly MeasuringPhase[], wording: Wording): string {
  const { locale } = wording
  const list = new Intl.ListFormat(locale, { type: 'conjunction' }).format(phases.map((phase) => phaseName(phase, wording)))
  return list.charAt(0).toLocaleUpperCase(locale) + list.slice(1)
}

/**
 * What the notice reads besides the result: before a Continuous run's result arrives, the stop
 * notice is worded from the directions that ended and the finished idle latency, as their phase
 * events carried them, and the run's settings.
 */
export interface StopContext {
  result?: Result | null
  /** The run's settings, for the order of its phases. */
  settings?: Pick<TestSettings, 'preset' | 'phases' | 'continuousDirection'> | null
  /** Each direction that has ended, as its phase event carried it. */
  directions?: Partial<Record<Direction, DirectionResult | undefined>>
  /** The idle latency, once it finished. */
  finishedIdle?: IdleResult | null
}

/** Where the upload stopped, with the stop instant only when its cancelled event gives one. */
function uploadStop(part: DirectionResult | undefined, measured: boolean, { t, locale }: Wording): string {
  const atMs = part?.events.find(isStop)?.atMs
  const at = atMs === undefined ? undefined : formatDuration(atMs, locale)
  const endMs = part?.series?.endMs
  // The live direction is typed as any direction's; an upload's carries its confirmed requests.
  const n = part !== undefined && 'confirmedRequests' in part && typeof part.confirmedRequests === 'number' ? part.confirmedRequests : undefined
  if (measured && n !== undefined) {
    return at === undefined || endMs === undefined ? t('notices.stoppedEarly.uploadPartialUntimed', { n }) : t('notices.stoppedEarly.uploadPartial', { at, n, end: formatDuration(endMs, locale) })
  }
  const warmup = part?.windowMs === undefined
  if (at === undefined) {
    return warmup ? t('notices.stoppedEarly.uploadNoneWarmupUntimed') : t('notices.stoppedEarly.uploadNoneUntimed')
  }
  return warmup ? t('notices.stoppedEarly.uploadNoneWarmup', { at }) : t('notices.stoppedEarly.uploadNone', { at })
}

export function stopWording(notice: StoppedEarly, context: Wording & StopContext): { title: string; body: string } {
  const { t, locale } = context
  const { direction } = notice
  const result = context.result ?? null
  // The result's direction once it exists; before it, the direction its phase event ended.
  const part = result?.[direction] ?? context.directions?.[direction]
  const covered = formatDuration(notice.coveredMs, locale)
  const measured = part?.bitsPerSecond !== undefined
  const title = direction === 'upload' && measured ? t('notices.stoppedEarly.partialUpload', { covered }) : t('notices.stoppedEarly.title', { phase: phaseName(direction, context) })

  const settings = result?.settings ?? context.settings ?? null
  const order = settings === null ? [direction] : runPhases(settings)
  const index = order.indexOf(direction)
  const ended = (phase: MeasuringPhase): boolean => {
    if (phase === 'idle') {
      return (result?.idle ?? context.finishedIdle ?? undefined) !== undefined
    }
    const block = result?.[phase] ?? context.directions?.[phase]
    return block !== undefined && block.status !== 'skipped'
  }
  const completed = order.slice(0, index).filter(ended)
  const notRun = order.slice(index + 1)
  let stop: string
  if (direction === 'download') {
    stop = measured ? t('notices.stoppedEarly.downloadPartial', { covered }) : t('notices.stoppedEarly.downloadNone')
  } else {
    stop = uploadStop(part, measured, context)
  }
  // Without a probe path the stopped direction has no loaded latency, and the notice says why.
  const loaded = part?.loadedLatency
  const noProbe = loaded !== undefined && 'reason' in loaded && loaded.reason === 'no-probe-path'
  const sentences = [
    ...(completed.length === 0 ? [] : [t('notices.stoppedEarly.completed', { phases: phaseList(completed, context) })]),
    ...(noProbe ? [t('notices.stoppedEarly.noProbe', { phase: phaseName(direction, context) })] : []),
    stop,
    ...(notRun.length === 0 ? [] : [t('notices.stoppedEarly.notRun', { phases: phaseList(notRun, context) })]),
  ]
  return { title, body: sentences.join(' ') }
}

/**
 * The stop notice after a stop during idle latency that kept its samples (ui/flows.md section 4):
 * no direction stopped, so the result has no stopped-early notice, and the notice is worded from
 * the pings the run sent, the warm-up one included, and the phases that did not run.
 */
export function latencyStopWording(pings: number, count: number, notRun: readonly MeasuringPhase[], wording: Wording): { title: string; body: string } {
  const { t, locale } = wording
  const title = t('notices.stoppedEarly.title', { phase: phaseName('idle', wording) })
  const values = { pings, count, other: pings - 1 }
  if (notRun.length === 0) {
    return { title, body: t('notices.stoppedEarly.latency', values) }
  }
  const phases = new Intl.ListFormat(locale, { type: 'conjunction' }).format(notRun.map((phase) => phaseName(phase, wording)))
  return { title, body: t('notices.stoppedEarly.latencyNotRun', { ...values, phases }) }
}
