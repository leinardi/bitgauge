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

import type { Direction, DirectionResult, Notice, Result, TestSettings } from '@/engine/messages'
import { formatBytes, formatLimit } from '@/lib/format'

import type { Wording } from '@/components/test/wording'

// The insufficient-data notice (ui/screens.md section 7): titled by its direction, its body names
// the maximum the direction reached, or the data cap that ended it, the data it used and what the
// offered preset allows. Nothing in it depends on the phase running now, so it is fixed once shown
// and announced once.

type InsufficientData = Extract<Notice, { code: 'insufficient-data' }>

/** What the notice reads besides the result: the run's settings and, while it runs, the directions that ended. */
export interface InsufficientContext {
  settings?: TestSettings | null
  result?: Result | null
  /** Each direction that has ended, as its phase event carried it. */
  directions?: Partial<Record<Direction, DirectionResult | undefined>>
}

/** A configured maximum, in whole seconds as the presets state them: 20 s. */
function name(direction: Direction, { t }: Wording): string {
  return direction === 'download' ? t('notices.insufficientData.directions.download') : t('notices.insufficientData.directions.upload')
}

export function insufficientWording(notice: InsufficientData, context: Wording & InsufficientContext): { title: string; body: string } {
  const { t, locale } = context
  const { direction } = notice
  const download = direction === 'download'
  const maxMs = context.settings?.[direction].maxMs
  const ended = context.result?.[direction] ?? context.directions?.[direction]
  const bytes = ended?.bytes
  // A direction the data cap ended reached no maximum (measurement.md section 8.6).
  const capped = ended?.events.some((event) => event.code === 'data-cap') === true
  const sentences = [
    capped
      ? download ? t('notices.insufficientData.downloadCap') : t('notices.insufficientData.uploadCap')
      : maxMs === undefined || maxMs === null
        ? download ? t('notices.insufficientData.download') : t('notices.insufficientData.upload')
        : download ? t('notices.insufficientData.downloadMax', { max: formatLimit(maxMs, locale) }) : t('notices.insufficientData.uploadMax', { max: formatLimit(maxMs, locale) }),
    ...(bytes === undefined ? [] : [t('notices.insufficientData.used', { data: formatBytes(bytes, locale) })]),
  ]
  const offer = notice.offer === null ? null : notice.offer === 'extended' ? t('notices.insufficientData.offer.extended') : t('notices.insufficientData.offer.standard')
  if (offer !== null) {
    sentences.push(offer)
  }
  return { title: t('notices.insufficientData.title', { direction: name(direction, context) }), body: sentences.join(' ') }
}
