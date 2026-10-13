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

import { assign } from './assign.ts'
import { cluster, DAY, decided, entry, everywhere, fullRun, match, verdict } from './fixtures.ts'
import { ALL_PROJECT_NAMES, countDifferences } from './identity.ts'

const LIGHT = ALL_PROJECT_NAMES.filter((p) => p.startsWith('light-'))
const DARK = ALL_PROJECT_NAMES.filter((p) => p.startsWith('dark-'))

describe('assign', () => {
  it('splits one difference by project between two clusters without an overlap', () => {
    const all = everywhere()
    const light = decided(all.filter((e) => LIGHT.includes(e.project)), { id: 'light', match: match({ projects: LIGHT, kind: '^font-weight$' }) })
    const dark = decided(all.filter((e) => DARK.includes(e.project)), { id: 'dark', match: match({ projects: DARK, kind: '^font-weight$' }) })
    const result = assign([light, dark], all)
    expect(result.overlaps).toEqual([])
    expect(result.flags).toEqual([])
    expect(result.unclustered).toEqual([])
    expect(result.clusters.map((c) => [c.cluster.id, c.ownedPresent.length, c.unowned.length, countDifferences(c.ownedPresent)])).toEqual([
      ['light', 2, 0, 1],
      ['dark', 2, 0, 1],
    ])
  })

  it('reports a rule overlap on entries no cluster owns', () => {
    const a = cluster({ id: 'a', match: match({ kind: '^font-weight$' }) })
    const b = cluster({ id: 'b', match: match({ detail: '600' }) })
    const result = assign([a, b], [entry()])
    expect(result.overlaps.map((o) => o.clusters)).toEqual([['a', 'b']])
    expect(result.flags.map((f) => f.kind)).toEqual(['problems'])
  })

  it('allows rules to overlap on entries one cluster owns', () => {
    const owner = decided([entry()], { id: 'owner' })
    const other = cluster({ id: 'other', match: match({ detail: '600' }) })
    const result = assign([owner, other], [entry()])
    expect(result.overlaps).toEqual([])
    expect(result.flags).toEqual([])
    const otherAssignment = result.clusters.find((c) => c.cluster.id === 'other')
    expect(otherAssignment?.unowned).toEqual([])
    expect(otherAssignment?.ownedElsewhere).toEqual([entry()])
  })

  it('still reports an owned entry as present after its rule was narrowed', () => {
    const narrowed = decided([entry()], { match: match({ kind: '^padding-left$' }) })
    const [result] = assign([narrowed], [entry()]).clusters
    expect(result?.ownedPresent).toEqual([entry()])
    expect(result?.unowned).toEqual([])
  })

  it('reports owned entries that are gone', () => {
    const c = decided([entry(), entry({ scenario: 'test/complete' })])
    const [result] = assign([c], [entry()]).clusters
    expect(result?.ownedGone.map((id) => id.scenario)).toEqual(['test/complete'])
  })

  it('flags a regression when an owned entry returns to a done cluster, even outside its rule', () => {
    const doneCluster = decided([entry()], {
      match: match({ scenarios: ['test/complete'], kind: '^padding-left$' }),
      actions: [{ target: 'vue', what: 'fix', done: true }],
      status: 'done',
      resolution: { note: null, on: DAY, run: fullRun(['test/idle', 'test/complete']) },
    })
    expect(assign([doneCluster], []).flags).toEqual([])
    const result = assign([doneCluster], [entry()])
    expect(result.flags.map((f) => [f.kind, f.cluster])).toEqual([['regression', 'start-button-weight']])
  })

  it('flags scope growth when a broad accepted rule matches a new finding', () => {
    const owned = entry()
    const accepted = decided([owned], { match: match(), decision: verdict('keep'), actions: [], status: 'accepted' })
    const newcomer = entry({ kind: 'color', detail: 'red → blue', source: 'pending', reason: null })
    const result = assign([accepted], [owned, newcomer])
    expect(result.flags.map((f) => [f.kind, f.cluster])).toEqual([['scope-growth', 'start-button-weight']])
    expect(result.clusters[0]?.unowned).toEqual([newcomer])
    expect(result.unclustered).toEqual([])
  })

  it('leaves what no cluster owns or matches unclustered', () => {
    const c = cluster({ match: match({ kind: '^font-weight$' }) })
    const stray = entry({ kind: 'color' })
    expect(assign([c], [entry(), stray]).unclustered).toEqual([stray])
  })

  it('suggests closing a decided cluster whose entries are gone and actions done', () => {
    const c = decided([entry()], { actions: [{ target: 'vue', what: 'fix', done: true }] })
    expect(assign([c], []).closeCandidates).toEqual(['start-button-weight'])
    expect(assign([decided([entry()])], []).closeCandidates).toEqual([])
    expect(assign([c], [entry()]).closeCandidates).toEqual([])
  })

  it('notes an open cluster whose rule matches nothing', () => {
    expect(assign([cluster()], []).resolvedLookingOpen).toEqual(['start-button-weight'])
    expect(assign([cluster()], [entry()]).resolvedLookingOpen).toEqual([])
  })

  it('turns validation problems into problems flags', () => {
    const result = assign([], [], { problems: ['a: id must be kebab-case'] })
    expect(result.flags).toEqual([{ kind: 'problems', cluster: null, text: 'a: id must be kebab-case' }])
  })

  it('turns hash collisions into problems flags', () => {
    const result = assign([], [entry(), entry({ detail: '700 → 500' })], { hashOf: () => 'aaaaaaaaaaaa' })
    expect(result.collisions).toHaveLength(1)
    expect(result.flags.map((f) => f.kind)).toEqual(['problems'])
    expect(result.flags[0]?.text).toContain('hash collision in test/idle on aaaaaaaaaaaa')
  })

  it('keeps each cluster on its own rule when two share an id', () => {
    const a = cluster({ match: match({ kind: '^font-weight$' }) })
    const b = cluster({ match: match({ kind: '^color$' }) })
    const colour = entry({ kind: 'color' })
    const result = assign([a, b], [entry(), colour])
    expect(result.clusters.map((c) => c.unowned)).toEqual([[entry()], [colour]])
  })

  it('matches nothing with a rule that does not compile', () => {
    const broken = cluster({ match: match({ path: '(' }) })
    expect(assign([broken], [entry()]).unclustered).toEqual([entry()])
  })
})
