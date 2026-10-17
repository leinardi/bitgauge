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

// The History exports (frontend.md section 5): the JSON export format with every result, named
// after the export moment, and the CSV beside it.

import { describe, expect, it } from 'vitest'

import { historyCsv, historyExport } from '@/history/export'
import { parseImport } from '@/history/import'
import { resultFixture } from '@/test/fixtures'

const NOW = new Date(2026, 9, 17, 9, 5)

describe('the History exports', () => {
  it('writes the JSON export format with every result, notes included, and reads back', () => {
    const results = [resultFixture({ id: 'a', note: 'kitchen' }), resultFixture({ id: 'b' })]
    const file = historyExport(results, NOW)
    expect(file?.filename).toBe('bitgauge-history-2026-10-17-0905.json')
    expect(JSON.parse(file?.json ?? '')).toEqual({ format: 'bitgauge.history', formatVersion: 1, exportedAt: NOW.toISOString(), results })
    expect(parseImport(file?.json ?? '')).toEqual({ ok: true, results, rejected: [] })
  })

  it('exports nothing when a result fails validation', () => {
    expect(historyExport([resultFixture({ status: 'great' as 'complete' })], NOW)).toBeNull()
  })

  it('names the CSV the same way', () => {
    const file = historyCsv([resultFixture()], NOW)
    expect(file.filename).toBe('bitgauge-history-2026-10-17-0905.csv')
    expect(file.csv.split('\r\n')).toHaveLength(3)
  })
})
