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
import { historyCsv, historyExport } from '@/history/export'
import { saveFile } from '@/lib/saveFile'

// The History exports as files the browser saves (ui/screens.md section 3): JSON, refused when a
// stored result fails validation, or the CSV summary.

/** Saves the JSON export of `results`; false, and nothing saved, when one fails validation. */
export function saveJson(results: readonly Result[], now = new Date()): boolean {
  const file = historyExport(results, now)
  if (file === null) {
    return false
  }
  saveFile(file.filename, file.json, 'application/json')
  return true
}

export function saveCsv(results: readonly Result[], now = new Date()): void {
  const file = historyCsv(results, now)
  saveFile(file.filename, file.csv, 'text/csv')
}
