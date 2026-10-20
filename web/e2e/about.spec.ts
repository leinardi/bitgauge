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

// The About screen (ui/screens.md sections 1 and 5): reached from the header, it names the version,
// the license and the server, and links to the source. On a BitGauge of its own with one
// compatibility layer on, the snippets of that layer alone show, built from the page's address,
// and the others say the operator can enable them; axe scans the screen with its snippets.

import { expectAccessible } from './fixtures/axe'
import { startServer } from './fixtures/server'
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

const OFF = 'Not enabled on this server — the operator can enable it.'
const LAYERS = ['openspeedtest', 'librespeed', 'networkquality'] as const

// One server per layer, configured only through its environment. networkQuality needs a trusted
// proxy when server.public_url is empty (configuration.md section 4, conflicting toggles).
const TOGGLES = [
  { layer: 'openspeedtest', env: { BITGAUGE_COMPAT__OPENSPEEDTEST__ENABLED: 'true' }, first: (base: string) => `https://ost.example.lan/?Host=${base}` },
  { layer: 'librespeed', env: { BITGAUGE_COMPAT__LIBRESPEED__ENABLED: 'true' }, first: (base: string) => ['[', '  {', '    "id": 1,', '    "name": "BitGauge",', `    "server": "${base}/",`].join('\n') },
  { layer: 'networkquality', env: { BITGAUGE_COMPAT__NETWORKQUALITY__ENABLED: 'true', BITGAUGE_SERVER__TRUSTED_PROXIES: '127.0.0.1/32' }, first: (base: string) => `networkQuality -C ${base}/nq/config` },
] as const

for (const toggle of TOGGLES) {
  test(`shows the ${toggle.layer} snippets only when its layer is on`, async ({ page }) => {
    const server = await startServer(toggle.env)
    try {
      await page.goto(`${server.url}/about`)
      const own = page.getByTestId(`about-layer-${toggle.layer}`)
      await expect(own.locator('pre').first()).toContainText(toggle.first(server.url))
      await expect(own).not.toContainText(OFF)
      for (const other of LAYERS.filter((layer) => layer !== toggle.layer)) {
        await expect(page.getByTestId(`about-layer-${other}`)).toContainText(OFF)
        await expect(page.getByTestId(`about-layer-${other}`).locator('pre')).toHaveCount(0)
      }
      // The page is plain http, so the networkQuality snippet says it needs HTTPS.
      await expect(page.getByTestId('about-https-note')).toHaveCount(toggle.layer === 'networkquality' ? 1 : 0)
      // A long line scrolls inside its block; the page never scrolls sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      await expectAccessible(page)
    } finally {
      await server.kill()
    }
  })
}
