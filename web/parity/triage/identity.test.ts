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

import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { entry } from './fixtures.ts'
import {
  ALL_PROJECT_NAMES,
  collapseOwned,
  countDifferences,
  describeCollision,
  differenceHash,
  differenceKey,
  expandOwned,
  findCollisions,
  type OwnedId,
} from './identity.ts'

describe('differenceHash', () => {
  it('is the first 12 hex characters of the sha256 of the difference key', () => {
    const e = entry()
    expect(differenceKey(e)).toBe('style\tmain > button "Start test"\tfont-weight\t600 → 500')
    expect(differenceHash(e)).toBe(createHash('sha256').update(differenceKey(e)).digest('hex').slice(0, 12))
    expect(differenceHash(e)).toMatch(/^[0-9a-f]{12}$/)
  })

  it('ignores the project, the scenario and the reason', () => {
    const e = entry()
    expect(differenceHash(entry({ project: 'dark-narrow', scenario: 'test/complete', reason: 'other' }))).toBe(differenceHash(e))
    expect(differenceHash(entry({ detail: '700 → 500' }))).not.toBe(differenceHash(e))
  })
})

describe('owned', () => {
  const hash = differenceHash(entry())

  it('collapses all four projects to "*" and expands it back', () => {
    const ids: OwnedId[] = ALL_PROJECT_NAMES.map((project) => ({ project, scenario: 'test/idle', hash }))
    const owned = collapseOwned(ids)
    expect(owned).toEqual({ 'test/idle': { [hash]: '*' } })
    expect(expandOwned(owned)).toEqual(ids)
  })

  it('keeps fewer projects as a sorted list', () => {
    const owned = collapseOwned([
      { project: 'light-narrow', scenario: 'test/complete', hash },
      { project: 'dark-narrow', scenario: 'test/complete', hash },
    ])
    expect(owned).toEqual({ 'test/complete': { [hash]: ['dark-narrow', 'light-narrow'] } })
    expect(expandOwned(owned).map((id) => id.project)).toEqual(['dark-narrow', 'light-narrow'])
  })

  it('serializes the same identities the same way whatever their order', () => {
    const a = { project: 'light-narrow', scenario: 'test/complete', hash: 'bbbbbbbbbbbb' }
    const b = { project: 'dark-narrow', scenario: 'test/idle', hash: 'aaaaaaaaaaaa' }
    expect(JSON.stringify(collapseOwned([a, b]))).toBe(JSON.stringify(collapseOwned([b, a])))
    expect(Object.keys(collapseOwned([a, b]))).toEqual(['test/complete', 'test/idle'])
  })
})

describe('differences and collisions', () => {
  it('counts a difference once across projects', () => {
    const entries = [entry(), entry({ project: 'dark-narrow' }), entry({ detail: '700 → 500' })]
    expect(countDifferences(entries)).toBe(2)
  })

  it('finds no collision between the same difference in two projects', () => {
    expect(findCollisions([entry(), entry({ project: 'dark-narrow' })])).toEqual([])
  })

  it('names both keys of a collision', () => {
    // A real 48-bit sha256 collision is not to be found in a test, so the hash is forced.
    const a = entry()
    const b = entry({ detail: '700 → 500' })
    const collisions = findCollisions([a, b, entry({ scenario: 'test/complete' })], () => 'aaaaaaaaaaaa')
    expect(collisions).toEqual([{ scenario: 'test/idle', hash: 'aaaaaaaaaaaa', keys: [differenceKey(a), differenceKey(b)] }])
    expect(describeCollision(collisions[0] as (typeof collisions)[number])).toContain(differenceKey(b))
  })
})
