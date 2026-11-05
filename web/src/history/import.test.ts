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
import { continuousResult } from '@/test/continuous'

import { checkImport, MAX_IMPORT_BYTES, newRecords, readImport } from '@/history/import'
import { resultFixture, uuidFor } from '@/test/fixtures'
import { demoHistoryResults } from '@/demo/history'
import { type Confidence, type Notice, validateResult } from '@/engine/messages'

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
  it('rejects contradictory confidence levels, reasons and notices', async () => {
    const variants: { confidence: Confidence; notices: Notice[] }[] = [
      { confidence: { level: 'normal', reasons: ['unstable'] }, notices: [] },
      { confidence: { level: 'low', reasons: [] }, notices: [] },
      { confidence: { level: 'low', reasons: ['unstable'] }, notices: [] },
      { confidence: { level: 'low', reasons: ['unstable'] }, notices: [{ code: 'low-confidence', direction: 'download', reasons: ['ramp-unsettled'] }] },
      { confidence: { level: 'cpu-bound', reasons: ['unstable'] }, notices: [{ code: 'low-confidence', direction: 'download', reasons: ['unstable'] }] },
      { confidence: { level: 'normal', reasons: [] }, notices: [{ code: 'low-confidence', direction: 'download', reasons: ['unstable'] }] },
      { confidence: { level: 'low', reasons: ['unstable', 'unstable'] }, notices: [{ code: 'low-confidence', direction: 'download', reasons: ['unstable', 'unstable'] }] },
      { confidence: { level: 'low', reasons: ['unstable', 'ramp-unsettled'] }, notices: [{ code: 'low-confidence', direction: 'download', reasons: ['unstable', 'unstable'] }] },
    ]
    for (const variant of variants) {
      const bad = resultFixture()
      bad.download!.confidence = structuredClone(variant.confidence)
      bad.notices = structuredClone(variant.notices)
      const checked = await checkImport([bad])
      expect(checked?.results).toEqual([])
      expect(checked?.rejected[0]?.detail).toContain('confidence')
    }
  })

  it('accepts normal, matched low and cpu-bound confidence without losing qualifiers', async () => {
    for (const level of ['normal', 'low', 'cpu-bound'] as const) {
      const valid = resultFixture()
      valid.download!.confidence = { level, reasons: level === 'normal' ? [] : ['unstable'] }
      valid.notices = level === 'low' ? [{ code: 'low-confidence', direction: 'download', reasons: ['unstable'] }] : []
      expect((await checkImport([valid]))?.rejected).toEqual([])
    }
    const cpu = resultFixture()
    cpu.download!.confidence = { level: 'cpu-bound', reasons: [] }
    expect((await checkImport([cpu]))?.rejected).toEqual([])
  })

  it('requires final low-confidence notices on partial and insufficient directions too', async () => {
    for (const status of ['partial', 'insufficient-data'] as const) {
      const valid = resultFixture({ status: 'partial' })
      valid.download!.status = status
      valid.download!.confidence = { level: 'low', reasons: ['unstable', 'ramp-unsettled'] }
      if (status === 'insufficient-data') {
        delete valid.download!.bitsPerSecond
        delete valid.download!.peakBitsPerSecond
        delete valid.download!.uncompensatedBitsPerSecond
      }
      expect((await checkImport([valid]))?.results).toEqual([])
      valid.notices = [{ code: 'low-confidence', direction: 'download', reasons: ['ramp-unsettled', 'unstable'] }]
      expect((await checkImport([valid]))?.rejected).toEqual([])
    }
    const absent = resultFixture({ download: undefined, notices: [{ code: 'low-confidence', direction: 'download', reasons: ['unstable'] }] })
    expect((await checkImport([absent]))?.results).toEqual([])
  })

  it('rejects every measurement-only field and nonzero confirmations on skipped directions', async () => {
    const base = resultFixture()
    const fields = {
      windowMs: 3000, plateau: 'cap', confidence: base.upload!.confidence,
      series: base.upload!.series, loadedLatency: { status: 'unavailable', reason: 'no-steady-window', samples: 0, skippedTicks: 0, lost: 0 },
      responsiveness: { state: 'measured', protocol: 'h2', samples: 20, rpm: 1200, tm95Ms: 50, trimmed: 1, totalMedianMs: 50 },
      confirmedRequests: 12,
    }
    for (const [field, value] of Object.entries(fields)) {
      const bad = resultFixture({ upload: { status: 'skipped', streams: 0, bytes: 0, events: [], confirmedRequests: 0, [field]: value } })
      expect((await checkImport([bad]))?.results, field).toEqual([])
    }
    const valid = resultFixture({ upload: { status: 'skipped', streams: 0, bytes: 0, events: [], confirmedRequests: 0 } })
    expect((await checkImport([valid]))?.rejected).toEqual([])
  })
  it('rejects series whose duration is not represented by its stored cells', async () => {
    const bad = resultFixture()
    bad.download!.series!.endMs = Number.MAX_SAFE_INTEGER
    expect((await checkImport([bad]))?.results).toEqual([])
  })

  it('accepts the effective Continuous direction even when phases lists only idle', async () => {
    const valid = continuousResult({ direction: 'upload', endMs: 60_000, bucketMs: 100 })
    valid.settings.phases = ['idle']
    // This display fixture hardcodes download-based scores; upload-only streaming lacks download.
    valid.scores!.streaming = { missing: ['download'] }
    expect((await checkImport([valid]))?.rejected).toEqual([])
  })

  it('rejects a loaded increase that contradicts the latency inputs', async () => {
    const bad = resultFixture()
    bad.download!.loadedLatency = { source: 'websocket', samples: 20, skippedTicks: 0, lost: 0, medianMs: 1000, p90Ms: 1000, increaseMs: 0, series: [] }
    bad.bufferbloat = { grade: 'A+', basis: 'download', increaseMs: 0 }
    expect((await checkImport([bad]))?.results).toEqual([])
  })

  it('keeps legitimate bounded-upload trailing edges and Continuous partial cells', async () => {
    const bounded = resultFixture()
    bounded.upload!.series!.endMs += 37
    const continuous = continuousResult({ endMs: 60_037, bucketMs: 1000 })
    expect((await checkImport([bounded, continuous]))?.rejected).toEqual([])
    bounded.upload!.series!.endMs += 100
    expect((await checkImport([bounded]))?.results).toEqual([])
  })

  it('rejects extra cells beyond the declared end and known time beyond a partial cell', async () => {
    const extra = resultFixture()
    extra.download!.series!.endMs = extra.download!.series!.firstCellMs + 100
    const known = continuousResult({ endMs: 60_037, bucketMs: 1000 })
    known.download!.series!.knownMs![known.download!.series!.values.length - 1] = 1000
    expect((await checkImport([extra, known]))?.results).toEqual([])
  })

  it('accepts floating-point endpoint subtraction on a Continuous upload timeline', async () => {
    const valid = continuousResult({ direction: 'upload', endMs: 9600, bucketMs: 100 })
    valid.scores!.streaming = { missing: ['download'] }
    Object.assign(valid.upload!.series!, { firstCellMs: 6500.1, warmupEndMs: 6500.1, endMs: 9600.100000000002 })
    expect((await checkImport([valid]))?.rejected).toEqual([])
  })
  it('accepts genuine demo history records under admission checks', async () => {
    const records = demoHistoryResults('populated')
    const checked = await checkImport(records)
    expect(checked?.rejected).toEqual([])
    expect(checked?.results).toHaveLength(records.length)
  })
  it('rejects hostile notices per record, preserving surrounding valid records (QA-120)', async () => {
    const a = resultFixture({ id: uuidFor('a') })
    const b = resultFixture({ notices: [{ code: 'hasOwnProperty' } as never] })
    const c = resultFixture({ id: uuidFor('c') })
    expect(await checkImport([a, b, c])).toEqual({ results: [a, c], rejected: [{ index: 1, reason: 'invalid', detail: 'result.notices[0].code: unknown' }] })
  })

  it('rejects contradictory numbers and phases (QA-121)', async () => {
    const bad = resultFixture()
    bad.download!.status = 'insufficient-data'
    const phases = resultFixture()
    phases.settings.phases = []
    const checked = await checkImport([bad, phases])
    expect(checked?.results).toEqual([])
    expect(checked?.rejected.map((entry) => entry.index)).toEqual([0, 1])
  })

  it('bounds imported metadata, notes and numbers (QA-123)', async () => {
    const longNote = resultFixture({ note: '🛰'.repeat(16_384) })
    expect((await checkImport([longNote]))?.results).toEqual([longNote])
    const metadata = resultFixture()
    metadata.client.browser.os = 'x'.repeat(129)
    const percent = resultFixture()
    percent.settings.overheadCompensationPercent = 9999
    const huge = resultFixture()
    huge.download!.bitsPerSecond = 1e300
    const checked = await checkImport([resultFixture({ note: 'x'.repeat(16_385) }), metadata, percent, huge])
    expect(checked?.results).toEqual([])
    expect(checked?.rejected).toHaveLength(4)
  })

  it('keeps old long notes structurally readable/exportable, but refuses their import (QA-123)', async () => {
    const old = resultFixture({ note: 'x'.repeat(16_385) })
    expect(validateResult(old)).toEqual([])
    expect((await checkImport([old]))?.rejected[0]?.detail).toBe('result.note: more than 16384 characters')
  })

  it('rejects impossible numeric and measurement relationships without repairing the record (QA-121)', async () => {
    const missing = resultFixture()
    delete missing.download!.confidence
    const failed = resultFixture()
    failed.upload!.status = 'error'
    const skipped = resultFixture()
    skipped.download!.status = 'skipped'
    const unsafe = resultFixture({ dataUsedBytes: Number.MAX_SAFE_INTEGER + 1 })
    const badLoss = resultFixture()
    badLoss.idle!.lossPercent = 1000
    const checked = await checkImport([missing, failed, skipped, unsafe, badLoss])
    expect(checked?.results).toHaveLength(0)
    expect(checked?.rejected).toHaveLength(5)
    expect(failed.upload!.status).toBe('error')
  })

  it('compares UUID identity without casing differences (QA-128)', () => {
    const lower = resultFixture()
    const upper = resultFixture({ id: lower.id.toUpperCase() })
    expect(newRecords([lower, upper], new Set())).toEqual({ added: [lower], skipped: 1 })
    expect(newRecords([lower], new Set([upper.id]))).toEqual({ added: [], skipped: 1 })
    expect(newRecords([upper], new Set([lower.id]))).toEqual({ added: [], skipped: 1 })
  })

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
    const good = resultFixture({ id: uuidFor('good') })
    const parsed = await parse(file([{ ...resultFixture(), schemaVersion: 2 }, good, { ...resultFixture(), id: 7 }, 'text']))
    expect(parsed).toEqual({
      ok: true,
      results: [good],
      rejected: [
        { index: 0, reason: 'newer-schema', detail: '2' },
        { index: 2, reason: 'invalid', detail: 'result.id: not a version 4 UUID' },
        { index: 3, reason: 'invalid', detail: 'result: not an object' },
      ],
    })
  })

  it('rejects a record whose label is over 64 characters, counted in characters', async () => {
    const longest = resultFixture({ id: uuidFor('longest'), label: '🛰'.repeat(64) })
    const parsed = await parse(file([longest, resultFixture({ id: uuidFor('long'), label: 'x'.repeat(65) })]))
    expect(parsed).toEqual({ ok: true, results: [longest], rejected: [{ index: 1, reason: 'invalid', detail: 'result.label: more than 64 characters' }] })
  })

  it('accepts a record without a note', async () => {
    const bare = resultFixture()
    expect('note' in bare).toBe(false)
    expect(await parse(file([bare]))).toEqual({ ok: true, results: [bare], rejected: [] })
  })

  it('counts the records as it checks them, and a cancel stops it with nothing to write', async () => {
    const records = [resultFixture({ id: uuidFor('a') }), resultFixture({ id: uuidFor('b') }), resultFixture({ id: uuidFor('c') })]
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
    const [a, b, c] = ['a', 'b', 'c'].map((name) => resultFixture({ id: uuidFor(name) }))
    expect(newRecords([a!, b!, b!, c!], new Set([uuidFor('c')]))).toEqual({ added: [a, b], skipped: 2 })
  })
})
