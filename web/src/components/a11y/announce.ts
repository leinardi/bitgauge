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

import { EXPERIENCES, type ExperienceName, experienceText, scoreBasis } from '@/components/result/qualityList'
import { noticeView } from '@/components/test/notices'
import type { RunView } from '@/components/test/screen/states'
import { confidenceReasons } from '@/components/test/tiles'
import type { Wording } from '@/components/test/wording'
import type { PhaseView } from '@/composables/useRunState'
import type { Bufferbloat, Direction, DirectionResult, Experience, PhaseName, Responsiveness, Result, ScoreBand } from '@/engine/messages'
import { continuousDirection } from '@/lib/continuous'
import { rpmNumber, spokenBytes, spokenLatency, spokenRate } from '@/lib/format'
import { protocolLabel } from '@/lib/protocol'

// What the screen reader hears (ui/i18n-a11y.md sections 2.1 and 2.7): the phase as it starts, a
// direction's headline once as it finishes, the rate the gauge shows, and the result summary. Each
// is a full sentence from the catalog, with spoken numbers and units.

type Units = 'bits' | 'bytes'

const ORDER: readonly PhaseName[] = ['info', 'idle', 'download', 'upload']

function phaseStarted(phase: PhaseName, { t }: Wording, continuous: boolean): string {
  switch (phase) {
    case 'info':
      return t('a11y.live.phase.info')
    case 'idle':
      return t('a11y.live.phase.idle')
    case 'download':
      return continuous ? t('a11y.live.phase.continuousDownload') : t('a11y.live.phase.download')
    case 'upload':
      return continuous ? t('a11y.live.phase.continuousUpload') : t('a11y.live.phase.upload')
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
 * that started, so a headline is never cut off by the next phase; a Continuous run's direction is
 * announced as running.
 */
export function phaseAnnouncements(before: Record<PhaseName, PhaseView>, after: Record<PhaseName, PhaseView>, units: Units, wording: Wording, continuous = false): string[] {
  const changed = ORDER.filter((phase) => before[phase].state !== after[phase].state)
  const finished = changed.flatMap((phase) => (after[phase].state === 'finished' && (phase === 'download' || phase === 'upload') ? [directionFinished(phase, after[phase], units, wording)] : []))
  const started = changed.flatMap((phase) => (after[phase].state === 'started' ? [phaseStarted(phase, wording, continuous)] : []))
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

/**
 * A Continuous direction measured: its run-wide average, minimum and maximum, and its "p90, last
 * hour" when it has one, with the qualifiers; otherwise as a bounded direction is said.
 */
function continuousSentence(direction: Direction, block: DirectionResult, units: Units, context: Wording): string {
  const { t, locale } = context
  const { bitsPerSecond, minBitsPerSecond, maxBitsPerSecond, peakBitsPerSecond } = block
  if (bitsPerSecond === undefined || minBitsPerSecond === undefined || maxBitsPerSecond === undefined) {
    return direction === 'download' ? downloadSentence(block, units, context) : uploadSentence(block, units, context)
  }
  const values = { rate: spokenRate(bitsPerSecond, units, locale), min: spokenRate(minBitsPerSecond, units, locale), max: spokenRate(maxBitsPerSecond, units, locale) }
  let figures: string
  if (peakBitsPerSecond === undefined) {
    figures = direction === 'download' ? t('a11y.summary.continuous.download', values) : t('a11y.summary.continuous.upload', values)
  } else {
    const peaked = { ...values, peak: spokenRate(peakBitsPerSecond, units, locale) }
    figures = direction === 'download' ? t('a11y.summary.continuous.downloadPeak', peaked) : t('a11y.summary.continuous.uploadPeak', peaked)
  }
  const list = qualifiers(block, context)
  return list.length === 0 ? t('a11y.summary.continuous.sentence', { figures }) : t('a11y.summary.continuous.qualified', { figures, qualifiers: new Intl.ListFormat(locale, { type: 'unit' }).format(list) })
}

/** The directions a result says: a Continuous one's own direction, then the other as not run. */
function directionSentences(result: Result, units: Units, context: Wording): (string | null)[] {
  const { t } = context
  const continuous = continuousDirection(result.settings)
  const phases = result.settings.phases
  if (continuous === null) {
    return [
      phases.includes('download') && result.download !== undefined ? downloadSentence(result.download, units, context) : null,
      phases.includes('upload') && result.upload !== undefined ? uploadSentence(result.upload, units, context) : null,
    ]
  }
  const block = result[continuous]
  const ran = block === undefined ? null : continuousSentence(continuous, block, units, context)
  const other = continuous === 'download' ? t('a11y.summary.continuous.uploadNotRun') : t('a11y.summary.continuous.downloadNotRun')
  return continuous === 'download' ? [ran, other] : [other, ran]
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

/** The grade's words as the summary says them, mid-sentence (ui/i18n-a11y.md section 2.5). */
function spokenGradeWords(grade: Bufferbloat['grade'], { t }: Wording): string {
  switch (grade) {
    case 'A+':
      return t('a11y.summary.grades.aPlus')
    case 'A':
      return t('a11y.summary.grades.a')
    case 'B':
      return t('a11y.summary.grades.b')
    case 'C':
      return t('a11y.summary.grades.c')
    case 'D':
      return t('a11y.summary.grades.d')
    case 'F':
      return t('a11y.summary.grades.f')
  }
}

/** The grade in letter and words with the increase it rests on; null without a grade. */
function gradeSentence(result: Result, context: Wording): string | null {
  const bufferbloat = result.bufferbloat
  if (bufferbloat === undefined) {
    return null
  }
  const increase = latency(bufferbloat.increaseMs, result.client.timerResolutionMs, context)
  return context.t('a11y.summary.grade', { grade: bufferbloat.grade, words: spokenGradeWords(bufferbloat.grade, context), increase })
}

/** A direction's responsiveness state in words, with its RPM when it has one. */
function rpmState(block: Responsiveness, { t, locale }: Wording): string {
  switch (block.state) {
    case 'measured':
      return t('a11y.summary.rpm.measured', { rpm: rpmNumber(block.rpm, locale) })
    case 'uncertain':
      return t('a11y.summary.rpm.uncertain', { rpm: rpmNumber(block.rpm, locale) })
    case 'unavailable_h1':
      return protocolLabel(block.protocol) === null ? t('a11y.summary.rpm.treatedH1') : t('a11y.summary.rpm.needsH2')
    case 'unavailable_insufficient':
      return t('a11y.summary.rpm.insufficient')
  }
}

/** The HTTP loaded responsiveness under its fixed label and protocol, a state per direction; null without it. */
function responsivenessSentence(result: Result, context: Wording): string | null {
  const { t } = context
  const said = result.settings.phases.flatMap((phase) => {
    const block = phase === 'idle' ? undefined : result[phase]?.responsiveness
    if (block === undefined) {
      return []
    }
    const state = rpmState(block, context)
    return [{ protocol: block.protocol, text: phase === 'download' ? t('a11y.summary.rpm.download', { state }) : t('a11y.summary.rpm.upload', { state }) }]
  })
  const [first, second] = said
  if (first === undefined) {
    return null
  }
  const directions = second === undefined ? first.text : t('a11y.summary.rpm.pair', { first: first.text, second: second.text })
  const protocol = protocolLabel(first.protocol)
  return protocol === null ? t('a11y.summary.responsivenessNotReported', { directions }) : t('a11y.summary.responsiveness', { protocol, directions })
}

function spokenBand(band: ScoreBand, { t }: Wording): string {
  switch (band) {
    case 'great':
      return t('a11y.summary.bands.great')
    case 'good':
      return t('a11y.summary.bands.good')
    case 'average':
      return t('a11y.summary.bands.average')
    case 'poor':
      return t('a11y.summary.bands.poor')
    case 'bad':
      return t('a11y.summary.bands.bad')
  }
}

function spokenExperienceName(name: ExperienceName, { t }: Wording): string {
  switch (name) {
    case 'streaming':
      return t('a11y.summary.experiences.streaming')
    case 'gaming':
      return t('a11y.summary.experiences.gaming')
    case 'rtc':
      return t('a11y.summary.experiences.rtc')
  }
}

/** An experience mid-sentence: its band, or "needs" the inputs it misses. */
function spokenExperience(name: ExperienceName, experience: Experience, context: Wording): string {
  const value = 'band' in experience ? spokenBand(experience.band, context) : experienceText(experience, context)
  return context.t('a11y.summary.experience', { name: spokenExperienceName(name, context), value })
}

/** Each quality-score experience with its band or the inputs it misses, and their basis; null without scores. */
function qualitySentence(result: Result, context: Wording): string | null {
  const scores = result.scores
  if (scores === undefined) {
    return null
  }
  const { t, locale } = context
  const experiences = new Intl.ListFormat(locale, { type: 'unit' }).format(EXPERIENCES.map((name) => spokenExperience(name, scores[name], context)))
  const basis = scoreBasis(scores, context)
  return basis === null ? t('a11y.summary.quality', { experiences }) : t('a11y.summary.qualityBasis', { basis, experiences })
}

/**
 * The result summary of section 2.7: the status, download and upload with their qualifiers, idle
 * latency and jitter, the grade with the loaded-latency increase it rests on, from v0.3 the HTTP
 * loaded responsiveness and the quality scores of a complete result, data used, and the notices by
 * title. A direction the settings left out is not mentioned; a Continuous result says its one
 * direction with its run-wide minimum, maximum and "p90, last hour", and the other as not run.
 */
export function resultSummary(result: Result, units: Units, context: Wording): string {
  const { t, locale } = context
  const titles = result.notices.map((notice) => noticeView(notice, { ...context, result }).title)
  const sentences = [
    statusSentence(result, context),
    ...directionSentences(result, units, context),
    idleSentence(result, context),
    gradeSentence(result, context),
    // A complete result's alone, as the Test screen shows them on its Done state only.
    result.status === 'complete' ? responsivenessSentence(result, context) : null,
    result.status === 'complete' ? qualitySentence(result, context) : null,
    t('a11y.summary.data', { data: spokenBytes(result.dataUsedBytes, locale) }),
    titles.length === 0 ? null : t('a11y.summary.notices', { titles: new Intl.ListFormat(locale, { type: 'conjunction' }).format(titles) }, titles.length),
  ]
  return sentences.filter((sentence) => sentence !== null).join(' ')
}
