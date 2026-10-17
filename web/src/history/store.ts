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
import type { HistoryDB } from '@/history/db'
import { migrate } from '@/history/migrate'

// The stored results (frontend.md section 5): saved as they are, read newest first and migrated to
// the current result version on the way out, edited and written back in that version, removed at
// once and put back by an undo, cleared without one. There is no retention limit. The first save
// asks the browser to keep the storage (navigator.storage.persist) where it can.

/** What a result's edit changes: its label and its note. */
export interface ResultEdit {
  label?: string
  note?: string
}

export interface HistoryStore {
  save(result: Result): Promise<void>
  /** The result, migrated; undefined when not stored or no longer readable. */
  get(id: string): Promise<Result | undefined>
  /** Every readable result, newest first by `startedAt`. */
  list(): Promise<Result[]>
  /** Edits a stored result and writes it back; the edited result, or undefined when not stored. */
  edit(id: string, edit: ResultEdit): Promise<Result | undefined>
  /** Removes the results with these ids; the removed ones, for an undo. */
  remove(ids: readonly string[]): Promise<Result[]>
  /** Puts removed results back, as an undo does. */
  restore(results: readonly Result[]): Promise<void>
  /** Removes every result. */
  clear(): Promise<void>
  count(): Promise<number>
  /** The ids already stored, for an import's duplicates. */
  ids(): Promise<Set<string>>
}

function readable(record: unknown): Result | undefined {
  try {
    return migrate(record)
  } catch {
    // A record this version cannot read stays stored, out of the list.
    return undefined
  }
}

/** The store over an open database; `persist` is the browser's storage persistence request. */
export function createHistoryStore(db: HistoryDB, persist: (() => Promise<boolean>) | null = defaultPersist()): HistoryStore {
  let asked = false

  async function keep(): Promise<void> {
    if (asked || persist === null) {
      return
    }
    asked = true
    try {
      await persist()
    } catch {
      // A refused request leaves the storage best-effort; the result is saved all the same.
    }
  }

  return {
    async save(result) {
      await db.put('results', result)
      await keep()
    },
    async get(id) {
      return readable(await db.get('results', id))
    },
    async list() {
      const results: Result[] = []
      let cursor = await db.transaction('results').store.index('startedAt').openCursor(null, 'prev')
      while (cursor !== null) {
        const result = readable(cursor.value)
        if (result !== undefined) {
          results.push(result)
        }
        cursor = await cursor.continue()
      }
      return results
    },
    async edit(id, edit) {
      const transaction = db.transaction('results', 'readwrite')
      const stored = readable(await transaction.store.get(id))
      if (stored === undefined) {
        await transaction.done
        return undefined
      }
      const edited: Result = { ...stored, ...(edit.label === undefined ? {} : { label: edit.label }), ...(edit.note === undefined ? {} : { note: edit.note }) }
      await transaction.store.put(edited)
      await transaction.done
      return edited
    },
    async remove(ids) {
      const transaction = db.transaction('results', 'readwrite')
      const removed: Result[] = []
      for (const id of ids) {
        const stored = await transaction.store.get(id)
        if (stored !== undefined) {
          removed.push(stored)
          await transaction.store.delete(id)
        }
      }
      await transaction.done
      return removed
    },
    async restore(results) {
      const transaction = db.transaction('results', 'readwrite')
      await Promise.all([...results.map((result) => transaction.store.put(result)), transaction.done])
    },
    async clear() {
      await db.clear('results')
    },
    count() {
      return db.count('results')
    },
    async ids() {
      return new Set(await db.getAllKeys('results'))
    },
  }
}

function defaultPersist(): (() => Promise<boolean>) | null {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  return storage !== undefined && typeof storage.persist === 'function' ? () => storage.persist() : null
}
