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

// axe on the Test and About screens in both themes, and on the not-available screen (testing.md
// section 4, ui/i18n-a11y.md section 2.6). The theme comes from the documented URL parameter
// (ui/url-params.md section 1), which overrides the stored choice for the page load.

import { expectAccessible } from './fixtures/axe'
import { expect, test } from './fixtures/test'

for (const theme of ['light', 'dark'] as const) {
  test.describe(`the ${theme} theme`, () => {
    test('the Test screen, idle', async ({ page }) => {
      await page.goto(`/?theme=${theme}`)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.getByRole('button', { name: 'Start test' })).toBeEnabled()
      await expectAccessible(page)
    })

    test('the About screen', async ({ page }) => {
      await page.goto(`/about?theme=${theme}`)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.getByTestId('about-server')).toContainText('BitGauge')
      await expectAccessible(page)
    })

    test('the not-available screen', async ({ page }) => {
      await page.goto(`/settings?theme=${theme}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not available in this version')
      await expectAccessible(page)
    })
  })
}
