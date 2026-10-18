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
// record rejected by its position and reason, checked one at a time with its progress and
// cancellable (ui/screens.md section 3); duplicates skipped.

import { describe, expect, it } from 'vitest'

import { checkImport, MAX_IMPORT_BYTES, newRecords, readImport } from '@/history/import'
import { resultFixture } from '@/test/fixtures'

function file(results: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: 'bitgauge.history', formatVersion: 1, exportedAt: '2026-10-17T07:00:00.000Z', results, ...extra })
}

/** A file of exactly `bytes` bytes, padded with spaces after the JSON. */
function sized(bytes: number): string {
  const text = file([resultFixture()])
  return text + ' '.repeat(bytes - new TextEncoder().encode(text).length)
}

/** The file read, then its records checked. */
async function parse(text: string, maxBytes?: number) {
  const read = readImport(text, maxBytes)
  return read.ok ? { ok: true, ...(await checkImport(read.records)) } : read
}

describe('the import', () => {
  it('takes a file of 10 MB, decimal, and refuses one byte more', async () => {
    expect(MAX_IMPORT_BYTES).toBe(10_000_000)
    expect((await parse(sized(10_000_000))).ok).toBe(true)
    expect(await parse(sized(10_000_001))).toEqual({ ok: false, refused: 'too-large' })
  })

  it('counts the size in UTF-8 bytes', async () => {
    const text = file([resultFixture({ label: 'é' })])
    const bytes = new TextEncoder().encode(text).length
    expect(bytes).toBe(text.length + 1)
    expect((await parse(text, bytes)).ok).toBe(true)
    expect(await parse(text, bytes - 1)).toEqual({ ok: false, refused: 'too-large' })
  })

  it('refuses what is not JSON or not the history format', async () => {
    expect(await parse('id,startedAt\r\n')).toEqual({ ok: false, refused: 'not-json' })
    expect(await parse('[]')).toEqual({ ok: false, refused: 'not-history' })
    expect(await parse(file([], { format: 'other' }))).toEqual({ ok: false, refused: 'not-history' })
    expect(await parse(file([], { formatVersion: 2 }))).toEqual({ ok: false, refused: 'not-history' })
    expect(await parse(JSON.stringify({ format: 'bitgauge.history', formatVersion: 1, results: {} }))).toEqual({ ok: false, refused: 'not-history' })
  })

  it('rejects a record by its position and reason, keeping the others', async () => {
    const good = resultFixture({ id: 'good' })
    const parsed = await parse(file([{ ...resultFixture(), schemaVersion: 2 }, good, { ...resultFixture(), id: 7 }, 'text']))
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

  it('accepts a v0.1 record without a note', async () => {
    const v01 = resultFixture()
    expect('note' in v01).toBe(false)
    expect(await parse(file([v01]))).toEqual({ ok: true, results: [v01], rejected: [] })
  })

  it('counts the records as it checks them, and a cancel stops it with nothing to write', async () => {
    const records = [resultFixture({ id: 'a' }), resultFixture({ id: 'b' }), resultFixture({ id: 'c' })]
    const progress: string[] = []
    expect(await checkImport(records, { onProgress: (checked, total) => progress.push(`${checked}/${total}`) })).toEqual({ results: records, rejected: [] })
    expect(progress).toEqual(['0/3', '1/3', '2/3', '3/3'])
    const controller = new AbortController()
    const seen: number[] = []
    const cancelled = checkImport(records, {
      signal: controller.signal,
      onProgress: (checked) => {
        seen.push(checked)
        if (checked === 1) controller.abort()
      },
    })
    expect(await cancelled).toBeNull()
    expect(seen).toEqual([0, 1])
  })

  it('skips the records already stored or earlier in the file', () => {
    const [a, b, c] = ['a', 'b', 'c'].map((id) => resultFixture({ id }))
    expect(newRecords([a!, b!, b!, c!], new Set(['c']))).toEqual({ added: [a, b], skipped: 2 })
  })
})
