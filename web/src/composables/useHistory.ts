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

import { readonly, type Ref, shallowReadonly, shallowRef } from 'vue'

import type { Result } from '@/engine/messages'
import { openIfAvailable, storageExhausted } from '@/history/availability'
import type { HistoryDB } from '@/history/db'
import { type CheckOptions, checkImport, type ImportSummary, newRecords, readImport, type RefusedFile } from '@/history/import'
import { createHistoryStore, type HistoryStore, type ResultEdit } from '@/history/store'

// The results stored in this browser (frontend.md sections 4 and 5), shared by every screen: the
// list newest first, kept in step with each change. The database opens once per page; where it
// cannot, or a write finds the quota spent, history is unavailable for the session
// (edge-cases.md section 7).

export type HistoryStatus = 'loading' | 'available' | 'unavailable'

/** An import's summary, or why the file was refused, `unavailable` when there is no history to import into. */
export type ImportOutcome = { ok: false; refused: RefusedFile | 'unavailable' | 'cancelled' } | ({ ok: true } & ImportSummary)

export interface History {
  status: Readonly<Ref<HistoryStatus>>
  /** The stored results, newest first. */
  results: Readonly<Ref<readonly Result[]>>
  /** Reads the list again. */
  refresh(): Promise<void>
  /** Saves a result; false when history is unavailable or the write failed, never a rejection. */
  save(result: Result): Promise<boolean>
  edit(id: string, edit: ResultEdit): Promise<Result | undefined>
  /** Removes results at once; the removed ones, for the undo. */
  remove(ids: readonly string[]): Promise<Result[]>
  restore(results: readonly Result[]): Promise<void>
  clear(): Promise<void>
  /** Imports a JSON export's text, with its summary or the reason the file was refused. */
  importText(text: string, options?: CheckOptions): Promise<ImportOutcome>
}

export function createHistory(open: () => Promise<HistoryDB | null> = openIfAvailable, persist?: (() => Promise<boolean>) | null): History {
  const status = shallowRef<HistoryStatus>('loading')
  const results = shallowRef<readonly Result[]>([])
  const ready: Promise<HistoryStore | null> = open().then((db) => (db === null ? null : persist === undefined ? createHistoryStore(db) : createHistoryStore(db, persist)))

  async function store(): Promise<HistoryStore | null> {
    return status.value === 'unavailable' ? null : ready
  }

  async function refresh(): Promise<void> {
    const opened = await store()
    if (opened === null) {
      status.value = 'unavailable'
      return
    }
    results.value = await opened.list()
    status.value = 'available'
  }

  /** Runs a write, then reads the list again; a spent quota ends history for the session. */
  async function write<T>(action: (opened: HistoryStore) => Promise<T>, fallback: T): Promise<T> {
    const opened = await store()
    if (opened === null) {
      status.value = 'unavailable'
      return fallback
    }
    try {
      const value = await action(opened)
      await refresh()
      return value
    } catch (error) {
      if (storageExhausted(error)) {
        status.value = 'unavailable'
        return fallback
      }
      throw error
    }
  }

  void refresh()

  return {
    status: readonly(status),
    // Shallow, so each result is the stored object itself, which a later write can clone.
    results: shallowReadonly(results),
    refresh,
    async save(result) {
      try {
        return await write(async (opened) => {
          await opened.save(result)
          return true
        }, false)
      } catch {
        // Any other failed write (storage cleared under the page, a value it cannot store): not saved.
        return false
      }
    },
    edit: (id, edit) => write((opened) => opened.edit(id, edit), undefined),
    remove: (ids) => write((opened) => opened.remove(ids), []),
    restore: (removed) => write((opened) => opened.restore(removed), undefined),
    clear: () => write((opened) => opened.clear(), undefined),
    async importText(text, options = {}) {
      const file = readImport(text)
      if (!file.ok) {
        return file
      }
      // Cancel stops the check; nothing is written until every record is checked.
      const checked = await checkImport(file.records, options)
      if (checked === null) {
        return { ok: false, refused: 'cancelled' }
      }
      const refused: ImportOutcome = { ok: false, refused: 'unavailable' }
      return write<ImportOutcome>(async (opened) => {
        const { added, skipped } = newRecords(checked.results, await opened.ids())
        await opened.restore(added)
        return { ok: true, added: added.length, skipped, rejected: checked.rejected }
      }, refused)
    },
  }
}

/**
 * The demo build's history (frontend.md section 9): unavailable, or the browser's database with
 * its contents replaced by the demo panel's History variant, or left as they are, and the
 * Continuous result the panel's Result detail opens added to them.
 */
async function openDemo(): Promise<HistoryDB | null> {
  const { demoHistory } = await import('@/demo/control')
  const seed = await demoHistory()
  if (seed === 'unavailable') {
    return null
  }
  const db = await openIfAvailable()
  if (db !== null && (seed.replace || seed.results.length > 0)) {
    const transaction = db.transaction('results', 'readwrite')
    if (seed.replace) {
      await transaction.store.clear()
    }
    await Promise.all(seed.results.map((result) => transaction.store.put(result)))
    await transaction.done
  }
  return db
}

let shared: History | null = null

/** The application's history, opened on first use. */
export function useHistory(): History {
  // A demo build answers from the demo panel's choice; a production build drops the branch as dead code.
  shared ??= createHistory(import.meta.env.VITE_DEMO ? openDemo : openIfAvailable)
  return shared
}
