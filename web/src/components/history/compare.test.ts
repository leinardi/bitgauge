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

// Compare's wording (ui/screens.md section 3): A is the older result, rates
// within ±2 % of A's and latencies within 1 ms read same, grades compare by order, an absent value is
// not comparable, and the warning names a different preset, protocol or label.

import { describe, expect, it } from 'vitest'

import { bandChange, compare, comparisonText, differences, gradeChange, latencyChange, pair, rateChange } from '@/components/history/compare'
import type { Responsiveness, Result, Scores } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { continuousResult } from '@/test/continuous'
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

  it('compares quality bands by their order, great best', () => {
    expect(bandChange('good', 'good')).toBe('same')
    expect(bandChange('average', 'great')).toBe('better')
    expect(bandChange('poor', 'bad')).toBe('worse')
    expect(bandChange('good', undefined)).toBe('not-comparable')
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

  it("reads a fixed run's streams from what its directions ran, not the auto ceiling", () => {
    const quick = (id: string, startedAt: string): Result => {
      const base = resultFixture({ id, startedAt })
      return { ...base, settings: { ...base.settings, preset: 'quick', streams: { mode: 'fixed', max: 6 } }, download: base.download && { ...base.download, streams: 3 }, upload: base.upload && { ...base.upload, streams: 3 } }
    }
    const comparison = compare(quick('a', '2026-10-01T07:05:00.000Z'), quick('b', '2026-10-02T07:05:00.000Z'), 'bits', 'en', t)
    expect(comparison.parameters.find((row) => row.key === 'streams')).toMatchObject({ a: 'Fixed 3', b: 'Fixed 3' })
  })

  it('labels the protocol tokens, and counts two unreported ones as no difference', () => {
    const at = (id: string, startedAt: string, protocol: string): Result => {
      const base = resultFixture({ id, startedAt })
      return { ...base, client: { ...base.client, protocol } }
    }
    const comparison = compare(at('a', '2026-10-01T07:05:00.000Z', 'http/1.1'), at('b', '2026-10-02T07:05:00.000Z', 'h2'), 'bits', 'en', t)
    expect(comparison.parameters.find((row) => row.key === 'protocol')).toMatchObject({ a: 'HTTP/1.1', b: 'HTTP/2' })
    expect(comparison.warning).toBe('different protocol (HTTP/1.1 vs HTTP/2)')
    const unreported = compare(at('a', '2026-10-01T07:05:00.000Z', ''), at('b', '2026-10-02T07:05:00.000Z', 'unknown'), 'bits', 'en', t)
    expect(unreported.parameters.find((row) => row.key === 'protocol')).toMatchObject({ a: 'not reported', b: 'not reported', differs: null })
    expect(unreported.warning).toBeNull()
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

describe('the loaded-quality rows', () => {
  const measured = (rpm: number): Responsiveness => ({ state: 'measured', protocol: 'h2', samples: 40, rpm, tm95Ms: 60000 / rpm, trimmed: 2, totalMedianMs: 60 })
  const scores = (gaming: Scores['gaming']): Scores => ({ basis: 'download+upload', packetLoss: 'not-measured', streaming: { points: 80, band: 'good' }, gaming, rtc: { points: 50, band: 'average' } })
  function withLoadedQuality(id: string, startedAt: string, download: Responsiveness | undefined, upload: Responsiveness | undefined, score?: Scores): Result {
    const base = resultFixture({ id, startedAt, ...(score === undefined ? {} : { scores: score }) })
    return { ...base, download: { ...base.download!, responsiveness: download }, upload: { ...base.upload!, responsiveness: upload } }
  }
  const rows = (a: Result, b: Result) => compare(a, b, 'bits', 'en', t).metrics.filter((row) => row.key.startsWith('rpm-') || row.key.startsWith('quality-'))

  it('compares each direction’s RPM when both are measured, higher better and within 2 % the same, after the grade', () => {
    const a = withLoadedQuality('a', '2026-09-26T16:20:00.000Z', measured(980), measured(610), scores({ points: 60, band: 'good' }))
    const b = withLoadedQuality('b', '2026-10-02T07:05:00.000Z', measured(995), measured(700), scores({ points: 40, band: 'average' }))
    const keys = compare(a, b, 'bits', 'en', t).metrics.map((row) => row.key)
    expect(keys.slice(keys.indexOf('grade'), keys.indexOf('grade') + 6)).toEqual(['grade', 'rpm-download', 'rpm-upload', 'quality-streaming', 'quality-gaming', 'quality-rtc'])
    expect(rows(a, b)).toEqual([
      { key: 'rpm-download', name: 'HTTP loaded responsiveness — connection sharing not verifiable · download', a: '980 RPM · measured · HTTP/2', b: '995 RPM · measured · HTTP/2', verdict: 'same', change: '+1.5\u00a0%' },
      { key: 'rpm-upload', name: 'HTTP loaded responsiveness — connection sharing not verifiable · upload', a: '610 RPM · measured · HTTP/2', b: '700 RPM · measured · HTTP/2', verdict: 'better', change: '+14.8\u00a0%' },
      { key: 'quality-streaming', name: 'Quality · Streaming', a: 'Good', b: 'Good', verdict: 'same' },
      { key: 'quality-gaming', name: 'Quality · Gaming', a: 'Good', b: 'Average', verdict: 'worse' },
      { key: 'quality-rtc', name: 'Quality · Video calls', a: 'Average', b: 'Average', verdict: 'same' },
    ])
  })

  it('shows both states and reads not comparable unless both are measured, and an experience scored on one side', () => {
    const a = withLoadedQuality('a', '2026-09-26T16:20:00.000Z', measured(980), { state: 'uncertain', protocol: 'h2', samples: 20, rpm: 610, tm95Ms: 98, trimmed: 1, totalMedianMs: 100 }, scores({ points: 60, band: 'good' }))
    const b = withLoadedQuality('b', '2026-10-02T07:05:00.000Z', { state: 'unavailable_h1', protocol: 'http/1.1', samples: 0 }, measured(640), scores({ missing: ['loaded-latency'] }))
    const [download, upload, , gaming] = rows(a, b)
    expect(download).toMatchObject({ a: '980 RPM · measured · HTTP/2', b: 'needs HTTP/2 or HTTP/3 at the reverse proxy · HTTP/1.1', verdict: 'not-comparable' })
    expect(download?.change).toBeUndefined()
    expect(upload).toMatchObject({ a: '610 RPM · uncertain · HTTP/2', verdict: 'not-comparable' })
    expect(gaming).toMatchObject({ a: 'Good', b: 'not scored', verdict: 'not-comparable' })
  })

  it('has no such rows between two results without them, and — on the side that lacks them', () => {
    const plain = (id: string, startedAt: string) => resultFixture({ id, startedAt })
    expect(rows(plain('a', '2026-09-26T16:20:00.000Z'), plain('b', '2026-10-02T07:05:00.000Z'))).toEqual([])
    const both = rows(plain('a', '2026-09-26T16:20:00.000Z'), withLoadedQuality('b', '2026-10-02T07:05:00.000Z', measured(900), undefined, scores({ points: 60, band: 'good' })))
    expect(both.map((row) => [row.key, row.a, row.verdict])).toEqual([
      ['rpm-download', '—', 'not-comparable'],
      ['quality-streaming', 'not scored', 'not-comparable'],
      ['quality-gaming', 'not scored', 'not-comparable'],
      ['quality-rtc', 'not scored', 'not-comparable'],
    ])
  })
})

describe('a Continuous result', () => {
  it('names its preset Continuous, and its direction by its headline, the one it did not run not comparable', () => {
    const older = resultFixture({ id: 'a', startedAt: '2026-09-26T16:20:00.000Z' })
    const continuous = { ...continuousResult({ endMs: 7_200_000, bucketMs: 60_000 }), startedAt: '2026-10-02T07:05:00.000Z' }
    const comparison = compare(older, continuous, 'bits', 'en', t)
    expect(comparison.warning).toContain('different preset (Standard vs Continuous)')
    expect(comparison.parameters.find((row) => row.key === 'preset')).toMatchObject({ a: 'Standard', b: 'Continuous' })
    const download = comparison.metrics.find((row) => row.key === 'download')
    expect([download?.b.replace(/\u00a0/gu, ' '), download?.verdict]).toEqual(['921 Mbit/s', 'better'])
    expect(comparison.metrics.find((row) => row.key === 'upload')?.verdict).toBe('not-comparable')
  })
})
