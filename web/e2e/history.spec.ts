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

// Flow 6, history review and compare (ui/flows.md section 6): the unavailable state where the
// browser keeps no history; the list newest first with the per-origin notice; sorting; the context,
// date-range and label filters, each in the query string, with the trend following them; a search
// with no match and Clear filters; a row opened and Back to the filtered list; two rows compared in
// a focus-trapped dialog that warns they are not directly comparable, the comparison copied as
// text, and another pair compared after deselecting one; a row and then the selected rows deleted
// with their undo; and Clear all after its confirmation. axe checks each screen once its
// transitions have settled.

import type { Page } from '@playwright/test'

import { expectAccessible } from './fixtures/axe'
import { DEMO_RESULTS, importHistory } from './fixtures/history'
import { expect, test } from './fixtures/test'

/** The first trend chart, whose accessible name counts the results it draws. */
const trend = (page: Page) => page.getByTestId('history-trend').locator('[role="img"]').first()

/** The demo's results with the second one, "VPN · hotel Wi-Fi", measured on the LAN instead. */
const MIXED = DEMO_RESULTS.map((result, index) => (index === 1 ? { ...result, client: { ...result.client, contextLabel: 'LAN' } } : result))

test('says history is unavailable where the browser keeps none', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined })
  })
  await page.goto('/history')
  await expect(page.getByTestId('history-unavailable')).toContainText("History isn't available in this window")
  await expectAccessible(page)
})

test('reviews, sorts and filters results, opens one, and Back keeps the filter', async ({ page }) => {
  await importHistory(page, MIXED)
  await expect(page.getByTestId('origin-notice')).toBeVisible()
  const rows = page.getByTestId('history-row')
  const count = page.getByTestId('history-count')
  await expect(rows).toHaveCount(8)
  await expect(rows.first()).toContainText('VPN via 5G')
  await expect(trend(page)).toHaveAttribute('aria-label', /Download trend, 7 results, 1 partial or error/)

  // Sorting by a column header.
  await page.getByTestId('sort-download').click()
  await expect(page.locator('[aria-sort="descending"]')).toHaveText('Download')
  await expect(rows.first()).toContainText('VPN · office')

  // The context filter, then the date range: each in the query string, the trend following.
  const lan = page.getByTestId('chip-contexts').filter({ hasText: 'LAN' })
  await lan.click()
  await expect(count).toContainText('1 of 8 shown')
  await expect(page).toHaveURL(/contexts=LAN/)
  await expect(trend(page)).toHaveAttribute('aria-label', /, 1 results/)
  await lan.click()
  await expect(count).toContainText('8 of 8 shown')
  await page.getByTestId('date-range').click()
  await page.getByTestId('range-from').fill('2026-10-02')
  await page.getByTestId('range-to').fill('2026-10-05')
  await page.getByTestId('range-apply').click()
  await expect(count).toContainText('2 of 8 shown')
  await expect(page).toHaveURL(/range=2026-10-02\.\.2026-10-05/)
  await expect(trend(page)).toHaveAttribute('aria-label', /, 2 results/)
  await page.goto('/history')
  await expect(count).toContainText('8 of 8 shown')

  // The label filter narrows the list and the trend.
  await page.getByTestId('chip-labels').filter({ hasText: 'VPN · office' }).click()
  await expect(count).toContainText('2 of 8 shown')
  await expect(rows).toHaveCount(2)
  await expect(page).toHaveURL(/labels=/)
  await expect(trend(page)).toHaveAttribute('aria-label', /, 2 results/)
  await expectAccessible(page)

  // A row opens its Result detail; Back returns to the list with the filter kept.
  await rows.first().locator('a[href*="/result/"]').click()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('VPN · office')
  await page.goBack()
  await expect(count).toContainText('2 of 8 shown')

  // A search with no match, and Clear filters.
  await page.getByTestId('history-search').fill('airport')
  await expect(page.getByTestId('history-no-match')).toContainText('matches “airport”. All 8 results are still in history.')
  await expectAccessible(page)
  await page.getByTestId('history-no-match').getByRole('button', { name: 'Clear filters' }).click()
  await expect(count).toContainText('8 of 8 shown')
})

test('compares two results in a focus-trapped dialog, copies the comparison, and compares another pair', async ({ page, browserName }) => {
  if (browserName === 'chromium') {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  }
  await importHistory(page)
  // The table's selection bar: the cards and theirs are for narrow screens.
  const table = page.getByTestId('history-table')
  const boxes = table.getByTestId('row-select')
  const compare = table.getByTestId('selection-bar').getByTestId('compare')
  await boxes.nth(2).click()
  await boxes.nth(3).click()
  await expect(table.getByTestId('selection-bar')).toContainText('2 selected')
  await compare.click()
  const dialog = page.getByRole('dialog', { name: 'Compare results' })
  await expect(dialog).toBeVisible()
  // A is the older, "VPN · office" on HTTP/1.1; B the newer, "VPN via 5G" on HTTP/2.
  await expect(dialog.getByTestId('compare-warning')).toHaveText('Not directly comparable: different label (VPN · office vs VPN via 5G); different protocol (HTTP/1.1 vs HTTP/2)')
  await expect(dialog.getByTestId('compare-row-download')).toContainText('worse')
  await expectAccessible(page)

  // The focus stays in the dialog.
  for (let press = 0; press < 12; press++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }

  // Copy comparison: to the clipboard where the browser allows it, otherwise as text to copy by hand.
  await dialog.getByTestId('compare-copy').click()
  const copied = page.locator('[data-sonner-toast]').filter({ hasText: 'Comparison copied.' })
  await expect(copied.or(dialog.getByTestId('compare-text'))).toBeVisible()
  if (browserName === 'chromium') {
    await expect(copied).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Protocol: HTTP/1.1 → HTTP/2')
  }

  // Escape returns the focus to Compare; deselecting one row and selecting another compares a new
  // pair, two results of the same label and protocol.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(compare).toBeFocused()
  await boxes.nth(3).click()
  await boxes.nth(4).click()
  await expect(table.getByTestId('selection-bar')).toContainText('2 selected')
  await compare.click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('compare-warning')).toHaveCount(0)

  // Either side opens its detail.
  await dialog.locator('a[href*="/result/"]').first().click()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
})

test('deletes a row, then the selected rows, each with an undo, and clears all after its confirmation', async ({ page }) => {
  await importHistory(page)
  const count = page.getByTestId('history-count')
  const undo = async (title: string) => {
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: title })
    await expect(toast).toBeVisible()
    await toast.getByRole('button', { name: 'Undo' }).click()
  }
  await page.getByTestId('history-row').first().getByTestId('row-actions').click()
  await page.getByTestId('row-delete').click()
  await expect(count).toContainText('7 of 7 shown')
  await undo('1 result deleted.')
  await expect(count).toContainText('8 of 8 shown')

  const table = page.getByTestId('history-table')
  await table.getByTestId('row-select').nth(0).click()
  await table.getByTestId('row-select').nth(1).click()
  await table.getByTestId('selection-bar').getByTestId('delete-selected').click()
  await expect(count).toContainText('6 of 6 shown')
  await expect(table.getByTestId('selection-bar')).toHaveCount(0)
  await undo('2 results deleted.')
  await expect(count).toContainText('8 of 8 shown')

  await page.getByTestId('clear-all').click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('This removes 8 results with their labels and notes from this browser. This cannot be undone.')
  await expect(confirm.getByTestId('clear-export-first')).toBeVisible()
  await expectAccessible(page, '[role="alertdialog"]')
  await confirm.getByTestId('clear-confirm').click()
  await expect(page.getByRole('heading', { name: 'No results yet' })).toBeVisible()
  // Nothing comes back on a reload: the results are gone from this browser.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'No results yet' })).toBeVisible()
})
