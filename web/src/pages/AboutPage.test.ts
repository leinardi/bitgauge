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
    expect(page.get('[data-testid="about-licence"]').text()).toContain('GPL-3.0-or-later')
    const alert = page.get('[role="alert"]')
    expect(alert.text()).toContain('Server unreachable')

    vi.mocked(getInfo).mockResolvedValueOnce(infoFixture())
    await alert.get('button').trigger('click')
    await flushPromises()
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(page.get('[data-testid="about-version"]').text()).toContain('0.1.0 · a1b2c3d · Sep 30, 2026')
    expect(page.get('[data-testid="about-server"]').text()).toContain('Basement NAS')
  })

  it('links the source, the licence and the methodology, credits, and has no snippets before v0.3', async () => {
    const page = await mountApp(AboutPage, '/about')
    const hrefs = page.findAll('a').map((link) => link.attributes('href'))
    expect(hrefs).toEqual(expect.arrayContaining([links.source, links.licence, links.methodology]))
    expect(page.text()).toContain('arrives in BitGauge v0.3')
    expect(page.text()).toContain('OpenSpeedTest™ is a trademark of its owner.')
    for (const credit of ['LibreSpeed', 'Cloudflare', 'Apple networkQuality and the IETF responsiveness draft', 'Waveform']) {
      expect(page.text()).toContain(credit)
    }
    expect(page.find('pre').exists()).toBe(false)
  })
})
