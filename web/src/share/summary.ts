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
import type { Direction } from '@/engine/messages'
import { formatPercent, latencyNumber, rateParts } from '@/lib/format'
import type { ShareContent, ShareRate } from '@/share/content'

// The share's words (ui/flows.md section 8): the image's parts and the copied summary's lines, in
// the page's language, from the share's content alone. Each number carries its qualifiers; the
// image and the text say the same things, which the share panel previews before anything leaves.

export interface ShareBlock {
  direction: Direction
  label: string
  /** The number, or "—" without one. */
  value: string
  unit: string
  qualifier: string | null
}

export interface ShareView {
  /** The label, when included; empty otherwise. */
  head: string
  blocks: ShareBlock[]
  grade: { letter: string; word: string; name: string } | null
  /** Idle latency, jitter, the loaded-latency increase, overhead compensation and the date. */
  foot: string[]
  server: string
  /** The copied summary, a line each. */
  lines: string[]
}

const DASH = '—'

function qualifiers(rate: ShareRate, { t }: Wording): string[] {
  const words: string[] = []
  switch (rate.status) {
    case 'partial':
      words.push(t('share.qualifiers.partial'))
      break
    case 'insufficient-data':
      words.push(t('share.qualifiers.insufficient'))
      break
    case 'skipped':
      words.push(t('share.qualifiers.skipped'))
      break
    case 'error':
      words.push(t('share.qualifiers.error'))
      break
    case 'measured':
      break
  }
  if (rate.confidence === 'low') {
    words.push(t('share.qualifiers.lowConfidence'))
  } else if (rate.confidence === 'cpu-bound') {
    words.push(t('share.qualifiers.cpuBound'))
  }
  return words
}

function block(direction: Direction, rate: ShareRate, units: 'bits' | 'bytes', wording: Wording): ShareBlock {
  const { t, locale } = wording
  const label = direction === 'download' ? t('share.image.download') : t('share.image.upload')
  const words = qualifiers(rate, wording)
  const qualifier = words.length === 0 ? null : words.join(', ')
  if (rate.bitsPerSecond === null) {
    return { direction, label, value: DASH, unit: '', qualifier }
  }
  const { number, unit } = rateParts(rate.bitsPerSecond, units, locale)
  return { direction, label, value: number, unit, qualifier }
}

/** A direction's rate as the summary says it: the number and unit, then its qualifiers. */
function rateText(item: ShareBlock, { t }: Wording): string {
  const value = item.value === DASH ? (item.qualifier ?? DASH) : `${item.value} ${item.unit}`
  return item.value !== DASH && item.qualifier !== null ? t('share.text.qualified', { value, qualifier: item.qualifier }) : value
}

export function shareView(content: ShareContent, units: 'bits' | 'bytes', wording: Wording): ShareView {
  const { t, locale } = wording
  const ms = (value: number) => latencyNumber(value, locale, content.resolutionMs)
  const started = new Date(content.startedAt)
  const date = Number.isNaN(started.getTime()) ? content.startedAt : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(started)
  const blocks = (['download', 'upload'] as const).flatMap((direction) => {
    const rate = content[direction]
    return rate === null ? [] : [block(direction, rate, units, wording)]
  })
  const overhead = content.overheadPercent > 0 ? t('share.overhead', { percent: formatPercent(content.overheadPercent, locale) }) : null
  const loaded = content.loaded
  const loadedWhere = (direction: Direction) => (direction === 'download' ? t('share.text.download') : t('share.text.upload'))
  const loadedQualifier = loaded === null ? null : loaded.source === 'websocket' ? loadedWhere(loaded.direction) : t('share.text.via', { direction: loadedWhere(loaded.direction), source: sourceName(loaded.source, t) })
  const grade = content.grade === null ? null : { letter: content.grade, word: gradeWord(content.grade, t), name: t('share.grade', { grade: content.grade, word: gradeWord(content.grade, t) }) }

  const foot = [
    ...(content.idleMs === null ? [] : [t('share.image.idle', { ms: ms(content.idleMs) })]),
    ...(content.jitterMs === null ? [] : [t('share.image.jitter', { ms: ms(content.jitterMs) })]),
    ...(loaded === null ? [] : [t('share.image.loaded', { ms: ms(loaded.increaseMs), qualifier: loadedQualifier })]),
    ...(overhead === null ? [] : [overhead]),
    date,
  ]

  const rates = blocks.map((item) => (item.direction === 'download' ? t('share.text.downloadRate', { rate: rateText(item, wording) }) : t('share.text.uploadRate', { rate: rateText(item, wording) })))
  const latency = [
    ...(content.idleMs === null ? [] : [t('share.text.idle', { ms: ms(content.idleMs) })]),
    ...(content.jitterMs === null ? [] : [t('share.text.jitter', { ms: ms(content.jitterMs) })]),
  ]
  const lines = [
    content.label === null ? t('share.text.title') : t('share.text.titleLabel', { label: content.label }),
    date,
    ...(rates.length === 0 ? [] : [rates.join(' · ')]),
    ...(overhead === null ? [] : [overhead]),
    ...(latency.length === 0 ? [] : [latency.join(' · ')]),
    ...(loaded === null ? [] : [t('share.text.loaded', { ms: ms(loaded.increaseMs), qualifier: loadedQualifier })]),
    ...(grade === null ? [] : [grade.name]),
    t('share.text.server', { server: content.server }),
  ]
  return { head: content.label ?? '', blocks, grade, foot, server: content.server, lines }
}
