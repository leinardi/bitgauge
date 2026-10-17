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

import type { Result } from '@/engine/messages'

// The History list's filters and sort (ui/screens.md section 3). The filter lives in the query
// string: `labels` and `contexts`, one occurrence per selected chip; `range`, `7d`, `30d`, `90d`,
// `all` by default, or a custom `<from>..<to>` of local dates, both inclusive; and `q`, a search
// over the results' labels and notes. None of them is a name of the URL parameters. The list sorts newest
// first by default; grades sort by their order, A+ first, and an absent value sorts last.

export type DateRange = { kind: 'all' } | { kind: 'days'; days: 7 | 30 | 90 } | { kind: 'custom'; from: string; to: string }

export interface HistoryFilter {
  labels: string[]
  contexts: string[]
  range: DateRange
  q: string
}

export type Query = Record<string, string | null | (string | null)[] | undefined>

export const NO_FILTER: HistoryFilter = { labels: [], contexts: [], range: { kind: 'all' }, q: '' }

const DAY_MS = 86_400_000
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function values(value: Query[string]): string[] {
  const list = Array.isArray(value) ? value : [value]
  return list.filter((item): item is string => typeof item === 'string')
}

/** A local date `YYYY-MM-DD` as its midnight, or null when it is not one. */
function localDay(text: string): Date | null {
  const match = LOCAL_DATE.exec(text)
  if (match === null) {
    return null
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

function range(text: string | undefined): DateRange {
  switch (text) {
    case '7d':
      return { kind: 'days', days: 7 }
    case '30d':
      return { kind: 'days', days: 30 }
    case '90d':
      return { kind: 'days', days: 90 }
    default: {
      const [from, to, ...rest] = (text ?? '').split('..')
      return from !== undefined && to !== undefined && rest.length === 0 && localDay(from) !== null && localDay(to) !== null ? { kind: 'custom', from, to } : { kind: 'all' }
    }
  }
}

/** The filter a query string holds; a value it cannot read is no filter. */
export function filterFromQuery(query: Query): HistoryFilter {
  return { labels: values(query['labels']), contexts: values(query['contexts']), range: range(values(query['range'])[0]), q: values(query['q'])[0] ?? '' }
}

/** The query string of a filter, leaving out what is not filtered. */
export function queryFromFilter(filter: HistoryFilter): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {}
  if (filter.labels.length > 0) {
    query['labels'] = [...filter.labels]
  }
  if (filter.contexts.length > 0) {
    query['contexts'] = [...filter.contexts]
  }
  if (filter.range.kind === 'days') {
    query['range'] = `${filter.range.days}d`
  } else if (filter.range.kind === 'custom') {
    query['range'] = `${filter.range.from}..${filter.range.to}`
  }
  if (filter.q !== '') {
    query['q'] = filter.q
  }
  return query
}

function inRange(startedAt: number, range: DateRange, now: Date): boolean {
  switch (range.kind) {
    case 'all':
      return true
    case 'days':
      return startedAt >= now.getTime() - range.days * DAY_MS
    case 'custom': {
      const from = localDay(range.from)
      const to = localDay(range.to)
      // Both days inclusive: up to the midnight that ends `to`.
      return from !== null && to !== null && startedAt >= from.getTime() && startedAt < new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1).getTime()
    }
  }
}

/** Whether a result passes the filter at `now`. */
function matches(result: Result, filter: HistoryFilter, now: Date): boolean {
  const q = filter.q.trim().toLowerCase()
  return (
    (filter.labels.length === 0 || filter.labels.includes(result.label)) &&
    (filter.contexts.length === 0 || filter.contexts.includes(result.client.contextLabel)) &&
    inRange(Date.parse(result.startedAt), filter.range, now) &&
    (q === '' || [result.label, result.note ?? ''].some((text) => text.toLowerCase().includes(q)))
  )
}

export function filterResults(results: readonly Result[], filter: HistoryFilter, now: Date): Result[] {
  return results.filter((result) => matches(result, filter, now))
}

/** The chips of a filter: each distinct non-empty value with its count, the most frequent first. */
export function chips(results: readonly Result[], of: 'label' | 'context'): { value: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const result of results) {
    const value = of === 'label' ? result.label : result.client.contextLabel
    if (value !== '') {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/** The 5 most recent distinct labels, for the Test screen's label field. */
export function recentLabels(results: readonly Result[], count = 5): string[] {
  const newest = [...results].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
  return [...new Set(newest.map((result) => result.label).filter((label) => label !== ''))].slice(0, count)
}

export type SortKey = 'startedAt' | 'label' | 'contextLabel' | 'download' | 'upload' | 'idle' | 'jitter' | 'grade' | 'protocol' | 'status'
export type SortDirection = 'ascending' | 'descending'

export const DEFAULT_SORT: { key: SortKey; direction: SortDirection } = { key: 'startedAt', direction: 'descending' }

const GRADES = ['A+', 'A', 'B', 'C', 'D', 'F']

function sortValue(result: Result, key: SortKey): string | number | undefined {
  switch (key) {
    case 'startedAt':
      return Date.parse(result.startedAt)
    case 'label':
      return result.label === '' ? undefined : result.label
    case 'contextLabel':
      return result.client.contextLabel === '' ? undefined : result.client.contextLabel
    case 'download':
      return result.download?.bitsPerSecond
    case 'upload':
      return result.upload?.bitsPerSecond
    case 'idle':
      return result.idle?.medianMs
    case 'jitter':
      return result.idle?.jitterMs
    case 'grade':
      // Ascending is best first.
      return result.bufferbloat === undefined ? undefined : GRADES.indexOf(result.bufferbloat.grade)
    case 'protocol':
      return result.client.protocol === '' ? undefined : result.client.protocol
    case 'status':
      return result.status
  }
}

/** The results sorted by `key`; an absent value sorts last either way, ties keep their order. */
export function sortResults(results: readonly Result[], key: SortKey, direction: SortDirection): Result[] {
  const sign = direction === 'ascending' ? 1 : -1
  return [...results].sort((a, b) => {
    const x = sortValue(a, key)
    const y = sortValue(b, key)
    if (x === undefined || y === undefined) {
      return x === y ? 0 : x === undefined ? 1 : -1
    }
    return sign * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)))
  })
}
