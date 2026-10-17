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

// The About screen (ui/screens.md section 1): reached from the header, it names the version, the
// license and the server, and links to the source.

import { expect, test } from './fixtures/test'

test('opens from the header with the version, license and server', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'About' }).click()

  await expect(page).toHaveURL(/\/about$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Use with other clients')
  await expect(page.getByTestId('about-version')).toContainText(/\S+ · \S+ · /)
  await expect(page.getByTestId('about-license')).toContainText('GPL-3.0-or-later')
  await expect(page.getByTestId('about-server')).toContainText('BitGauge')
  await expect(page.getByRole('link', { name: 'Source repository' })).toHaveAttribute('target', '_blank')
})
