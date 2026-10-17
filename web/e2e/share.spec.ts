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

// Flow 8, sharing (ui/flows.md section 8). On the Result detail the share panel is always there:
// its preview and summary carry no IP address, note or browser, and the label only once included;
// Download image saves a 1200 × 630 PNG made in the browser and Copy summary copies the summary,
// both confirmed by a toast; a refused clipboard selects the summary for a manual copy instead. On
// the Test screen, after a complete run, the save bar's Share opens the same panel in a
// focus-trapped dialog that Escape closes with the focus back on Share. Nothing is sent to the
// server (flow 8 step 4): while the user shares, the page requests nothing but its own static
// assets, such as the fonts the image loads, and never the API or with a body.

import { readFile } from 'node:fs/promises'

import type { Page } from '@playwright/test'

import { expectAccessible } from './fixtures/axe'
import { DEMO_RESULTS, importHistory } from './fixtures/history'
import { type Server, startServer } from './fixtures/server'
import { expect, test } from './fixtures/test'

const NEWEST = DEMO_RESULTS[0]

/**
 * The requests the page makes from now on that could carry anything to the server: any to the API,
 * any with a method other than GET or with a query; a static asset, as a font, is not one.
 */
function sent(page: Page): string[] {
  const list: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'blob:' || url.protocol === 'data:') {
      return
    }
    if (request.method() !== 'GET' || url.pathname.includes('/api/') || url.search !== '') {
      list.push(`${request.method()} ${url.pathname}${url.search}`)
    }
  })
  return list
}

async function openNewest(page: Page): Promise<string[]> {
  await importHistory(page, DEMO_RESULTS.map((result, index) => (index === 0 ? { ...result, note: 'Desk by the window' } : result)))
  await page.getByTestId('history-row').first().locator('a[href*="/result/"]').click()
  await expect(page.getByTestId('share-panel')).toBeVisible()
  return sent(page)
}

test('previews only what is shared, the label once included, and downloads the image', async ({ page }) => {
  const requests = await openNewest(page)
  const summary = page.getByTestId('share-summary')
  const preview = page.getByTestId('share-preview')
  await expect(summary).toContainText('Server: ')
  for (const hidden of [NEWEST?.client.ip ?? '', 'Desk by the window', 'Chrome', 'VPN via 5G']) {
    await expect(summary).not.toContainText(hidden)
    await expect(preview).not.toContainText(hidden)
  }
  await page.getByTestId('include-label').click()
  await expect(summary).toContainText('BitGauge · VPN via 5G')
  await expect(preview).toContainText('VPN via 5G')
  await expectAccessible(page)

  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-image').click()])
  expect(file.suggestedFilename()).toMatch(/^bitgauge-\d{4}-\d{2}-\d{2}-\d{4}\.png$/)
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Image downloaded.' })).toBeVisible()
  const png = await readFile(await file.path())
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630])
  expect(requests).toEqual([])
})

test('copies the summary, or selects it for a manual copy where the clipboard is refused', async ({ page, browserName }) => {
  if (browserName === 'chromium') {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  }
  const requests = await openNewest(page)
  const summary = page.getByTestId('share-summary')
  await page.getByTestId('copy-summary').click()
  const copied = page.locator('[data-sonner-toast]').filter({ hasText: 'Summary copied.' })
  // A browser that lets the page write the clipboard confirms; one that refuses selects the text.
  await expect(copied.or(page.getByTestId('copy-denied'))).toBeVisible()
  if (browserName === 'chromium') {
    await expect(copied).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await summary.innerText())
  }
  expect(requests).toEqual([])
})

test('selects the summary for a manual copy when the clipboard refuses, with no toast', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } })
  })
  await openNewest(page)
  await page.getByTestId('copy-summary').click()
  await expect(page.getByTestId('copy-denied')).toContainText('Clipboard access was denied')
  const summary = page.getByTestId('share-summary')
  await expect(summary).toBeFocused()
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(await summary.innerText())
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Summary copied.' })).toHaveCount(0)
  await expectAccessible(page)
})

test.describe('the Test screen', () => {
  let server: Server

  test.beforeEach(async () => {
    server = await startServer()
  })

  test.afterEach(async () => {
    await server.kill()
  })

  test('opens the share panel from the save bar in a focus-trapped dialog', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto(`${server.url}/?run=1&preset=quick&label=Desk`)
    await expect(page.getByTestId('result-bar')).toContainText('Saved to history', { timeout: 90_000 })
    const share = page.getByTestId('share-open')
    const requests = sent(page)
    await share.click()
    const dialog = page.getByRole('dialog', { name: 'Share result' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('share-panel')).toBeVisible()
    await expect(dialog.getByTestId('share-summary')).toContainText('Download ')
    await expectAccessible(page)
    for (let press = 0; press < 10; press++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    }
    await dialog.getByTestId('download-image').click()
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Image downloaded.' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(share).toBeFocused()
    expect(requests).toEqual([])
  })
})
