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

import { type HistoryDB, openHistoryDB } from '@/history/db'

// Whether this browser keeps a history (edge-cases.md section 7): some private modes have no
// IndexedDB, or one that refuses to open; storage can be blocked by policy, or its quota spent.
// Then history is unavailable for the session; tests run as usual.

/** The open database, or null where IndexedDB is missing or refuses to open. */
export async function openIfAvailable(open: () => Promise<HistoryDB> = openHistoryDB): Promise<HistoryDB | null> {
  if (typeof indexedDB === 'undefined') {
    return null
  }
  try {
    return await open()
  } catch {
    // Blocked, refused or broken: the session runs without history.
    return null
  }
}

/** Whether a failed write means the storage is gone for the session: its quota is spent. */
export function storageExhausted(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError'
}
