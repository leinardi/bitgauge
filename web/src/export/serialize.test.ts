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

// The Download JSON export: the JSON export format with one result (frontend.md section 5), named
// after the result's start in local time, with an ISO 8601 export time, and never made from a
// result that fails validation.

import { describe, expect, it } from 'vitest'

import type { Result } from '@/engine/messages'
import { exportFilename, serializeResult } from '@/export/serialize'
import { resultFixture } from '@/test/fixtures'

describe('serializeResult', () => {
  it('writes the history format with the one result and the export time', () => {
    const result = resultFixture()
    const file = serializeResult(result, new Date('2026-10-08T12:30:00.000Z'))
    expect(JSON.parse(file?.json ?? '')).toEqual({ format: 'bitgauge.history', formatVersion: 1, exportedAt: '2026-10-08T12:30:00.000Z', results: [result] })
  })

  it('keeps numbers plain and times in ISO 8601, whatever the locale', () => {
    const json = serializeResult(resultFixture(), new Date('2026-10-08T12:30:00.000Z'))?.json ?? ''
    expect(json).toContain('"bitsPerSecond": 612000000')
    expect(json).toContain('"startedAt": "2026-10-08T12:02:11.000Z"')
  })

  it('never serialises a result that fails validation', () => {
    const broken = { ...resultFixture(), dataUsedBytes: -1 }
    expect(serializeResult(broken, new Date())).toBeNull()
    const { schema: _schema, ...unschemed } = resultFixture()
    expect(serializeResult(unschemed as Result, new Date())).toBeNull()
  })
})

describe('exportFilename', () => {
  it('names the file after the start in local time, bitgauge-<YYYY-MM-DD>-<HHMM>.json', () => {
    expect(exportFilename(new Date(2026, 9, 8, 14, 2, 11))).toBe('bitgauge-2026-10-08-1402.json')
    expect(exportFilename(new Date(2026, 0, 5, 7, 9))).toBe('bitgauge-2026-01-05-0709.json')
  })

  it('takes the start of the result, not the export time', () => {
    const start = new Date(2026, 9, 8, 23, 59, 30)
    const file = serializeResult(resultFixture({ startedAt: start.toISOString() }), new Date(2026, 9, 9, 0, 5))
    expect(file?.filename).toBe('bitgauge-2026-10-08-2359.json')
  })
})
