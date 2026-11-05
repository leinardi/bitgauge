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

// A history to work on without running tests: the demo's eight results (the kit's History rows),
// imported through History's own Import JSON as a user would, into the empty history of the
// test's fresh browser context.

import type { Page } from '@playwright/test'

import { demoHistoryResults } from '@/demo/history'
import type { Result } from '@/engine/messages'

import { expect } from './test'

/** The demo's results, newest first: "VPN via 5G" is the newest. */
export const DEMO_RESULTS: readonly Result[] = demoHistoryResults('populated')

/** A BitGauge history export of `results`. */
export function historyExport(results: readonly unknown[]): string {
  return JSON.stringify({ format: 'bitgauge.history', formatVersion: 1, exportedAt: '2026-10-08T12:00:00.000Z', results })
}

/** Opens History at `path` and imports `results` into it, then waits for the list. */
export async function importHistory(page: Page, results: readonly unknown[] = DEMO_RESULTS, path = '/history'): Promise<void> {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'No results yet' })).toBeVisible()
  await page.getByTestId('import-input').setInputFiles({ name: 'bitgauge-history.json', mimeType: 'application/json', buffer: Buffer.from(historyExport(results)) })
  await expect(page.getByTestId('history-count')).toContainText(`${results.length} of ${results.length} matching`)
}

/** The notes the page's history holds, read from IndexedDB as the page stored them. */
export async function storedNotes(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('bitgauge')
        request.onerror = () => reject(request.error ?? new Error('IndexedDB did not open'))
        request.onsuccess = () => {
          const db = request.result
          const all = db.transaction('results').objectStore('results').getAll()
          all.onerror = () => reject(all.error ?? new Error('IndexedDB did not read'))
          all.onsuccess = () => {
            db.close()
            resolve((all.result as { note?: string }[]).flatMap((result) => (result.note === undefined ? [] : [result.note])))
          }
        }
      }),
  )
}
