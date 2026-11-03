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

import type { useI18n } from 'vue-i18n'

import { directionQualifiers, qualifiedRate } from '@/components/result/qualifiers'
import { ungradedText } from '@/components/result/ungraded'
import type { Wording } from '@/components/test/wording'
import type { Bufferbloat, Direction, Result, ResultStatus } from '@/engine/messages'
import { runPhases } from '@/lib/continuous'
import { latencyNumber, rateParts } from '@/lib/format'
import { protocolLabel } from '@/lib/protocol'

// A stored result as the History list and the Test screen's last-result line show it (ui/screens.md
// sections 1 and 3): its start in the active locale, the headline numbers in the chosen units, the
// grade, or "Not graded" with its one reason, and the status; an absent number is null, which the views show as a dash. Each speed
// carries its qualifiers (status, confidence, overhead compensation), shown as a caption under it.

export interface RateView {
  number: string
  unit: string
}

export interface RowRate {
  /** The number, or null without one. */
  value: RateView | null
  /** Its qualifiers' words, in order; empty for a measured direction of normal confidence. */
  qualifiers: string[]
}

export interface RowView {
  id: string
  /** The start, for a `<time>` element. */
  startedAt: string
  date: string
  label: string
  contextLabel: string
  protocol: string
  status: ResultStatus
  download: RowRate
  upload: RowRate
  /** The idle median and jitter, numbers in milliseconds. */
  latency: string | null
  jitter: string | null
  grade: Bufferbloat['grade'] | null
  /** Without a grade, the one reason it has none (ui/screens.md section 6). */
  ungraded: string | null
}

/** A direction's number and qualifiers; a direction the run did not include has neither. */
function rate(result: Result, direction: Direction, units: 'bits' | 'bytes', wording: Wording): RowRate {
  const part = result[direction]
  const value = part?.bitsPerSecond === undefined ? null : rateParts(part.bitsPerSecond, units, wording.locale)
  if (part === undefined || !runPhases(result.settings).includes(direction)) {
    return { value, qualifiers: [] }
  }
  return { value, qualifiers: directionQualifiers(qualifiedRate(part), result.settings.overheadCompensationPercent, wording).map((qualifier) => qualifier.text) }
}

/** The start in the active locale and the browser's time zone (ui/i18n-a11y.md section 1.3). */
export function resultDate(startedAt: string, locale: string): string {
  const date = new Date(startedAt)
  return Number.isNaN(date.getTime()) ? startedAt : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** A day without the year or the time ("Sep 26"), as the trend's span and the selection name it. */
export const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

export function rowView(result: Result, units: 'bits' | 'bytes', wording: Wording): RowView {
  const { locale } = wording
  const resolution = result.client.timerResolutionMs
  const { idle } = result
  return {
    id: result.id,
    startedAt: result.startedAt,
    date: resultDate(result.startedAt, locale),
    label: result.label,
    contextLabel: result.client.contextLabel,
    // Labeled as the Test screen labels it (ui/screens.md section 6); empty when not reported.
    protocol: protocolLabel(result.client.protocol) ?? '',
    status: result.status,
    download: rate(result, 'download', units, wording),
    upload: rate(result, 'upload', units, wording),
    latency: idle?.medianMs === undefined ? null : latencyNumber(idle.medianMs, locale, resolution),
    jitter: idle?.jitterMs === undefined ? null : latencyNumber(idle.jitterMs, locale, resolution),
    grade: result.bufferbloat?.grade ?? null,
    ungraded: result.bufferbloat === undefined ? ungradedText(result, wording.t) : null,
  }
}

/** A grade's word, the bufferbloat it stands for (measurement.md section 11.3). */
export function gradeWord(grade: Bufferbloat['grade'], t: ReturnType<typeof useI18n>['t']): string {
  switch (grade) {
    case 'A+':
      return t('test.grades.aPlus')
    case 'A':
      return t('test.grades.a')
    case 'B':
      return t('test.grades.b')
    case 'C':
      return t('test.grades.c')
    case 'D':
      return t('test.grades.d')
    case 'F':
      return t('test.grades.f')
  }
}
