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

// The Result detail (ui/screens.md section 2) of a stored result, reached from History as flow 6
// step 4 reaches it: the header, the grade with the loaded latency, the charts with their tables
// and the parameters; the label edited in place and the note, both kept across a reload; Delete
// with its undo; Run again on the Test screen; and the not-found state. axe checks each state once
// its transitions have settled.

import type { Page } from '@playwright/test'

import { expectAccessible } from './fixtures/axe'
import { DEMO_RESULTS, importHistory, storedNotes } from './fixtures/history'
import { expect, test } from './fixtures/test'

/** The demo's results with the newest one run on the Quick preset with 12 pings. */
const QUICK = DEMO_RESULTS.map((result, index) => (index === 0 ? { ...result, settings: { ...result.settings, preset: 'quick' as const, pingCount: 12 } } : result))

test('fits a full context label on a phone without horizontal page scroll (QA-125)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const results = QUICK.map((result) => ({ ...result, client: { ...result.client, contextLabel: 'W'.repeat(64) } }))
  await importHistory(page, results)
  await page.getByTestId('history-card').first().locator('a[href*="/result/"]').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('VPN via 5G')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByText('W'.repeat(64), { exact: true }).first()).toBeVisible()
})

async function openNewest(page: Page): Promise<void> {
  await importHistory(page, QUICK)
  await page.getByTestId('history-row').first().locator('a[href*="/result/"]').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('VPN via 5G')
}

/** The stored record of `id`, as IndexedDB holds it. */
async function storedRecord(page: Page, id: string): Promise<Record<string, unknown> | undefined> {
  return page.evaluate(
    (key) =>
      new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const request = indexedDB.open('bitgauge')
        request.onerror = () => reject(request.error ?? new Error('IndexedDB did not open'))
        request.onsuccess = () => {
          const db = request.result
          const read = db.transaction('results').objectStore('results').get(key)
          read.onerror = () => reject(read.error ?? new Error('IndexedDB did not read'))
          read.onsuccess = () => {
            db.close()
            resolve(read.result as Record<string, unknown> | undefined)
          }
        }
      }),
    id,
  )
}

// A note save is a write the browser does not wait for on a reload: a reload in the middle of one
// keeps the note as it was or as typed, never a damaged record. No test here claims that nothing is
// lost (QA-110).
test.describe('a note and a reload', () => {
  const NEWEST = QUICK[0]

  test('a reload while the note’s write is held keeps the record whole, its note old or new', async ({ page }) => {
    // While the flag is set, every write to the results store holds its transaction open for 2 s,
    // so the reload lands in the middle of it.
    await page.addInitScript(() => {
      const put = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function hold(this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
        const request = put.apply(this, args)
        if ((window as Window & { holdPut?: boolean }).holdPut === true) {
          const until = performance.now() + 2000
          const spin = (): void => {
            if (performance.now() < until) {
              this.count().onsuccess = spin
            }
          }
          spin()
        }
        return request
      }
    })
    await openNewest(page)
    const before = await storedRecord(page, NEWEST?.id ?? '')
    await page.evaluate(() => {
      ;(window as Window & { holdPut?: boolean }).holdPut = true
    })
    await page.getByTestId('note-field').fill('Typed before the reload')
    // Past the note's pause: its write has started and is held.
    await page.waitForTimeout(600)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('VPN via 5G')
    const after = await storedRecord(page, NEWEST?.id ?? '')
    expect(['Typed before the reload', before?.note ?? '']).toContain(after?.note ?? '')
    const { note: _after, ...rest } = after ?? {}
    const { note: _before, ...kept } = before ?? {}
    expect(rest).toEqual(kept)
    await expect(page.getByTestId('note-field')).toHaveValue(String(after?.note ?? ''))
  })

  test('a reload after the note’s pause keeps the note', async ({ page }) => {
    await openNewest(page)
    await page.getByTestId('note-field').fill('Saved after the pause')
    await expect.poll(() => storedNotes(page)).toContain('Saved after the pause')
    await page.reload()
    await expect(page.getByTestId('note-field')).toHaveValue('Saved after the pause')
  })
})

test('shows a stored result and keeps its label and note across a reload', async ({ page }) => {
  await openNewest(page)
  await expect(page.getByTestId('load-grade')).toHaveText('D')
  await expect(page.getByTestId('load-card')).toContainText('High bufferbloat')
  await expect(page.getByTestId('phase-chart-download')).toBeVisible()
  await page.getByTestId('chart-card-download').getByRole('radio', { name: 'Table' }).click()
  await expect(page.getByTestId('chart-card-download').getByTestId('window-table')).toBeVisible()
  await expect(page.getByTestId('parameter-ip')).toContainText('100.101.4.17')
  await expectAccessible(page)

  await page.getByTestId('edit-label').click()
  const input = page.getByTestId('label-input')
  await input.fill('VPN via 5G, train')
  await input.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('VPN via 5G, train')
  await page.getByTestId('note-field').fill('Between two tunnels')
  await page.getByTestId('note-field').blur()
  // The save lands in IndexedDB before the reload, which would otherwise abort it in flight.
  await expect.poll(() => storedNotes(page)).toContain('Between two tunnels')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('VPN via 5G, train')
  await expect(page.getByTestId('note-field')).toHaveValue('Between two tunnels')
})

test('deletes the result with an undo, and runs its settings again on the Test screen', async ({ page }) => {
  await openNewest(page)
  await page.getByTestId('delete-result').click()
  await expect(page.getByTestId('result-missing')).toContainText('Result deleted')
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Result deleted.' })
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('VPN via 5G')
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Result restored.' })).toBeVisible()

  // Run again starts the result's settings on the Test screen, not the stored ones (the Standard
  // preset and 20 pings): its result records the Quick preset and 12 pings. Escape stops it.
  await page.getByTestId('run-again').click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: 'Stop test' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('gauge-label')).toHaveText('Download', { timeout: 30_000 })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Stop test' })).toBeHidden({ timeout: 15_000 })
  await page.getByTestId('result-bar').getByTestId('result-details').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('VPN via 5G')
  await expect(page.getByTestId('parameter-preset')).toContainText('Quick')
  await expect(page.getByTestId('parameter-pings')).toContainText('12')
})

test('says an unknown result is not found, with a way to History', async ({ page }) => {
  await page.goto('/result/d0000000-0000-4000-8000-0000000000ff')
  await expect(page.getByTestId('result-missing')).toContainText('Result not found')
  await expectAccessible(page)
  await page.getByTestId('result-missing').getByRole('link', { name: 'Go to History' }).click()
  await expect(page.getByRole('heading', { name: 'No results yet' })).toBeVisible()
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`shows the whole of a long label as its title at ${viewport.width} px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const LONG = 'x'.repeat(64)
    await importHistory(page, QUICK.map((result, index) => (index === 0 ? { ...result, label: LONG } : result)))
    await page.goto(`/result/${encodeURIComponent(QUICK[0]?.id ?? '')}`)
    const title = page.getByRole('heading', { level: 1 })
    await expect(title).toHaveText(LONG)
    expect(await title.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  })
}
