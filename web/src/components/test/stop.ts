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

import type { DirectionEvent, MeasuringPhase, Notice, Result } from '@/engine/messages'
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

export function stopWording(notice: StoppedEarly, result: Result | null, wording: Wording): { title: string; body: string } {
  const { t, locale } = wording
  const { direction } = notice
  const part = result?.[direction]
  const covered = formatDuration(notice.coveredMs, locale)
  const measured = part?.bitsPerSecond !== undefined
  const title = direction === 'upload' && measured ? t('notices.stoppedEarly.partialUpload', { covered }) : t('notices.stoppedEarly.title', { phase: phaseName(direction, wording) })

  const order = result === null ? [direction] : runPhases(result.settings)
  const index = order.indexOf(direction)
  const completed = order.slice(0, index).filter((phase) => (phase === 'idle' ? result?.idle !== undefined : result?.[phase] !== undefined && result[phase].status !== 'skipped'))
  const notRun = order.slice(index + 1)
  // A stopped direction always carries its cancelled event, at the stop instant.
  const at = formatDuration(part?.events.find(isStop)?.atMs ?? 0, locale)
  let stop: string
  if (direction === 'download') {
    stop = measured ? t('notices.stoppedEarly.downloadPartial', { covered }) : t('notices.stoppedEarly.downloadNone')
  } else if (measured && result?.upload !== undefined) {
    stop = t('notices.stoppedEarly.uploadPartial', { at, n: result.upload.confirmedRequests, end: formatDuration(result.upload.series?.endMs ?? 0, locale) })
  } else {
    stop = part?.windowMs === undefined ? t('notices.stoppedEarly.uploadNoneWarmup', { at }) : t('notices.stoppedEarly.uploadNone', { at })
  }
  // Without a probe path the stopped direction has no loaded latency, and the notice says why.
  const loaded = part?.loadedLatency
  const noProbe = loaded !== undefined && 'reason' in loaded && loaded.reason === 'no-probe-path'
  const sentences = [
    ...(completed.length === 0 ? [] : [t('notices.stoppedEarly.completed', { phases: phaseList(completed, wording) })]),
    ...(noProbe ? [t('notices.stoppedEarly.noProbe', { phase: phaseName(direction, wording) })] : []),
    stop,
    ...(notRun.length === 0 ? [] : [t('notices.stoppedEarly.notRun', { phases: phaseList(notRun, wording) })]),
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
