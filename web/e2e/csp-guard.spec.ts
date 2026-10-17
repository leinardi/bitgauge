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

// The negative control of the CSP guard (fixtures/test.ts): a request the policy blocks, made once
// from the page and once from the engine's Worker, is reported by both listeners. The target is
// another port of the loopback interface, which connect-src 'self' blocks before anything is sent.

import { readFile } from 'node:fs/promises'

import { DEMO_RESULTS, importHistory } from './fixtures/history'
import { expect, test, WORKER_GUARD } from './fixtures/test'

const BLOCKED = 'http://127.0.0.1:9/'

test('reports a violation in the page and in the engine Worker', async ({ page, cspViolations }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Start test' })).toBeEnabled()
  const [worker] = page.workers()
  if (worker === undefined) {
    throw new Error('the Test screen started no Worker')
  }
  await expect.poll(() => worker.evaluate((flag) => flag in self, WORKER_GUARD)).toBe(true)

  await page.evaluate((url) => fetch(url).catch(() => undefined), BLOCKED)
  await worker.evaluate((url) => fetch(url).catch(() => undefined), BLOCKED)

  const reported = (scope: string) => [...cspViolations].some((violation) => violation.startsWith(`${scope}: connect-src blocked ${BLOCKED}`))
  await expect.poll(() => reported('page')).toBe(true)
  await expect.poll(() => reported('worker')).toBe(true)
  // The control's own violations are the expected ones; the guard checks for any other.
  cspViolations.clear()
})

// vue-sonner v2 ships its CSS as a file and positions its toaster with CSSOM style bindings, both of
// which style-src 'self' allows: the toaster's list is in place, styled by the stylesheet and
// carrying its bound custom properties, and the guard sees no violation. The share image's test
// below raises a toast.
test('mounts the toaster with its stylesheet and style bindings under the policy', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Start test' })).toBeEnabled()
  const toaster = page.locator('[data-sonner-toaster]')
  await expect(toaster).toBeAttached()
  await expect(page.getByRole('region', { name: /^Notifications/ })).toBeAttached()
  const styled = await toaster.evaluate((element) => {
    const style = getComputedStyle(element)
    return { position: style.position, width: style.getPropertyValue('--width'), background: style.getPropertyValue('--normal-bg'), radius: style.getPropertyValue('--border-radius') }
  })
  // position: fixed comes from the stylesheet, --width from vue-sonner's binding, --normal-bg and
  // --border-radius from the primitive's, resolved through the theme's variables.
  expect(styled).toMatchObject({ position: 'fixed', width: '356px' })
  expect(styled.background).not.toBe('')
  expect(styled.radius).not.toBe('')
  // vue-sonner's own theme rules follow the page's applied theme.
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme })
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme)
    await expect(toaster).toHaveAttribute('data-sonner-theme', colorScheme)
  }
})

// History and the share image under the policy: the History page loads and imports an export; the
// canvas reads the dark palette, loads the embedded fonts and exports a PNG through a blob: URL, and
// the toast that confirms it shows; the guard sees no violation. No run is needed.
test('loads History and downloads the share image, confirmed by a toast, under the policy', async ({ page }) => {
  await importHistory(page, DEMO_RESULTS.slice(0, 1))
  await page.locator('main a[href*="/result/"]').first().click()
  await expect(page.getByTestId('share-preview')).toBeVisible()
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-image').click()])
  expect(file.suggestedFilename()).toMatch(/^bitgauge-\d{4}-\d{2}-\d{2}-\d{4}\.png$/)
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Image downloaded.' })).toBeVisible()
  // The PNG's signature, then its IHDR chunk's width and height.
  const png = await readFile(await file.path())
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630])
})
