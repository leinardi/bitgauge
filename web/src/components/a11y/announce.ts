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

import { noticeView } from '@/components/test/notices'
import type { RunView } from '@/components/test/screen'
import { confidenceReasons } from '@/components/test/tiles'
import type { Wording } from '@/components/test/wording'
import type { PhaseView } from '@/composables/useRunState'
import type { Direction, DirectionResult, PhaseName, Result } from '@/engine/messages'
import { spokenBytes, spokenLatency, spokenRate } from '@/lib/format'

// What the screen reader hears (ui/i18n-a11y.md sections 2.1 and 2.7): the phase as it starts, a
// direction's headline once as it finishes, the rate the gauge shows, and the result summary. Each
// is a full sentence from the catalog, with spoken numbers and units.

type Units = 'bits' | 'bytes'

const ORDER: readonly PhaseName[] = ['info', 'idle', 'download', 'upload']

function phaseStarted(phase: PhaseName, { t }: Wording): string {
  switch (phase) {
    case 'info':
      return t('a11y.live.phase.info')
    case 'idle':
      return t('a11y.live.phase.idle')
    case 'download':
      return t('a11y.live.phase.download')
    case 'upload':
      return t('a11y.live.phase.upload')
  }
}

function directionFinished(direction: Direction, view: PhaseView, units: Units, { t, locale }: Wording): string {
  const headline = view.result?.bitsPerSecond
  if (headline === undefined) {
    return direction === 'download' ? t('a11y.live.noHeadline.download') : t('a11y.live.noHeadline.upload')
  }
  const rate = spokenRate(headline, units, locale)
  return direction === 'download' ? t('a11y.live.headline.download', { rate }) : t('a11y.live.headline.upload', { rate })
}

/**
 * The announcements of a change in the phases: each finished direction's headline, then the phase
 * that started, so a headline is never cut off by the next phase.
 */
export function phaseAnnouncements(before: Record<PhaseName, PhaseView>, after: Record<PhaseName, PhaseView>, units: Units, wording: Wording): string[] {
  const changed = ORDER.filter((phase) => before[phase].state !== after[phase].state)
  const finished = changed.flatMap((phase) => (after[phase].state === 'finished' && (phase === 'download' || phase === 'upload') ? [directionFinished(phase, after[phase], units, wording)] : []))
  const started = changed.flatMap((phase) => (after[phase].state === 'started' ? [phaseStarted(phase, wording)] : []))
  return [...finished, ...started]
}

/** The rate the gauge shows while a direction runs: the download rate, the upload's sending progress. */
export function rateAnnouncement(run: Pick<RunView, 'phase' | 'live'>, units: Units, { t, locale }: Wording): string | null {
  if (run.phase === 'download') {
    const value = run.live.download?.gauge
    return value === undefined ? null : t('a11y.live.rate.download', { rate: spokenRate(value, units, locale) })
  }
  if (run.phase === 'upload') {
    const value = run.live.upload?.sending
    return value === undefined || value === null ? null : t('a11y.live.rate.upload', { rate: spokenRate(value, units, locale) })
  }
  return null
}

function statusSentence(result: Result, { t }: Wording): string {
  switch (result.status) {
    case 'complete':
      return t('a11y.summary.status.complete')
    case 'partial':
      return t('a11y.summary.status.partial')
    case 'error':
      return t('a11y.summary.status.error')
  }
}

/** A measured direction's qualifiers: partial, low confidence with its reasons, or CPU-bound. */
function qualifiers(block: DirectionResult, context: Wording): string[] {
  const { t } = context
  const list: string[] = block.status === 'partial' ? [t('a11y.summary.partial')] : []
  if (block.confidence?.level === 'low') {
    list.push(t('a11y.summary.lowConfidence', { reasons: confidenceReasons(block.confidence.reasons, context) }))
  } else if (block.confidence?.level === 'cpu-bound') {
    list.push(t('test.tiles.cpuBound'))
  }
  return list
}

function downloadSentence(block: DirectionResult, units: Units, context: Wording): string {
  const { t, locale } = context
  if (block.status === 'skipped') {
    return t('a11y.summary.download.skipped')
  }
  if (block.status === 'error') {
    return t('a11y.summary.download.error')
  }
  if (block.bitsPerSecond === undefined) {
    return t('a11y.summary.download.insufficient')
  }
  const rate = spokenRate(block.bitsPerSecond, units, locale)
  const list = qualifiers(block, context)
  return list.length === 0 ? t('a11y.summary.download.measured', { rate }) : t('a11y.summary.download.qualified', { rate, qualifiers: new Intl.ListFormat(locale, { type: 'unit' }).format(list) })
}

function uploadSentence(block: DirectionResult, units: Units, context: Wording): string {
  const { t, locale } = context
  if (block.status === 'skipped') {
    return t('a11y.summary.upload.skipped')
  }
  if (block.status === 'error') {
    return t('a11y.summary.upload.error')
  }
  if (block.bitsPerSecond === undefined) {
    return t('a11y.summary.upload.insufficient')
  }
  const rate = spokenRate(block.bitsPerSecond, units, locale)
  const list = qualifiers(block, context)
  return list.length === 0 ? t('a11y.summary.upload.measured', { rate }) : t('a11y.summary.upload.qualified', { rate, qualifiers: new Intl.ListFormat(locale, { type: 'unit' }).format(list) })
}

function latency(ms: number, resolutionMs: number, { t, locale }: Wording): string {
  const { text, below } = spokenLatency(ms, locale, resolutionMs)
  return below ? t('a11y.lessThan', { value: text }) : text
}

function idleSentence(result: Result, context: Wording): string | null {
  const idle = result.idle
  if (idle === undefined) {
    return null
  }
  const { t } = context
  const resolution = result.client.timerResolutionMs
  if (idle.medianMs === undefined) {
    return t('a11y.summary.idleUnavailable')
  }
  const median = latency(idle.medianMs, resolution, context)
  return idle.jitterMs === undefined ? t('a11y.summary.idle', { median }) : t('a11y.summary.idleJitter', { median, jitter: latency(idle.jitterMs, resolution, context) })
}

/**
 * The result summary of section 2.7, reduced to the v0.1 metrics: the status, download and upload
 * with their qualifiers, idle latency and jitter, data used, and the notices by title. A direction
 * the settings left out is not mentioned.
 */
export function resultSummary(result: Result, units: Units, context: Wording): string {
  const { t, locale } = context
  const phases = result.settings.phases
  const titles = result.notices.map((notice) => noticeView(notice, context).title)
  const sentences = [
    statusSentence(result, context),
    phases.includes('download') && result.download !== undefined ? downloadSentence(result.download, units, context) : null,
    phases.includes('upload') && result.upload !== undefined ? uploadSentence(result.upload, units, context) : null,
    idleSentence(result, context),
    t('a11y.summary.data', { data: spokenBytes(result.dataUsedBytes, locale) }),
    titles.length === 0 ? null : t('a11y.summary.notices', { titles: new Intl.ListFormat(locale, { type: 'conjunction' }).format(titles) }, titles.length),
  ]
  return sentences.filter((sentence) => sentence !== null).join(' ')
}
