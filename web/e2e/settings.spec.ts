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

// Flow 9, changing settings (ui/flows.md section 9): the fields show the server defaults; a change
// is stored at once, marked and listed with its default, and the Test screen's settings summary and
// the Shareable URL follow it; an invalid value shows its error and is not stored, Escape restores
// the valid one; edited durations stay custom when another preset is chosen (ui/screens.md section
// 4); a single setting resets to its default, and Reset all asks first. The stored settings outlive
// a reload, and the next run uses them unless the URL of a page load overrides them for that load.
// axe checks each state once its transitions have settled.

import { expectAccessible } from './fixtures/axe'
import { expect, test } from './fixtures/test'

test('stores a change at once, which the Test screen and the shareable link follow', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')
  await expect(page.getByText('Everything is at its default.')).toBeVisible()

  await page.getByTestId('preset-quick').click()
  await expect(page.getByTestId('changed-preset')).toContainText('default Standard')
  await expect(page.getByTestId('share-url')).toHaveValue(/\/\?preset=quick$/)
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  await expectAccessible(page)

  // The Test screen's summary names it, and so does a reload of Settings: it is stored.
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Test' }).click()
  await expect(page.getByTestId('settings-summary')).toContainText('Quick')
  await page.goto('/settings')
  await expect(page.getByTestId('changed-preset')).toContainText('default Standard')
})

test('keeps an invalid value out, with its error, and Escape restores the valid one', async ({ page }) => {
  await page.goto('/settings')
  const max = page.locator('#settings-download-max')
  await expect(max).toHaveValue('20')
  await max.fill('700')
  await max.press('Enter')
  await expect(max).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator(`#${await max.getAttribute('aria-describedby')}`)).toHaveText('Enter whole seconds from 5 s to 10 min (600 s). Not saved · Esc restores 20 s.')
  await expect(page.getByRole('status').filter({ hasText: '1 value not saved' })).toBeVisible()
  await expectAccessible(page)
  await max.press('Escape')
  await expect(max).toHaveValue('20')
  await expect(max).not.toHaveAttribute('aria-invalid', 'true')
  await page.reload()
  await expect(page.getByText('Everything is at its default.')).toBeVisible()
})

test('keeps edited durations as custom across presets, resets one setting, then all after confirmation', async ({ page }) => {
  await page.goto('/settings')
  const max = page.locator('#settings-download-max')
  await max.fill('30')
  await max.press('Tab')
  await expect(page.getByTestId('changed-download')).toContainText('default 10–20 s')

  // Another preset leaves the edited durations as they are.
  await page.getByTestId('preset-extended').click()
  await expect(max).toHaveValue('30')
  await expect(page.locator('#settings-upload-max')).toHaveValue('40')

  // One setting back to its default: the durations return to the chosen preset's.
  await page.getByTestId('changed-download').getByRole('button').click()
  await expect(page.getByTestId('changed-download')).toHaveCount(0)
  await expect(max).toHaveValue('40')
  await expect(page.getByTestId('changed-preset')).toBeVisible()

  // Reset all asks first, naming what returns to its default.
  await page.getByRole('button', { name: 'Reset all to defaults' }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('1 setting returns to its default: Preset.')
  await expectAccessible(page)
  await confirm.getByRole('button', { name: 'Reset all' }).click()
  await expect(page.getByText('Everything is at its default.')).toBeVisible()
  await expect(max).toHaveValue('20')
  await page.reload()
  await expect(page.getByText('Everything is at its default.')).toBeVisible()
})

test('runs with the stored settings, unless the URL of a page load overrides them for that load', async ({ page }) => {
  test.setTimeout(90_000)
  // Idle latency only, for short runs, and a result label.
  await page.goto('/settings')
  await page.getByRole('checkbox', { name: 'Download' }).click()
  await page.getByRole('checkbox', { name: 'Upload' }).click()
  const label = page.locator('#settings-label')
  await label.fill('Lab bench')
  await label.press('Enter')
  await expect(page.getByTestId('changed-label')).toBeVisible()

  // The next run uses them: its result carries the stored label.
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Test' }).click()
  await page.getByRole('button', { name: 'Start test' }).click()
  await expect(page.getByTestId('result-bar')).toContainText('Saved to history', { timeout: 60_000 })
  await expect(page.getByTestId('result-label-field')).toHaveValue('Lab bench')

  // A URL parameter overrides the label for that load's run, and stores nothing.
  await page.goto('/?label=Rack%202')
  await page.getByRole('button', { name: 'Start test' }).click()
  await expect(page.getByTestId('result-bar')).toContainText('Saved to history', { timeout: 60_000 })
  await expect(page.getByTestId('result-label-field')).toHaveValue('Rack 2')
  await page.goto('/settings')
  await expect(label).toHaveValue('Lab bench')
})
