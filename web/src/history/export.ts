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
import { type ExportFile, serializeResults } from '@/export/serialize'
import { toCsv } from '@/history/csv'

// The History exports (frontend.md section 5): every result or the filtered ones, as the JSON
// export format the Download JSON uses, or as the CSV summary. Each file is named after the export
// moment in the browser's local time, `bitgauge-history-<YYYY-MM-DD>-<HHMM>`.

const pad = (value: number) => String(value).padStart(2, '0')

function filename(now: Date, extension: 'json' | 'csv'): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `bitgauge-history-${date}-${pad(now.getHours())}${pad(now.getMinutes())}.${extension}`
}

/** The JSON export of `results` at `now`; null when one fails validation. */
export function historyExport(results: readonly Result[], now: Date): ExportFile | null {
  const json = serializeResults(results, now)
  return json === null ? null : { filename: filename(now, 'json'), json }
}

/** The CSV export of `results` at `now`. */
export function historyCsv(results: readonly Result[], now: Date): { filename: string; csv: string } {
  return { filename: filename(now, 'csv'), csv: toCsv(results) }
}
