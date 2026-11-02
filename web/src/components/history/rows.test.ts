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

// A History row (ui/screens.md section 3): a Continuous result by its headline, the run-wide
// average of the direction it ran, the other direction without a number; each speed with its
// qualifiers, as the share words them.

import { describe, expect, it } from 'vitest'

import { rowView } from '@/components/history/rows'
import type { Wording } from '@/components/test/wording'
import { createAppI18n } from '@/i18n'
import { continuousResult } from '@/test/continuous'
import { resultFixture } from '@/test/fixtures'

const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }

describe('a History row', () => {
  it('shows a Continuous result by the headline of the direction it ran', () => {
    const download = rowView(continuousResult({ endMs: 7_200_000, bucketMs: 60_000 }), 'bits', wording)
    expect(download.download.value).toEqual({ number: '921', unit: 'Mbit/s' })
    expect(download.upload).toEqual({ value: null, qualifiers: [] })
    expect(download.grade).toBe('A')
    const upload = rowView(continuousResult({ direction: 'upload', endMs: 7_200_000, bucketMs: 60_000 }), 'bits', wording)
    expect([upload.download.value, upload.upload.value]).toEqual([null, { number: '921', unit: 'Mbit/s' }])
  })

  it.each([
    ['h2', 'HTTP/2'],
    ['http/1.1', 'HTTP/1.1'],
    ['unknown', ''],
  ])('labels the protocol token %s as the Test screen does', (protocol, label) => {
    const base = resultFixture()
    expect(rowView({ ...base, client: { ...base.client, protocol } }, 'bits', wording).protocol).toBe(label)
  })

  it('words confidence only on a direction with a number', () => {
    const base = resultFixture()
    const low = { level: 'low' as const, reasons: ['unstable' as const] }
    const { bitsPerSecond: _rate, ...bare } = base.upload!
    const partial = { ...base, status: 'partial' as const, download: base.download && { ...base.download, confidence: { level: 'normal' as const, reasons: [] } }, upload: { ...bare, status: 'insufficient-data' as const, confidence: low } }
    const row = rowView(partial, 'bits', wording)
    expect([row.download.qualifiers, row.upload.qualifiers]).toEqual([[], ['insufficient data']])
    expect(row.upload.value).toBeNull()
    expect(rowView({ ...partial, upload: { ...base.upload!, confidence: low } }, 'bits', wording).upload.qualifiers).toEqual(['low confidence: unstable'])
  })

  it('captions a stopped, CPU-bound direction and an error with their qualifiers', () => {
    const base = resultFixture()
    const { bitsPerSecond: _rate, ...bare } = base.upload!
    const row = rowView(
      { ...base, status: 'error', download: { ...base.download!, status: 'partial', confidence: { level: 'cpu-bound', reasons: [] } }, upload: { ...bare, status: 'error' } },
      'bits',
      wording,
    )
    expect(row.download.qualifiers).toEqual(['partial', "limited by this device's CPU"])
    expect(row.upload).toEqual({ value: null, qualifiers: ['error'] })
  })

  it('captions both speeds with a +5 % overhead compensation', () => {
    const base = resultFixture()
    const row = rowView({ ...base, settings: { ...base.settings, overheadCompensationPercent: 5 } }, 'bits', wording)
    const plain = (texts: string[]) => texts.map((text) => text.replace(/[\u00a0\u202f]/gu, ' '))
    expect([plain(row.download.qualifiers), plain(row.upload.qualifiers)]).toEqual([['+5.0 % overhead compensation'], ['+5.0 % overhead compensation']])
  })
})
