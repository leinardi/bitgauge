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
import { formatDuration } from '@/lib/format'

import type { Wording } from '@/components/test/wording'

// The stop notice (ui/flows.md section 4): what a stop left, worded from the stopped-early notice and
// the result it belongs to: the phases that completed, where the stopped direction stopped and why
// it has or has no value, and the phases that did not run. The upload's times are on its phase
// timeline from P_start, as its chart and events are.

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

  const order = result?.settings.phases ?? [direction]
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
  const sentences = [
    ...(completed.length === 0 ? [] : [t('notices.stoppedEarly.completed', { phases: phaseList(completed, wording) })]),
    stop,
    ...(notRun.length === 0 ? [] : [t('notices.stoppedEarly.notRun', { phases: phaseList(notRun, wording) })]),
  ]
  return { title, body: sentences.join(' ') }
}
