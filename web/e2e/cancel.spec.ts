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

// Flow 4, cancel mid-test (ui/flows.md section 4): Stop, or Escape, ends the run at once; the
// result is partial, an interrupted direction has a number only when its steady window reached the
// minimum, the phases not yet started are skipped, and the result is not saved.

import { expectAccessible } from './fixtures/axe'
import { expect, test } from './fixtures/test'

test('Stop early in download gives a partial result with insufficient data', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start test' }).click()
  await expect(page.getByTestId('gauge-label')).toHaveText('Download', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Stop test' }).click()

  await expect(page.getByTestId('result-bar')).toContainText('Partial results are not saved')
  const tiles = page.getByTestId('metric-tile')
  await expect(tiles.filter({ hasText: 'Download' }).first()).toContainText('Insufficient data')
  await expect(tiles.filter({ hasText: 'Upload' }).first()).toContainText('skipped')
  await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download JSON' })).toBeVisible()
  await expectAccessible(page)
})

test('Escape past the steady window gives a partial number with what it covered', async ({ page }) => {
  test.setTimeout(120_000)
  // Extended download only: a minimum of 20 s, so a stop at 15 s falls inside the phase with a
  // confirmed steady window of several seconds behind it.
  await page.goto('/?preset=extended&test=download')
  await page.getByRole('button', { name: 'Start test' }).click()
  await expect(page.getByTestId('gauge-label')).toHaveText('Download', { timeout: 30_000 })
  await page.waitForTimeout(15_000)
  await page.keyboard.press('Escape')

  await expect(page.getByTestId('result-bar')).toContainText('Partial results are not saved')
  const download = page.getByTestId('metric-tile').filter({ hasText: 'Download' }).first()
  await expect(download).toContainText('Partial — stopped early')
  await expect(download).toContainText(/based on a \d+(\.\d)?\ss steady window/)
  await expect(download.getByTestId('tile-number')).toHaveText(/\d/)
  await expect(page.getByTestId('notice').filter({ hasText: 'Test cancelled during download' })).toContainText(/Download has a \d+(\.\d)?\ss steady window, enough for a partial value\./)
})
