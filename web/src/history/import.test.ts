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

// The JSON import (frontend.md section 5): the whole file refused by size, JSON and format; each
// record rejected by its position and reason; duplicates skipped.

import { describe, expect, it } from 'vitest'

import { MAX_IMPORT_BYTES, newRecords, parseImport } from '@/history/import'
import { resultFixture } from '@/test/fixtures'

function file(results: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: 'bitgauge.history', formatVersion: 1, exportedAt: '2026-10-17T07:00:00.000Z', results, ...extra })
}

/** A file of exactly `bytes` bytes, padded with spaces after the JSON. */
function sized(bytes: number): string {
  const text = file([resultFixture()])
  return text + ' '.repeat(bytes - new TextEncoder().encode(text).length)
}

describe('the import', () => {
  it('takes a file of 10 MB, decimal, and refuses one byte more', () => {
    expect(MAX_IMPORT_BYTES).toBe(10_000_000)
    expect(parseImport(sized(10_000_000)).ok).toBe(true)
    expect(parseImport(sized(10_000_001))).toEqual({ ok: false, refused: 'too-large' })
  })

  it('counts the size in UTF-8 bytes', () => {
    const text = file([resultFixture({ label: 'é' })])
    const bytes = new TextEncoder().encode(text).length
    expect(bytes).toBe(text.length + 1)
    expect(parseImport(text, bytes).ok).toBe(true)
    expect(parseImport(text, bytes - 1)).toEqual({ ok: false, refused: 'too-large' })
  })

  it('refuses what is not JSON or not the history format', () => {
    expect(parseImport('id,startedAt\r\n')).toEqual({ ok: false, refused: 'not-json' })
    expect(parseImport('[]')).toEqual({ ok: false, refused: 'not-history' })
    expect(parseImport(file([], { format: 'other' }))).toEqual({ ok: false, refused: 'not-history' })
    expect(parseImport(file([], { formatVersion: 2 }))).toEqual({ ok: false, refused: 'not-history' })
    expect(parseImport(JSON.stringify({ format: 'bitgauge.history', formatVersion: 1, results: {} }))).toEqual({ ok: false, refused: 'not-history' })
  })

  it('rejects a record by its position and reason, keeping the others', () => {
    const good = resultFixture({ id: 'good' })
    const parsed = parseImport(file([{ ...resultFixture(), schemaVersion: 2 }, good, { ...resultFixture(), id: 7 }, 'text']))
    expect(parsed).toEqual({
      ok: true,
      results: [good],
      rejected: [
        { index: 0, reason: 'newer-schema', detail: '2' },
        { index: 2, reason: 'invalid', detail: 'result.id: not a string' },
        { index: 3, reason: 'invalid', detail: 'result: not an object' },
      ],
    })
  })

  it('accepts a v0.1 record without a note', () => {
    const v01 = resultFixture()
    expect('note' in v01).toBe(false)
    expect(parseImport(file([v01]))).toEqual({ ok: true, results: [v01], rejected: [] })
  })

  it('skips the records already stored or earlier in the file', () => {
    const [a, b, c] = ['a', 'b', 'c'].map((id) => resultFixture({ id }))
    expect(newRecords([a!, b!, b!, c!], new Set(['c']))).toEqual({ added: [a, b], skipped: 2 })
  })
})
