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

import { finding, numberDuplicates } from './findings.ts'

describe('finding', () => {
  it('flattens whitespace so a finding stays one baseline line', () => {
    expect(finding('content', 'main >\n  h1', 'text', 'Speed\ttest\n')).toEqual({ layer: 'content', path: 'main > h1', kind: 'text', detail: 'Speed test' })
  })

  it('cuts a long detail with a marker, never silently', () => {
    const { detail } = finding('style', 'main', 'color', 'x'.repeat(500))
    expect(detail).toHaveLength(160)
    expect(detail.endsWith('…')).toBe(true)
  })
})

describe('numberDuplicates', () => {
  it('numbers the later copies of one difference, so each keeps an identity of its own', () => {
    const missing = finding('content', 'main', 'missing', 'button Start test')
    const other = finding('content', 'main', 'missing', 'link About')
    expect(numberDuplicates([missing, other, missing, missing]).map((f) => f.detail)).toEqual([
      'button Start test',
      'link About',
      'button Start test (#2)',
      'button Start test (#3)',
    ])
  })
})
