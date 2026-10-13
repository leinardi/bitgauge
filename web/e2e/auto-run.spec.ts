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

// Flow 2, auto-run from a URL (ui/flows.md section 2): a link with `run` counts down and runs its
// settings, the countdown can be cancelled, and an invalid value is ignored with a notice.

import { readFile } from 'node:fs/promises'

import { expect, test } from './fixtures/test'

test('counts down from a run link and runs its settings with its label', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/?run=1&preset=quick&label=VPN')

  // Step 3: the cancellable countdown, with the URL's settings applied.
  await expect(page.getByTestId('auto-start')).toContainText('Auto-start in')
  await expect(page.getByTestId('countdown')).toBeVisible()
  await expect(page.getByTestId('settings-summary')).toContainText('changed: Quick')

  // Step 4: the run starts on its own and finishes; the label goes into the result.
  await expect(page.getByRole('button', { name: 'Stop test' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('auto-start')).toBeHidden()
  await expect(page.getByTestId('result-bar')).toContainText('Test complete', { timeout: 90_000 })
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download JSON' }).click()])
  const exported = JSON.parse(await readFile(await file.path(), 'utf8')) as { results: unknown[] }
  expect(exported.results[0]).toMatchObject({ label: 'VPN', settings: { preset: 'quick' } })
})

test('stops the countdown on Cancel, leaving the settings for Start', async ({ page }) => {
  await page.goto('/?run=1&preset=quick')
  await expect(page.getByTestId('auto-start')).toBeVisible()
  await page.getByTestId('auto-start-cancel').click()

  await expect(page.getByTestId('auto-start')).toBeHidden()
  await expect(page.getByTestId('countdown')).toBeHidden()
  // Past the 3 s the countdown had: nothing started, and Start runs the URL's settings.
  await page.waitForTimeout(3500)
  await expect(page.getByRole('button', { name: 'Start test' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Stop test' })).toBeHidden()
  await expect(page.getByTestId('settings-summary')).toContainText('changed: Quick')
})

test('ignores an invalid parameter with a notice naming it, and applies the rest', async ({ page }) => {
  await page.goto('/?preset=fastest&units=bytes')
  const notice = page.getByTestId('notice').filter({ hasText: 'URL parameter ignored' })
  await expect(notice).toContainText('preset')
  // Only the units differ from the server's defaults: the invalid preset left Standard in place.
  await expect(page.getByTestId('settings-summary')).toHaveText('1 changed: Units · MB/s')
})
