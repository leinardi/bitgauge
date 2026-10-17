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

// The JSON export format of frontend.md section 5: the Download JSON export of the Test screen
// (ui/screens.md section 1) holds the one result, so it imports like a History export, which holds
// many (history/export.ts). It is locale-independent: ISO 8601 times and plain numbers (ui/i18n-a11y.md
// section 1.3). A result that fails validation is never serialized.

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

/** The JSON export format holding `results`, exported at `now`; null when any result fails validation. */
export function serializeResults(results: readonly Result[], now: Date): string | null {
  if (results.some((result) => validateResult(result).length > 0)) {
    return null
  }
  return JSON.stringify({ format: 'bitgauge.history', formatVersion: 1, exportedAt: now.toISOString(), results }, null, 2)
}

/** The export of one result at `now`, or null when the result fails validation. */
export function serializeResult(result: Result, now: Date): ExportFile | null {
  const startedAt = new Date(result.startedAt)
  const json = Number.isNaN(startedAt.getTime()) ? null : serializeResults([result], now)
  return json === null ? null : { filename: exportFilename(startedAt), json }
}
