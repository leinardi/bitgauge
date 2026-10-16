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

// @vitest-environment jsdom

// The v0.1 About screen (ui/screens.md section 5) for an unreachable and a reachable server.

import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { getInfo } from '@/api/info'
import { useInfo } from '@/composables/useInfo'
import { links } from '@/lib/links'
import AboutPage from '@/pages/AboutPage.vue'
import { infoFixture } from '@/test/fixtures'
import { mountApp } from '@/test/mount'

vi.mock('@/api/info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/info')>()),
  getInfo: vi.fn(),
}))

// The info state is shared by the module, so the order matters: first unreachable, then answered.
describe('the About screen', () => {
  it('shows what it can without the server, with Retry', async () => {
    let fail: (reason: Error) => void = () => undefined
    vi.mocked(getInfo).mockReturnValueOnce(new Promise((_resolve, reject) => (fail = reject)))
    const page = await mountApp(AboutPage, '/about')
    const first = useInfo().refresh()
    await flushPromises()
    // While the first request is on its way, the facts are dashes, not "unreachable".
    expect(page.get('[data-testid="about-version"]').text()).toMatch(/Version—$/)
    expect(page.find('[role="alert"]').exists()).toBe(false)
    fail(new TypeError('network'))
    await first
    await flushPromises()
    expect(page.get('[data-testid="about-version"]').text()).toContain('— · server unreachable')
    expect(page.get('[data-testid="about-server"]').text()).toMatch(/—$/)
    expect(page.get('[data-testid="about-license"]').text()).toContain('GPL-3.0-or-later')
    const alert = page.get('[role="alert"]')
    expect(alert.text()).toContain('Server unreachable')
    expect(alert.text()).toContain('so its version and name are unknown until it answers.')

    vi.mocked(getInfo).mockResolvedValueOnce(infoFixture())
    await alert.get('button').trigger('click')
    await flushPromises()
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(page.get('[data-testid="about-version"]').text()).toContain('0.1.0 · a1b2c3d · Sep 30, 2026')
    expect(page.get('[data-testid="about-server"]').text()).toContain('Basement NAS')
  })

  it('links the source, the license and the methodology, and has no snippets before v0.3', async () => {
    const page = await mountApp(AboutPage, '/about')
    const hrefs = page.findAll('a').map((link) => link.attributes('href'))
    expect(hrefs).toEqual(expect.arrayContaining([links.source, links.license, links.methodology]))
    expect(page.text()).toContain('How to test against this server from other speed test clients')
    expect(page.text()).toContain('Other clients arrive in v0.3')
    expect(page.text()).toContain('so there are no snippets yet.')
    // The v0.3 notice is part of the page, not news: it is no live region.
    expect(page.find('[role="status"]').exists()).toBe(false)
    // Credits live in the README, not on the screen.
    expect(page.text()).not.toContain('Credits')
    expect(page.find('pre').exists()).toBe(false)
  })
})
