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

import type { Bufferbloat, Result, ResultStatus } from '@/engine/messages'
import { latencyNumber, rateParts } from '@/lib/format'

// A stored result as the History list and the Test screen's last-result line show it (ui/screens.md
// sections 1 and 3): its start in the active locale, the headline numbers in the chosen units, the
// grade and the flags; an absent number is null, which the views show as a dash.

export interface RateView {
  number: string
  unit: string
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
  download: RateView | null
  upload: RateView | null
  /** The idle median and jitter, numbers in milliseconds. */
  latency: string | null
  jitter: string | null
  grade: Bufferbloat['grade'] | null
  lowConfidence: boolean
}

function rate(direction: Result['download'], units: 'bits' | 'bytes', locale: string): RateView | null {
  return direction?.bitsPerSecond === undefined ? null : rateParts(direction.bitsPerSecond, units, locale)
}

/** The start in the active locale and the browser's time zone (ui/i18n-a11y.md section 1.3). */
export function resultDate(startedAt: string, locale: string): string {
  const date = new Date(startedAt)
  return Number.isNaN(date.getTime()) ? startedAt : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function rowView(result: Result, units: 'bits' | 'bytes', locale: string): RowView {
  const resolution = result.client.timerResolutionMs
  const { idle } = result
  return {
    id: result.id,
    startedAt: result.startedAt,
    date: resultDate(result.startedAt, locale),
    label: result.label,
    contextLabel: result.client.contextLabel,
    protocol: result.client.protocol,
    status: result.status,
    download: rate(result.download, units, locale),
    upload: rate(result.upload, units, locale),
    latency: idle?.medianMs === undefined ? null : latencyNumber(idle.medianMs, locale, resolution),
    jitter: idle?.jitterMs === undefined ? null : latencyNumber(idle.jitterMs, locale, resolution),
    grade: result.bufferbloat?.grade ?? null,
    lowConfidence: [result.download, result.upload].some((direction) => direction?.confidence?.level === 'low'),
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
