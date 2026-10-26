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

// axe on the Test, History, Result detail, Settings and About screens in both themes (testing.md
// section 4, ui/i18n-a11y.md section 2.6). The theme comes from the documented URL parameter
// (ui/url-params.md section 1), which overrides the stored choice for the page load. Each test
// starts with an empty history; the populated one imports the demo's eight results, and one record
// it rejects, and the Result detail shows the newest of them, with a chart and a table. The
// screens' other states are here too: History with no match, the Compare dialog, the Result detail
// not found, and Settings with a change and its Reset all confirmation. The Test screen's Done state
// runs a quick test, so it shows its load card with the HTTP loaded responsiveness and the quality
// list.

import { expectAccessible } from './fixtures/axe'
import { DEMO_RESULTS, historyExport, importHistory } from './fixtures/history'
import { expect, test } from './fixtures/test'

// One record of a later result version, so the import's summary shows every pill.
const RESULTS = DEMO_RESULTS
const NEWER = { ...RESULTS[0], id: 'd0000000-0000-4000-8000-000000000099', schemaVersion: 3 }
const EXPORT = historyExport([...RESULTS, NEWER])

for (const theme of ['light', 'dark'] as const) {
  test.describe(`the ${theme} theme`, () => {
    test('the Test screen, idle', async ({ page }) => {
      await page.goto(`/?theme=${theme}`)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.getByRole('button', { name: 'Start test' })).toBeEnabled()
      await expectAccessible(page)
    })

    test('the Test screen, done, with the load card and the quality list', async ({ page }) => {
      test.setTimeout(120_000)
      await page.goto(`/?theme=${theme}&preset=quick`)
      await page.getByRole('button', { name: 'Start test' }).click()
      await expect(page.getByTestId('result-bar')).toBeVisible({ timeout: 90_000 })
      await expect(page.getByTestId('load-responsiveness')).toBeVisible()
      await expect(page.getByTestId('quality-list')).toBeVisible()
      await expectAccessible(page)
    })

    test('the About screen', async ({ page }) => {
      await page.goto(`/about?theme=${theme}`)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.getByTestId('about-server')).toContainText('BitGauge')
      await expectAccessible(page)
    })

    test('the Settings screen, Advanced open', async ({ page }) => {
      await page.goto(`/settings?theme=${theme}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')
      await page.getByRole('button', { name: /^Advanced/ }).click()
      await expect(page.getByRole('textbox', { name: 'Ping count' })).toBeVisible()
      await expectAccessible(page)
    })

    test('the History screen, empty', async ({ page }) => {
      await page.goto(`/history?theme=${theme}`)
      await expect(page.getByRole('heading', { name: 'No results yet' })).toBeVisible()
      await expectAccessible(page)
    })

    test('the History screen, populated', async ({ page }) => {
      await page.goto(`/history?theme=${theme}`)
      await expect(page.getByRole('heading', { name: 'No results yet' })).toBeVisible()
      await page.getByTestId('import-input').setInputFiles({ name: 'bitgauge-history.json', mimeType: 'application/json', buffer: Buffer.from(EXPORT) })
      await expect(page.getByTestId('import-done')).toContainText('8 added, 0 skipped as duplicates, 1 rejected: result 9: schema version 3 is newer than this app')
      await expect(page.getByTestId('history-count')).toContainText('8 of 8 shown')
      await expectAccessible(page)
    })

    test('the Result detail, with a chart and a table', async ({ page }) => {
      await page.goto(`/history?theme=${theme}`)
      await expect(page.getByRole('heading', { name: 'No results yet' })).toBeVisible()
      await page.getByTestId('import-input').setInputFiles({ name: 'bitgauge-history.json', mimeType: 'application/json', buffer: Buffer.from(EXPORT) })
      await expect(page.getByTestId('history-count')).toContainText('8 of 8 shown')
      await page.locator('main a[href*="/result/"]').first().click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('VPN via 5G')
      await expect(page.getByTestId('phase-chart-download')).toBeVisible()
      await page.getByTestId('chart-card-upload').getByRole('radio', { name: 'Table' }).click()
      await expect(page.getByTestId('chart-card-upload').getByTestId('window-table')).toBeVisible()
      await expectAccessible(page)
    })

    test('the History screen, no match', async ({ page }) => {
      await importHistory(page, RESULTS, `/history?theme=${theme}`)
      await page.getByTestId('history-search').fill('airport')
      await expect(page.getByTestId('history-no-match')).toBeVisible()
      await expectAccessible(page)
    })

    test('the Compare dialog', async ({ page }) => {
      await importHistory(page, RESULTS, `/history?theme=${theme}`)
      const table = page.getByTestId('history-table')
      const boxes = table.getByTestId('row-select')
      await boxes.nth(0).click()
      await boxes.nth(1).click()
      // The selected rows first: their subtle text reads as muted on the selection's background.
      await expectAccessible(page)
      await table.getByTestId('selection-bar').getByTestId('compare').click()
      await expect(page.getByRole('dialog', { name: 'Compare results' })).toBeVisible()
      // The dialog alone: the rows behind it are hidden while it is open.
      await expect(page.getByRole('toolbar', { name: 'Selection' })).toHaveCount(0)
      await expectAccessible(page, '[role="dialog"]')
    })

    test('the Result detail, not found', async ({ page }) => {
      await page.goto(`/result/d0000000-0000-4000-8000-0000000000ff?theme=${theme}`)
      await expect(page.getByTestId('result-missing')).toContainText('Result not found')
      await expectAccessible(page)
    })

    test('the Settings screen, changed, with the Reset all confirmation', async ({ page }) => {
      await page.goto(`/settings?theme=${theme}`)
      await page.getByTestId('preset-quick').click()
      await expect(page.getByTestId('changed-preset')).toBeVisible()
      await expectAccessible(page)
      await page.getByRole('button', { name: 'Reset all to defaults' }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
      await expectAccessible(page)
    })
  })
}

// Forced colors (ui/i18n-a11y.md section 2.5), in Chromium's emulation, the one Playwright has: the
// browser drops the tinted background a selected control relies on, so a selected one keeps an
// outline the others lack, and the trend legend's filled marker keeps its fill.
test.describe('forced colors', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'forced colors are emulated in Chromium only')

  const outline = (control: import('@playwright/test').Locator) => control.evaluate((element) => getComputedStyle(element).outlineStyle)

  test('mark the selected theme, segment and filter chip, and keep the legend marker', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await importHistory(page)
    const chips = page.getByTestId('history-filters').getByRole('button', { pressed: true })
    expect(await outline(chips.first())).toBe('solid')
    expect(await outline(page.getByTestId('history-filters').getByRole('button', { pressed: false }).first())).toBe('none')
    const complete = page.getByRole('list', { name: 'Legend' }).getByRole('listitem').first().locator('span').first()
    expect(await complete.evaluate((element) => getComputedStyle(element).forcedColorAdjust)).toBe('none')

    await page.goto('/settings')
    const units = page.getByRole('radiogroup', { name: 'Units' })
    expect(await outline(units.getByRole('radio', { checked: true }))).toBe('solid')
    expect(await outline(units.getByRole('radio', { checked: false }))).toBe('none')
    const header = page.getByRole('banner').getByRole('radiogroup')
    expect(await outline(header.getByRole('radio', { checked: true }))).toBe('solid')
    expect(await outline(header.getByRole('radio', { checked: false }).first())).toBe('none')
  })
})
