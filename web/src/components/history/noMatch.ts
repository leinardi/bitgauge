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
import type { HistoryFilter } from '@/history/filters'
import { fill, slot, type TimedText, timeRange } from '@/lib/timeText'

// The no-match text of the History list (ui/screens.md section 3; kit History.jsx): what the filter
// asks for, in words, and that every result is still in history.

/** "Nothing with context VPN in the last 7 days matches “airport”. All 48 results are still in history.", a custom range's days in <time> elements. */
export function noMatchBody(filter: HistoryFilter, total: number, { t, locale }: Wording): TimedText {
  const or = (values: readonly string[]) => new Intl.ListFormat(locale, { type: 'disjunction' }).format(values)
  const parts = [
    ...(filter.contexts.length > 0 ? [t('history.noMatch.context', { values: or(filter.contexts) })] : []),
    ...(filter.labels.length > 0 ? [t('history.noMatch.label', { values: or(filter.labels) })] : []),
    ...(filter.range.kind === 'days' ? [t('history.noMatch.days', { n: filter.range.days })] : []),
    ...(filter.range.kind === 'custom' ? [t('history.noMatch.between', { range: slot('range') })] : []),
  ]
  const what = parts.length === 0 ? t('history.noMatch.nothing') : t('history.noMatch.nothingWith', { parts: parts.join(' ') })
  const sentence = filter.q === '' ? t('history.noMatch.matches', { what }) : t('history.noMatch.matchesQuery', { what, q: filter.q })
  const range = filter.range.kind === 'custom' ? timeRange(filter.range.from, filter.range.to, { dateStyle: 'medium' }, locale) : []
  return fill(`${sentence} ${t('history.noMatch.still', { n: total }, total)}`, { range })
}
