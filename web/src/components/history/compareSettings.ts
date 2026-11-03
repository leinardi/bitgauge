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

import { directionName, phasesText } from '@/components/result/parameters'
import type { Wording } from '@/components/test/wording'
import type { Direction, Result } from '@/engine/messages'
import { formatDuration, formatSpan } from '@/lib/format'

// The settings Compare lists beside the preset (ui/screens.md section 3): the phases, each
// direction's duration bounds (a Continuous run's length in their place), the warm-up and the ping
// count. They show both values and mark a difference, without keeping the results apart.

export interface SettingRow {
  key: string
  name: string
  of: (result: Result) => string
}

const DASH = '—'

function bounds(result: Result, direction: Direction, { t, locale }: Wording): string {
  const configured = result.settings[direction]
  if (configured === undefined || configured.minMs === null) {
    return DASH
  }
  const seconds = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  return t('history.compare.bounds', { min: seconds.format(configured.minMs / 1000), max: seconds.format(configured.maxMs / 1000) })
}

function runLength(result: Result, { t, locale }: Wording): string {
  const length = result.settings.runLengthMs
  return length === undefined ? t('result.parameters.runLengthNone') : formatSpan(length, locale)
}

function warmup(result: Result, { t, locale }: Wording): string {
  const { warmup: mode } = result.settings
  return mode === 'auto' ? t('result.parameters.warmupAuto') : t('result.parameters.warmupFixed', { s: formatDuration(mode, locale) })
}

export function compareSettings(a: Result, b: Result, wording: Wording): SettingRow[] {
  const { t } = wording
  const continuous = (result: Result) => result.settings.preset === 'continuous'
  const either = continuous(a) || continuous(b)
  const both = continuous(a) && continuous(b)
  const durations: SettingRow[] = (['download', 'upload'] as const).map((direction) => ({
    key: `duration-${direction}`,
    name: t('history.compare.durationOf', { direction: directionName(direction, wording).toLocaleLowerCase(wording.locale) }),
    of: (result) => bounds(result, direction, wording),
  }))
  const length: SettingRow = { key: 'run-length', name: t('result.parameters.runLength'), of: (result) => (continuous(result) ? runLength(result, wording) : DASH) }
  return [
    { key: 'phases', name: t('result.parameters.phases'), of: (result) => phasesText(result, wording, t('history.compare.then')) },
    // A bounded run has durations, a Continuous one a run length; a pair of both shows both.
    ...(both ? [] : durations),
    ...(either ? [length] : []),
    { key: 'warmup', name: t('result.parameters.warmup'), of: (result) => warmup(result, wording) },
    { key: 'pings', name: t('result.parameters.pingCount'), of: (result) => String(result.settings.pingCount) },
  ]
}
