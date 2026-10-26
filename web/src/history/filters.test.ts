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

// The History list's filters, chips, recent labels and sort (ui/screens.md section 3).

import { describe, expect, it } from 'vitest'

import type { Result } from '@/engine/messages'
import { chips, correctedQuery, DEFAULT_SORT, filterFromQuery, filterResults, firstDay, NO_FILTER, queryFromFilter, recentLabels, sortResults } from '@/history/filters'
import { resultFixture } from '@/test/fixtures'

const NOW = new Date(2026, 9, 17, 12, 0)

function at(id: string, local: [number, number, number, number?], fields: Partial<Result> = {}): Result {
  const [year, month, day, hour = 12] = local
  return resultFixture({ id, startedAt: new Date(year, month - 1, day, hour).toISOString(), ...fields })
}

const LAN = at('lan', [2026, 10, 16], { label: 'Desk' })
const VPN = at('vpn', [2026, 10, 1], { label: 'Phone', note: 'Hotel Wi-Fi', client: { ...resultFixture().client, contextLabel: 'VPN' } })
const OLD = at('old', [2026, 6, 1, 0], { label: 'Desk' })
const ALL = [LAN, VPN, OLD]

describe('the filter in the query string', () => {
  it('corrects what it cannot read and swaps a reversed range, and leaves a readable query alone', () => {
    expect(correctedQuery({ range: 'foo', q: 'hotel' })).toEqual({ q: 'hotel' })
    expect(correctedQuery({ range: '2026-10-19..2026-10-15' })).toEqual({ range: '2026-10-15..2026-10-19' })
    expect(filterFromQuery({ range: '2026-10-19..2026-10-15' }).range).toEqual({ kind: 'custom', from: '2026-10-15', to: '2026-10-19' })
    expect(correctedQuery({ range: '2026-02-30..2026-03-01' })).toEqual({})
    expect(correctedQuery({ labels: ['Desk', 'Phone'], contexts: 'VPN', range: '30d', q: 'hotel', units: 'bytes' })).toBeNull()
    expect(correctedQuery({ range: 'all' })).toBeNull()
    expect(correctedQuery({})).toBeNull()
  })

  it('reads and writes labels, contexts, range and q, and nothing when unfiltered', () => {
    const filter = filterFromQuery({ labels: ['Desk', 'Phone'], contexts: 'VPN', range: '30d', q: 'hotel' })
    expect(filter).toEqual({ labels: ['Desk', 'Phone'], contexts: ['VPN'], range: { kind: 'days', days: 30 }, q: 'hotel' })
    expect(queryFromFilter(filter)).toEqual({ labels: ['Desk', 'Phone'], contexts: ['VPN'], range: '30d', q: 'hotel' })
    expect(filterFromQuery({})).toEqual(NO_FILTER)
    expect(queryFromFilter(NO_FILTER)).toEqual({})
  })

  it('reads a custom range of two local dates, and ignores one it cannot read', () => {
    expect(filterFromQuery({ range: '2026-10-01..2026-10-16' }).range).toEqual({ kind: 'custom', from: '2026-10-01', to: '2026-10-16' })
    expect(queryFromFilter({ ...NO_FILTER, range: { kind: 'custom', from: '2026-10-01', to: '2026-10-16' } })).toEqual({ range: '2026-10-01..2026-10-16' })
    for (const range of ['2026-02-30..2026-03-01', '2026-10-01', '1d', 'all']) {
      expect(filterFromQuery({ range }).range).toEqual({ kind: 'all' })
    }
  })

  it('never uses a name of the URL parameters', () => {
    const names = Object.keys(queryFromFilter({ labels: ['a'], contexts: ['b'], range: { kind: 'days', days: 7 }, q: 'c' }))
    expect(names.filter((name) => ['run', 'test', 'preset', 'duration', 'streams', 'cap', 'units', 'lang', 'theme', 'label'].includes(name))).toEqual([])
  })
})

describe('filtering', () => {
  it('keeps the chosen labels and contexts', () => {
    expect(filterResults(ALL, { ...NO_FILTER, labels: ['Desk'] }, NOW).map((r) => r.id)).toEqual(['lan', 'old'])
    expect(filterResults(ALL, { ...NO_FILTER, contexts: ['VPN'] }, NOW).map((r) => r.id)).toEqual(['vpn'])
  })

  it('keeps the last days, or a custom range with both days inclusive', () => {
    expect(filterResults(ALL, { ...NO_FILTER, range: { kind: 'days', days: 7 } }, NOW).map((r) => r.id)).toEqual(['lan'])
    expect(filterResults(ALL, { ...NO_FILTER, range: { kind: 'days', days: 90 } }, NOW).map((r) => r.id)).toEqual(['lan', 'vpn'])
    expect(filterResults(ALL, { ...NO_FILTER, range: { kind: 'custom', from: '2026-06-01', to: '2026-10-01' } }, NOW).map((r) => r.id)).toEqual(['vpn', 'old'])
    const lastMoment = at('late', [2026, 10, 1, 23])
    expect(filterResults([lastMoment], { ...NO_FILTER, range: { kind: 'custom', from: '2026-10-01', to: '2026-10-01' } }, NOW)).toHaveLength(1)
  })

  it('counts the last days as calendar days ending today', () => {
    expect(firstDay(30, new Date(2026, 9, 8, 15, 30))).toEqual(new Date(2026, 8, 9))
    expect(firstDay(7, new Date(2026, 9, 8, 0, 5))).toEqual(new Date(2026, 9, 2))
  })

  it('searches the labels and notes, ignoring case', () => {
    expect(filterResults(ALL, { ...NO_FILTER, q: 'HOTEL' }, NOW).map((r) => r.id)).toEqual(['vpn'])
    expect(filterResults(ALL, { ...NO_FILTER, q: 'desk' }, NOW).map((r) => r.id)).toEqual(['lan', 'old'])
    // The context label is a chip, not part of the search.
    expect(filterResults(ALL, { ...NO_FILTER, q: 'vpn' }, NOW).map((r) => r.id)).toEqual([])
  })
})

describe('chips and recent labels', () => {
  it('count each label and context, the most frequent first', () => {
    expect(chips(ALL, 'label')).toEqual([
      { value: 'Desk', count: 2 },
      { value: 'Phone', count: 1 },
    ])
    expect(chips(ALL, 'context')).toEqual([
      { value: 'LAN', count: 2 },
      { value: 'VPN', count: 1 },
    ])
  })

  it('offer the 5 most recent distinct labels', () => {
    const many = ['a', 'b', 'a', 'c', 'd', '', 'e', 'f'].map((label, index) => at(`r${index}`, [2026, 10, 10 - index], { label }))
    expect(recentLabels(many)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

describe('sorting', () => {
  it('sorts newest first by default', () => {
    expect(DEFAULT_SORT).toEqual({ key: 'startedAt', direction: 'descending' })
    expect(sortResults([OLD, LAN, VPN], DEFAULT_SORT.key, DEFAULT_SORT.direction).map((r) => r.id)).toEqual(['lan', 'vpn', 'old'])
  })

  it('sorts grades by their order and an absent value last either way', () => {
    const graded = ['B', 'A+', undefined, 'F'].map((grade, index) => at(`g${index}`, [2026, 10, 1], grade === undefined ? {} : { bufferbloat: { grade: grade as 'B', basis: 'download', increaseMs: 1 } }))
    expect(sortResults(graded, 'grade', 'ascending').map((r) => r.bufferbloat?.grade ?? '-')).toEqual(['A+', 'B', 'F', '-'])
    expect(sortResults(graded, 'grade', 'descending').map((r) => r.bufferbloat?.grade ?? '-')).toEqual(['F', 'B', 'A+', '-'])
  })

  it('sorts rates as numbers and text by its order', () => {
    const fast = resultFixture({ id: 'fast', label: 'b' })
    const slow = resultFixture({ id: 'slow', label: 'a', download: { ...resultFixture().download!, bitsPerSecond: 9 } })
    expect(sortResults([slow, fast], 'download', 'descending').map((r) => r.id)).toEqual(['fast', 'slow'])
    expect(sortResults([fast, slow], 'label', 'ascending').map((r) => r.id)).toEqual(['slow', 'fast'])
  })
})
