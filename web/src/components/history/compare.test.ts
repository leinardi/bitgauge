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

// @vitest-environment jsdom

// Compare's wording (ui/screens.md section 3, open-questions.md 51): A is the older result, rates
// within ±2 % of A's and latencies within 1 ms read same, grades compare by order, an absent value is
// not comparable, and the warning names a different preset, protocol or label.

import { describe, expect, it } from 'vitest'

import { compare, comparisonText, differences, gradeChange, latencyChange, pair, rateChange } from '@/components/history/compare'
import { createAppI18n } from '@/i18n'
import { resultFixture } from '@/test/fixtures'

const t = createAppI18n('', ['en']).global.t as unknown as Parameters<typeof compare>[4]

describe('the thresholds', () => {
  it('reads a rate within ±2 % of A as the same, and higher as better', () => {
    expect(rateChange(100e6, 102e6).verdict).toBe('same')
    expect(rateChange(100e6, 98e6).verdict).toBe('same')
    expect(rateChange(100e6, 102.1e6)).toMatchObject({ verdict: 'better' })
    expect(rateChange(100e6, 97.9e6)).toMatchObject({ verdict: 'worse' })
    expect(rateChange(100e6, 103.4e6).percent).toBeCloseTo(3.4)
    expect(rateChange(undefined, 1e6).verdict).toBe('not-comparable')
    // From a measured zero: the direction only.
    expect(rateChange(0, 1e6)).toEqual({ verdict: 'better' })
    expect(rateChange(0, 0)).toEqual({ verdict: 'same' })
    expect(rateChange(1e6, undefined).verdict).toBe('not-comparable')
  })

  it('reads a latency within 1 ms as the same, and lower as better', () => {
    expect(latencyChange(15, 16).verdict).toBe('same')
    expect(latencyChange(15, 14).verdict).toBe('same')
    expect(latencyChange(15, 13.9)).toMatchObject({ verdict: 'better' })
    expect(latencyChange(15, 16.1)).toMatchObject({ verdict: 'worse' })
    expect(latencyChange(15, undefined).verdict).toBe('not-comparable')
  })

  it('compares grades by their order, A+ best', () => {
    expect(gradeChange('B', 'B')).toBe('same')
    expect(gradeChange('B', 'A+')).toBe('better')
    expect(gradeChange('A', 'F')).toBe('worse')
    expect(gradeChange(undefined, 'A')).toBe('not-comparable')
  })
})

describe('the pair', () => {
  const older = resultFixture({ id: 'a', startedAt: '2026-09-26T16:20:00.000Z' })
  const newer = resultFixture({ id: 'b', startedAt: '2026-10-02T07:05:00.000Z' })

  it('takes the older as A, in either order', () => {
    expect(pair(newer, older).map((result) => result.id)).toEqual(['a', 'b'])
    expect(compare(newer, older, 'bits', 'en', t).a.id).toBe('a')
  })

  it('words each change on B against A, and leaves the other rows unjudged', () => {
    const b = { ...newer, download: { ...newer.download!, bitsPerSecond: 650e6 }, idle: { ...newer.idle!, medianMs: 2.5 } }
    const { metrics } = compare(older, b, 'bits', 'en', t)
    const row = (key: string) => metrics.find((item) => item.key === key)
    expect(row('download')).toMatchObject({ verdict: 'better', change: '+6.2 %' })
    expect(row('upload')).toMatchObject({ verdict: 'same', change: '±0.0 %' })
    expect(row('idle')).toMatchObject({ verdict: 'same' })
    expect(row('grade')?.verdict).toBe('not-comparable')
    expect(row('loadedDownload')?.verdict).toBe('not-comparable')
    expect(row('data')?.verdict).toBeNull()
    expect(row('duration')?.verdict).toBeNull()
    expect(row('loss')).toMatchObject({ a: '0.0 %', verdict: null })
  })

  it('warns when preset, protocol or label differ, naming each', () => {
    const b = resultFixture({ id: 'b', startedAt: '2026-10-02T07:05:00.000Z', label: 'VPN · office', client: { ...older.client, protocol: 'HTTP/1.1' }, settings: { ...older.settings, preset: 'quick' } })
    expect(differences(older, b)).toEqual(['preset', 'protocol', 'label'])
    const comparison = compare(older, b, 'bits', 'en', t)
    expect(comparison.warning).toBe('different label (No label vs VPN · office); different preset (Standard vs Quick); different protocol (HTTP/2 vs HTTP/1.1)')
    expect(comparison.parameters.find((row) => row.key === 'protocol')?.differs).toBe('apart')
    expect(comparison.parameters.find((row) => row.key === 'browser')?.differs).toBeNull()
    expect(compare(older, newer, 'bits', 'en', t).warning).toBeNull()
  })

  it('copies as text with the same rows', () => {
    const text = comparisonText(compare(older, newer, 'bits', 'en', t), { a: 'A side', b: 'B side' }, t)
    expect(text.split('\n').slice(0, 3)).toEqual(['Compare results', 'A: A side', 'B: B side'])
    expect(text).toContain('Download: 612 Mbit/s → 612 Mbit/s (±0.0 %, same)')
    expect(text).toContain('Bufferbloat grade: — → — (not comparable)')
    expect(text).toContain('Data used: ')
  })
})
