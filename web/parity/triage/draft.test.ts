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
// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { compileMatch } from './assign.ts'
import { draftGroups, escapeRegExp } from './draft.ts'
import { entry, everywhere } from './fixtures.ts'

const unclustered = [
  ...everywhere(),
  entry({ scenario: 'test/complete' }),
  entry({ scenario: 'test/complete', path: 'main > card > button', detail: '700 → 500' }),
  entry({ layer: 'content', kind: 'changed', path: 'banner', detail: 'button "A" → "B"' }),
  entry({ layer: 'content', kind: 'changed', path: 'main', scenario: 'about', detail: 'button "A" → "B"', source: 'pending', reason: null }),
  entry({ layer: 'content', kind: 'missing', path: 'main > region "Results" > row "a"', scenario: 'test/upload', detail: 'row "a"' }),
  entry({ layer: 'content', kind: 'missing', path: 'main > region "Results" > row "b"', scenario: 'test/download', detail: 'row "b"' }),
  entry({ layer: 'content', kind: 'extra', path: 'main > region "Results"', scenario: 'test/download', detail: 'status' }),
  entry({ layer: 'content', kind: 'attrs', path: 'nav > link "Home"', detail: '[] → [current]' }),
]

describe('draftGroups', () => {
  const groups = draftGroups(unclustered)

  it('groups by the keys of each kind of finding', () => {
    expect(groups.map((g) => g.key)).toEqual([
      'style\tfont-weight\t600 → 500',
      'content\tchanged\tbutton "A" → "B"',
      'content\tmissing\ttest\tmain > region "Results"',
      'content\textra\ttest\tmain > region "Results"',
      'content\tother\ttest/idle\tnav',
      'style\tfont-weight\t700 → 500',
    ])
  })

  it('orders the largest group first and breaks ties by key', () => {
    expect(groups.map((g) => g.entries)).toEqual([5, 2, 2, 1, 1, 1])
  })

  it('counts every unclustered entry exactly once', () => {
    expect(groups.reduce((sum, g) => sum + g.entries, 0)).toBe(unclustered.length)
    expect(groups.reduce((sum, g) => sum + g.baselined + g.pending, 0)).toBe(unclustered.length)
    expect(groups[0]?.differences).toBe(2)
    expect(groups[1]).toMatchObject({ baselined: 1, pending: 1 })
  })

  it('suggests a rule that matches every entry of its group', () => {
    for (const group of groups) {
      const matcher = compileMatch(group.match)
      const members = unclustered.filter((e) => draftGroups([e])[0]?.key === group.key)
      expect(members.every(matcher)).toBe(true)
    }
    expect(groups[0]?.match).toEqual({
      scenarios: ['test/complete', 'test/idle'],
      projects: null,
      layer: 'style',
      path: null,
      kind: '^font-weight$',
      detail: '^600 → 500$',
    })
    expect(groups[2]?.match).toMatchObject({ scenarios: ['test/download', 'test/upload'], projects: ['light-desktop'], path: '^main > region "Results"(?: > |$)' })
  })

  it('shows three samples, the same ones every time', () => {
    expect(groups[0]?.samples).toHaveLength(3)
    expect(draftGroups([...unclustered].reverse())).toEqual(groups)
  })

  it('escapes regular expression syntax', () => {
    expect(escapeRegExp('row "a" (1) [x] *.$')).toBe('row "a" \\(1\\) \\[x\\] \\*\\.\\$')
    expect(new RegExp(`^${escapeRegExp('a.b')}$`).test('axb')).toBe(false)
  })
})
