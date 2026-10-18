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

// The Result detail's test parameters (ui/screens.md section 2), in the rows of the kit's
// ResultDetail.jsx: the streams on one row, each direction's duration with its configured bounds,
// and the data cap with the data used.

import { describe, expect, it } from 'vitest'

import { parameterGroups } from '@/components/result/parameters'
import type { Result } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { resultFixture } from '@/test/fixtures'

const t = createAppI18n('', ['en']).global.t as unknown as Parameters<typeof parameterGroups>[2]['t']
const wording = { t, locale: 'en' }

const BOUNDS = { download: { minMs: 10_000, maxMs: 20_000 }, upload: { minMs: 15_000, maxMs: 25_000 } }

function rows(result: Result): Record<string, string> {
  return Object.fromEntries(parameterGroups(result, 'bits', wording).flatMap((group) => group.rows.map((row) => [row.label, row.value])))
}

function withStreams(download: number, upload: number, plateau: 'cap' | 'no-gain' = 'cap'): Result {
  const base = resultFixture()
  return { ...base, download: base.download && { ...base.download, streams: download, plateau }, upload: base.upload && { ...base.upload, streams: upload, plateau } }
}

describe('parameterGroups', () => {
  it('gives the streams one row: the mode, then the count and plateau shared by both directions', () => {
    expect(rows(withStreams(6, 6))['Streams']).toBe('Auto · 6 · plateau: cap')
  })

  it('names each direction on the streams row when their counts or plateaus differ', () => {
    expect(rows(withStreams(6, 4, 'no-gain'))['Streams']).toBe('Auto · download 6 · plateau: no-gain; upload 4 · plateau: no-gain')
  })

  it('gives each direction its duration with its configured bounds, and the data cap with the data used', () => {
    const base = resultFixture()
    const shown = rows({ ...base, settings: { ...base.settings, ...BOUNDS } })
    expect(shown['Download']).toBe('10.0\u00a0s · min 10 · max 20')
    expect(shown['Upload']).toBe('15.6\u00a0s · min 15 · max 25')
    expect(shown['Data cap']).toBe('Off · 1.3\u00a0GB used')
    expect(Object.keys(shown)).not.toContain('Duration')
    expect(Object.keys(shown)).not.toContain('Data used')
  })

  it('gives the duration alone for a result that records no bounds, as before v0.2', () => {
    expect(rows(resultFixture())['Download']).toBe('10.0\u00a0s')
  })
})
