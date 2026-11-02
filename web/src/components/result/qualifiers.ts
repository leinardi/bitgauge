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

import type { Wording } from '@/components/test/wording'
import type { Confidence, DirectionResult, DirectionStatus } from '@/engine/messages'
import { formatPercent } from '@/lib/format'

// A direction's qualifiers wherever its speed is shown (ui/screens.md sections 3 and 6): its status
// other than measured, its confidence other than normal and a non-zero overhead compensation, in
// that order. Confidence and overhead compensation qualify a number, so only a direction with one
// carries them. The share, History and Compare word them alike; this module imports neither
// share/ nor components/history/, so both can import it.

/** How a qualifier reads: muted, or the warning or danger tone. */
export type QualifierTone = 'muted' | 'warn' | 'danger'

export interface Qualifier {
  text: string
  tone: QualifierTone
}

/** What a direction's qualifiers read: its status, its headline and its confidence. */
export interface QualifiedRate {
  status: DirectionStatus
  /** The headline, absent without a number. */
  bitsPerSecond: number | null
  /** The confidence other than normal, with its reasons, or null. */
  confidence: { level: Exclude<Confidence['level'], 'normal'>; reasons: Confidence['reasons'] } | null
}

/** A direction's result as its qualifiers read it. */
export function qualifiedRate(part: DirectionResult): QualifiedRate {
  const confidence = part.confidence
  return {
    status: part.status,
    bitsPerSecond: part.bitsPerSecond ?? null,
    confidence: confidence === undefined || confidence.level === 'normal' ? null : { level: confidence.level, reasons: confidence.reasons },
  }
}

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

function statusQualifier(rate: QualifiedRate, { t }: Wording): Qualifier | null {
  switch (rate.status) {
    // A partial direction without a number, stopped before a confirmed steady window, has insufficient data.
    case 'partial':
      return rate.bitsPerSecond === null ? { text: t('share.qualifiers.insufficient'), tone: 'warn' } : { text: t('share.qualifiers.partial'), tone: 'muted' }
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

function confidenceQualifier(confidence: NonNullable<QualifiedRate['confidence']>, wording: Wording): Qualifier {
  const { t } = wording
  if (confidence.level === 'cpu-bound') {
    return { text: t('share.qualifiers.cpuBound'), tone: 'warn' }
  }
  const reasons = confidence.reasons.map((reason) => reasonWord(reason, wording))
  return { text: reasons.length === 0 ? t('share.qualifiers.lowConfidence') : t('share.qualifiers.lowConfidenceReasons', { reasons: reasons.join(', ') }), tone: 'warn' }
}

/** Status, confidence, overhead compensation, in that order; the last two only with a number. */
export function directionQualifiers(block: QualifiedRate, overheadPercent: number, wording: Wording): Qualifier[] {
  const status = statusQualifier(block, wording)
  const qualifiers = status === null ? [] : [status]
  if (block.bitsPerSecond === null) {
    return qualifiers
  }
  if (block.confidence !== null) {
    qualifiers.push(confidenceQualifier(block.confidence, wording))
  }
  if (overheadPercent > 0) {
    qualifiers.push({ text: wording.t('share.overhead', { percent: formatPercent(overheadPercent, wording.locale) }), tone: 'muted' })
  }
  return qualifiers
}
