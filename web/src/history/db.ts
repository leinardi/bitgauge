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

import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import type { Result } from '@/engine/messages'

// The history's database (frontend.md section 5): `bitgauge`, IndexedDB version 1, one object store
// `results` keyed by the result's `id`, with the indexes `startedAt` and `label`. The IndexedDB
// version changes only with the stores or indexes; a record's own version is its `schemaVersion`
// (history/migrate.ts).

export const DB_NAME = 'bitgauge'
export const DB_VERSION = 1

export interface BitGaugeDB extends DBSchema {
  results: {
    key: string
    value: Result
    indexes: { startedAt: string; label: string }
  }
}

export type HistoryDB = IDBPDatabase<BitGaugeDB>

/** Opens the database, creating its store and indexes on the first open. */
export function openHistoryDB(): Promise<HistoryDB> {
  return openDB<BitGaugeDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const results = db.createObjectStore('results', { keyPath: 'id' })
        results.createIndex('startedAt', 'startedAt')
        results.createIndex('label', 'label')
      }
    },
  })
}
