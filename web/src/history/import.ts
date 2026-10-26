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

import type { Result } from '@/engine/messages'
import { InvalidRecord, migrate, UnsupportedSchema } from '@/history/migrate'
import { labelValue, MAX_LABEL } from '@/lib/urlValues'

// The JSON import (frontend.md section 5). The file is refused as a whole when it is larger than
// 10 MB (10 000 000 bytes, decimal), is not JSON, or is not the `bitgauge.history` format, version
// 1. Each record is then checked on its own: one of a later result version, one the result
// validator rejects, or one whose label is over 64 characters (the Result label's limit), is
// rejected by its position in `results` with the reason; one whose `id` is already stored, or came
// earlier in the same file, is skipped. The label's limit is the import's alone: stored records and
// exports are read as the validator reads them.

export const MAX_IMPORT_BYTES = 10_000_000

export type RefusedFile = 'too-large' | 'not-json' | 'not-history'

export interface RejectedRecord {
  /** The record's position in `results`, from 0. */
  index: number
  reason: 'newer-schema' | 'invalid'
  /** The first problem the validator names, or the record's version. */
  detail: string
}

export interface ImportSummary {
  added: number
  skipped: number
  rejected: RejectedRecord[]
}

/** The import file `text`: refused as a whole, or its records still to check. */
export function readImport(text: string, maxBytes = MAX_IMPORT_BYTES): { ok: false; refused: RefusedFile } | { ok: true; records: unknown[] } {
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { ok: false, refused: 'too-large' }
  }
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    return { ok: false, refused: 'not-json' }
  }
  const { format, formatVersion, results } = (typeof file === 'object' && file !== null ? file : {}) as Record<string, unknown>
  if (format !== 'bitgauge.history' || formatVersion !== 1 || !Array.isArray(results)) {
    return { ok: false, refused: 'not-history' }
  }
  return { ok: true, records: results }
}

/** One record at its position in `results`: the result it migrates to, or why it is rejected. */
function checkRecord(record: unknown, index: number): { result: Result } | { rejected: RejectedRecord } {
  try {
    const result = migrate(record)
    if (labelValue(result.label) === undefined) {
      return { rejected: { index, reason: 'invalid', detail: `result.label: more than ${MAX_LABEL} characters` } }
    }
    return { result }
  } catch (error) {
    if (error instanceof UnsupportedSchema) {
      return { rejected: { index, reason: 'newer-schema', detail: String(error.schemaVersion) } }
    }
    if (error instanceof InvalidRecord) {
      return { rejected: { index, reason: 'invalid', detail: error.message } }
    }
    throw error
  }
}

/** A turn of the event loop, so the page paints and handles input between two records. */
function nextTurn(): Promise<void> {
  const { scheduler } = globalThis as { scheduler?: { yield?: () => Promise<void> } }
  if (scheduler?.yield !== undefined) {
    return scheduler.yield()
  }
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })
}

export interface CheckOptions {
  /** After each record: how many are checked, of how many. */
  onProgress?: (checked: number, total: number) => void
  /** Cancel: the check stops at the next record, and nothing comes of it. */
  signal?: AbortSignal
}

/**
 * The records of a read file, checked one at a time with a turn of the event loop after each, so a
 * long file shows its progress and can be cancelled (ui/screens.md section 3); null once cancelled.
 */
export async function checkImport(records: readonly unknown[], { onProgress, signal }: CheckOptions = {}): Promise<{ results: Result[]; rejected: RejectedRecord[] } | null> {
  const results: Result[] = []
  const rejected: RejectedRecord[] = []
  onProgress?.(0, records.length)
  for (const [index, record] of records.entries()) {
    if (signal?.aborted === true) {
      return null
    }
    const checked = checkRecord(record, index)
    if ('result' in checked) {
      results.push(checked.result)
    } else {
      rejected.push(checked.rejected)
    }
    onProgress?.(index + 1, records.length)
    await nextTurn()
  }
  return signal?.aborted === true ? null : { results, rejected }
}

/** The records to add: those whose `id` is neither stored nor earlier in the file; and the count skipped. */
export function newRecords(results: readonly Result[], stored: ReadonlySet<string>): { added: Result[]; skipped: number } {
  const seen = new Set(stored)
  const added = results.filter((result) => {
    const fresh = !seen.has(result.id)
    seen.add(result.id)
    return fresh
  })
  return { added, skipped: results.length - added.length }
}
