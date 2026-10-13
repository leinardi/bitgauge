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

import { type Result, validateResult } from '@/engine/messages'

// The Download JSON export of the Test screen (ui/screens.md section 1): the one result in the JSON
// export format of frontend.md section 5, with `results` holding one entry so it imports like a
// History export. It is locale-independent: ISO 8601 times and plain numbers (ui/i18n-a11y.md
// section 1.3). A result that fails validation is never serialised.

/** The export file: its name and its content. */
export interface ExportFile {
  filename: string
  json: string
}

const pad = (value: number) => String(value).padStart(2, '0')

/** `bitgauge-<YYYY-MM-DD>-<HHMM>.json`, from the result's start in the browser's local time. */
export function exportFilename(startedAt: Date): string {
  const date = `${startedAt.getFullYear()}-${pad(startedAt.getMonth() + 1)}-${pad(startedAt.getDate())}`
  return `bitgauge-${date}-${pad(startedAt.getHours())}${pad(startedAt.getMinutes())}.json`
}

/** The export of one result at `now`, or null when the result fails validation. */
export function serializeResult(result: Result, now: Date): ExportFile | null {
  const startedAt = new Date(result.startedAt)
  if (validateResult(result).length > 0 || Number.isNaN(startedAt.getTime())) {
    return null
  }
  const file = { format: 'bitgauge.history', formatVersion: 1, exportedAt: now.toISOString(), results: [result] }
  return { filename: exportFilename(startedAt), json: JSON.stringify(file, null, 2) }
}
