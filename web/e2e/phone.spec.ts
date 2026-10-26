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

// The narrow layout at the kit's 390 × 844 phone frame (ui/screens.md, responsive notes): a modal
// dialog's actions are not under the tab bar and fit the viewport (ui/flows.md sections 6 and 8),
// and nothing scrolls sideways.

import { DEMO_RESULTS, importHistory } from './fixtures/history'
import { expectFitsViewport, expectNoSideScroll, expectTappable, PHONE } from './fixtures/phone'
import { type Server, startServer } from './fixtures/server'
import { expect, test } from './fixtures/test'

test.use({ viewport: PHONE })

test.describe('a modal dialog over the tab bar', () => {
  test('Compare keeps Copy and Done above the tab bar', async ({ page }) => {
    await importHistory(page)
    const cards = page.getByTestId('history-cards')
    const boxes = cards.getByRole('checkbox')
    await boxes.nth(2).click()
    await boxes.nth(3).click()
    await cards.getByTestId('selection-bar').getByTestId('compare').click()
    const dialog = page.getByRole('dialog', { name: 'Compare results' })
    await expect(dialog).toBeVisible()
    await expectTappable(dialog.getByTestId('compare-copy'))
    await expectTappable(dialog.getByRole('button', { name: 'Done' }))
  })

  test('Clear all keeps its actions above the tab bar', async ({ page }) => {
    await importHistory(page)
    await page.getByTestId('clear-all').click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await expectFitsViewport(dialog)
    await expectTappable(dialog.getByTestId('clear-confirm'))
    await expectTappable(dialog.getByRole('button', { name: 'Cancel' }))
  })

  test.describe('on the Test screen', () => {
    let server: Server

    test.beforeEach(async () => {
      server = await startServer()
    })

    test.afterEach(async () => {
      await server.kill()
    })

    test('Share fits the viewport, its last actions above the tab bar', async ({ page }) => {
      test.setTimeout(120_000)
      await page.goto(`${server.url}/?run=1&preset=quick`)
      await expect(page.getByTestId('result-bar')).toContainText('Saved to history', { timeout: 90_000 })
      await page.getByTestId('share-open').click()
      const dialog = page.getByTestId('share-dialog')
      await expect(dialog).toBeVisible()
      await expectFitsViewport(dialog)
      await expectTappable(dialog.getByTestId('download-image').first())
      await expectTappable(dialog.getByTestId('copy-summary').first())
    })
  })
})

test.describe('a long unbroken value', () => {
  const LONG = 'x'.repeat(64)

  test('in the ignored-parameter notice wraps within the screen', async ({ page }) => {
    await page.goto(`/?label=${LONG}y`)
    await expect(page.getByTestId('notice').filter({ hasText: 'URL parameter ignored' })).toBeVisible()
    await expectNoSideScroll(page)
  })

  test("in the save bar's label suggestion stays within the screen", async ({ page }) => {
    test.setTimeout(120_000)
    await importHistory(page, DEMO_RESULTS.map((result, index) => (index === 0 ? { ...result, label: LONG } : result)))
    await page.goto('/?run=1&preset=quick')
    await expect(page.getByTestId('result-bar')).toContainText('Saved to history', { timeout: 90_000 })
    await expect(page.getByTestId('label-suggestion').filter({ hasText: LONG })).toHaveCount(1)
    await expectNoSideScroll(page)
  })
})
