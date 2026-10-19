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

import { gradeWord } from '@/components/history/rows'
import { sourceName } from '@/components/result/load'
import type { Wording } from '@/components/test/wording'
import type { Confidence, Direction } from '@/engine/messages'
import { formatPercent, latencyNumber, rateParts } from '@/lib/format'
import type { ShareContent, ShareRate } from '@/share/content'

// The share's words (ui/flows.md section 8, share-panel.md "Share image layout"): the image's parts
// and the copied summary's lines, in the page's language, from the share's content alone. Each
// qualifier sits with the number it qualifies: a rate's status, confidence and overhead
// compensation under it, the increase's direction, source and idle path after it, the grade's
// one-direction basis after its words. The image and the text say the same things, which the share
// panel previews before anything leaves.

/** How a qualifier reads: muted, or the warning or danger tone. */
export type QualifierTone = 'muted' | 'warn' | 'danger'

export interface ShareQualifier {
  text: string
  tone: QualifierTone
}

export interface ShareBlock {
  direction: Direction
  label: string
  /** The number, or "—" without one. */
  value: string
  unit: string
  /** Status, confidence, overhead compensation, in that order. */
  qualifiers: ShareQualifier[]
}

export interface ShareView {
  /** The label, when included; empty otherwise. */
  head: string
  blocks: ShareBlock[]
  /** The grade with its word and the one direction it reads, if only one; `name` is the summary's line. */
  grade: { letter: string; word: string; basis: string | null; name: string } | null
  /** Idle latency, jitter and the loaded-latency increase with its qualifiers. */
  foot: string[]
  server: string
  date: string
  /** The copied summary, a line each. */
  lines: string[]
}

const DASH = '—'

function reasonWord(reason: Confidence['reasons'][number], { t }: Wording): string {
  switch (reason) {
    case 'ramp-unsettled':
      return t('share.qualifiers.reasons.rampUnsettled')
    case 'insufficient-samples':
      return t('share.qualifiers.reasons.insufficientSamples')
    case 'unstable':
      return t('share.qualifiers.reasons.unstable')
  }
}

function statusQualifier(rate: ShareRate, { t }: Wording): ShareQualifier | null {
  switch (rate.status) {
    case 'partial':
      return { text: t('share.qualifiers.partial'), tone: 'muted' }
    case 'insufficient-data':
      return { text: t('share.qualifiers.insufficient'), tone: 'warn' }
    case 'skipped':
      return { text: t('share.qualifiers.skipped'), tone: 'muted' }
    case 'error':
      return { text: t('share.qualifiers.error'), tone: 'danger' }
    case 'measured':
      return null
  }
}

function confidenceQualifier(confidence: NonNullable<ShareRate['confidence']>, wording: Wording): ShareQualifier {
  const { t } = wording
  if (confidence.level === 'cpu-bound') {
    return { text: t('share.qualifiers.cpuBound'), tone: 'warn' }
  }
  const reasons = confidence.reasons.map((reason) => reasonWord(reason, wording))
  return { text: reasons.length === 0 ? t('share.qualifiers.lowConfidence') : t('share.qualifiers.lowConfidenceReasons', { reasons: reasons.join(', ') }), tone: 'warn' }
}

function block(direction: Direction, rate: ShareRate, content: ShareContent, units: 'bits' | 'bytes', wording: Wording): ShareBlock {
  const { t, locale } = wording
  const label = direction === 'download' ? t('share.image.download') : t('share.image.upload')
  const status = statusQualifier(rate, wording)
  const qualifiers = status === null ? [] : [status]
  if (rate.bitsPerSecond === null) {
    return { direction, label, value: DASH, unit: '', qualifiers }
  }
  // Confidence and overhead compensation qualify a number, so only a block with one carries them.
  if (rate.confidence !== null) {
    qualifiers.push(confidenceQualifier(rate.confidence, wording))
  }
  if (content.overheadPercent > 0) {
    qualifiers.push({ text: t('share.overhead', { percent: formatPercent(content.overheadPercent, locale) }), tone: 'muted' })
  }
  const { number, unit } = rateParts(rate.bitsPerSecond, units, locale)
  return { direction, label, value: number, unit, qualifiers }
}

/** A direction's line in the summary: its name, the number and unit, then its qualifiers. */
function rateLine(item: ShareBlock, { t }: Wording): string {
  const rate = item.value === DASH ? DASH : `${item.value} ${item.unit}`
  const qualified = item.qualifiers.length === 0 ? rate : t('share.text.qualified', { value: rate, qualifier: item.qualifiers.map((q) => q.text).join('; ') })
  return item.direction === 'download' ? t('share.text.downloadRate', { rate: qualified }) : t('share.text.uploadRate', { rate: qualified })
}

/** The increase's qualifier: its direction, a source other than the WebSocket, the other idle path. */
function loadedQualifier(loaded: NonNullable<ShareContent['loaded']>, { t }: Wording): string {
  const parts = [loaded.direction === 'download' ? t('share.text.download') : t('share.text.upload')]
  if (loaded.source !== 'websocket') {
    parts.push(sourceName(loaded.source, t))
  }
  // idleSource exists only when idle latency ran on the other path (measurement.md section 11.4).
  if (loaded.idleSource !== null) {
    parts.push(t('share.text.vsIdle', { path: loaded.idleSource === 'websocket' ? t('result.load.paths.websocket') : t('result.load.paths.http') }))
  }
  return parts.join(', ')
}

export function shareView(content: ShareContent, units: 'bits' | 'bytes', wording: Wording): ShareView {
  const { t, locale } = wording
  const ms = (value: number) => latencyNumber(value, locale, content.resolutionMs)
  const started = new Date(content.startedAt)
  const date = Number.isNaN(started.getTime()) ? content.startedAt : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(started)
  const blocks = (['download', 'upload'] as const).flatMap((direction) => {
    const rate = content[direction]
    return rate === null ? [] : [block(direction, rate, content, units, wording)]
  })
  const loaded = content.loaded === null ? null : { ms: ms(content.loaded.increaseMs), qualifier: loadedQualifier(content.loaded, wording) }
  const basis = content.basis === null ? null : content.basis === 'download' ? t('share.image.basisDownload') : t('share.image.basisUpload')
  const grade =
    content.grade === null
      ? null
      : (() => {
          const word = gradeWord(content.grade, t)
          const name = t('share.grade', { grade: content.grade, word })
          return { letter: content.grade, word, basis, name: basis === null ? name : t('share.text.qualified', { value: name, qualifier: basis }) }
        })()

  const foot = [
    ...(content.idleMs === null ? [] : [t('share.image.idle', { ms: ms(content.idleMs) })]),
    ...(content.jitterMs === null ? [] : [t('share.image.jitter', { ms: ms(content.jitterMs) })]),
    ...(loaded === null ? [] : [t('share.image.loaded', loaded)]),
  ]
  const latency = [
    ...(content.idleMs === null ? [] : [t('share.text.idle', { ms: ms(content.idleMs) })]),
    ...(content.jitterMs === null ? [] : [t('share.text.jitter', { ms: ms(content.jitterMs) })]),
  ]
  const lines = [
    content.label === null ? t('share.text.title') : t('share.text.titleLabel', { label: content.label }),
    date,
    ...blocks.map((item) => rateLine(item, wording)),
    ...(latency.length === 0 ? [] : [latency.join(' · ')]),
    ...(loaded === null ? [] : [t('share.text.loaded', loaded)]),
    ...(grade === null ? [] : [grade.name]),
    t('share.text.server', { server: content.server }),
  ]
  return { head: content.label ?? '', blocks, grade, foot, server: content.server, date, lines }
}
