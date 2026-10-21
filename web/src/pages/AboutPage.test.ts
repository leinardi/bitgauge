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

// The About screen (ui/screens.md section 5) on this http page: unreachable, then answering with
// each layer's flag; the https page with a base path is AboutPage.https.test.ts.

import { flushPromises, type VueWrapper } from '@vue/test-utils'
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

const ORIGIN = window.location.origin
const LAYERS = ['openspeedtest', 'librespeed', 'networkquality'] as const
const OFF = 'Not enabled on this server — the operator can enable it.'

const card = (page: VueWrapper, layer: (typeof LAYERS)[number]) => page.get(`[data-testid="about-layer-${layer}"]`)
const blocks = (page: VueWrapper, layer: (typeof LAYERS)[number]) => card(page, layer).findAll('pre').map((pre) => pre.text())

/** The page once GET /info answered `info`. */
async function answered(info = infoFixture()) {
  vi.mocked(getInfo).mockResolvedValueOnce(info)
  const page = await mountApp(AboutPage, '/about')
  await useInfo().refresh()
  await flushPromises()
  return page
}

// The info state is shared by the module, so the order matters: first unreachable, then answered.
describe('the About screen', () => {
  it('shows what it can without the server: every snippet from this page, not confirmed, with Retry', async () => {
    let fail: (reason: Error) => void = () => undefined
    vi.mocked(getInfo).mockReturnValueOnce(new Promise((_resolve, reject) => (fail = reject)))
    const page = await mountApp(AboutPage, '/about')
    const first = useInfo().refresh()
    await flushPromises()
    // While the first request is on its way, the facts are dashes, not "unreachable", and no layer shows.
    expect(page.get('[data-testid="about-version"]').text()).toMatch(/Version—$/)
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(page.find('[data-testid^="about-layer-"]').exists()).toBe(false)
    fail(new TypeError('network'))
    await first
    await flushPromises()
    expect(page.get('[data-testid="about-version"]').text()).toContain('— · server unreachable')
    expect(page.get('[data-testid="about-server"]').text()).toMatch(/—$/)
    expect(page.get('[data-testid="about-license"]').text()).toContain('GPL-3.0-or-later')
    const alert = page.get('[role="alert"]')
    expect(alert.text()).toContain('Server unreachable')
    expect(alert.text()).toContain(`The commands below are built from this page's address, ${ORIGIN}.`)
    for (const layer of LAYERS) {
      expect(card(page, layer).text()).toContain('Not confirmed')
      expect(card(page, layer).text()).not.toContain(OFF)
    }
    // The server list names this page's host while the server's name is unknown.
    expect(JSON.parse(blocks(page, 'librespeed')[0] ?? '')).toMatchObject([{ name: window.location.host, server: `${ORIGIN}/` }])
    expect(blocks(page, 'networkquality')).toEqual([`networkQuality -C ${ORIGIN}/nq/config`, `networkQuality -C ${ORIGIN}/nq/config -v      # verbose, per-flow detail`])
    // This page is http, so the networkQuality snippet says it needs HTTPS.
    expect(card(page, 'networkquality').get('[data-testid="about-https-note"]').text()).toContain('This page is not served over HTTPS.')

    vi.mocked(getInfo).mockResolvedValueOnce(infoFixture())
    await alert.get('button').trigger('click')
    await flushPromises()
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(page.get('[data-testid="about-version"]').text()).toContain('0.1.0 · a1b2c3d · Sep 30, 2026')
    expect(page.get('[data-testid="about-server"]').text()).toContain('Basement NAS')
    page.unmount()
  })

  it('says the operator can enable each layer that is off, with no snippet', async () => {
    const page = await answered()
    for (const layer of LAYERS) {
      expect(card(page, layer).text()).toContain(OFF)
      expect(card(page, layer).text()).toContain('Off')
      expect(card(page, layer).text()).not.toContain('Not confirmed')
    }
    expect(card(page, 'openspeedtest').text()).toContain("so an OpenSpeedTest UI can't test against this server.")
    expect(card(page, 'librespeed').text()).toContain("so librespeed-cli can't test against this server.")
    expect(card(page, 'networkquality').text()).toContain("so networkQuality -C can't use this server.")
    expect(page.find('pre').exists()).toBe(false)
    page.unmount()
  })

  it.each(LAYERS)('shows the %s snippets only when its flag is on', async (layer) => {
    const page = await answered(infoFixture({ compat: { [layer]: true } }))
    for (const other of LAYERS) {
      expect(card(page, other).find('pre').exists()).toBe(other === layer)
      expect(card(page, other).text().includes(OFF)).toBe(other !== layer)
    }
    const expected = {
      openspeedtest: [`https://ost.example.lan/?Host=${ORIGIN}`],
      librespeed: [expect.stringContaining('"name": "Basement NAS",'), 'librespeed-cli --local-json bitgauge.json --server 1 --no-icmp --chunks 8 --json', `librespeed-cli --server-json ${ORIGIN}/.well-known/librespeed --server 1 --no-icmp`],
      networkquality: [`networkQuality -C ${ORIGIN}/nq/config`, `networkQuality -C ${ORIGIN}/nq/config -v      # verbose, per-flow detail`],
    }[layer]
    expect(blocks(page, layer)).toEqual(expected)
    if (layer === 'openspeedtest') {
      expect(card(page, layer).text()).toContain('The results link in the OpenSpeedTest UI contacts OpenSpeedTest, not this server.')
    }
    if (layer === 'networkquality') {
      expect(card(page, layer).find('[data-testid="about-https-note"]').exists()).toBe(true)
    }
    page.unmount()
  })

  it('links the source, the license and the methodology, and summarizes the metrics', async () => {
    const page = await answered()
    const hrefs = page.findAll('a').map((link) => link.attributes('href'))
    expect(hrefs).toEqual(expect.arrayContaining([links.source, links.license, links.methodology]))
    expect(page.text()).toContain('This server can answer the LibreSpeed and OpenSpeedTest protocols')
    expect(page.text()).toContain('then again under load — the increase sets the bufferbloat grade.')
    expect(page.text()).not.toContain('Other clients arrive in v0.3')
    // Credits live in the README, not on the screen.
    expect(page.text()).not.toContain('Credits')
    page.unmount()
  })

  it('says the history, like every result, lives only in the browser', async () => {
    const page = await answered()
    expect(page.text()).toContain('The server keeps no results — history lives only in your browser.')
    page.unmount()
  })
})
