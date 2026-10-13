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

// The first load (ui/flows.md section 1, edge-cases.md section 20): a page that is not on a fixed
// route under the base path, or a server that reports another base path, shows the base-path error
// and nothing else; a page that passes loads the application.

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getInfo } from '@/api/info'
import App from '@/App.vue'
import { links } from '@/lib/links'
import { infoFixture } from '@/test/fixtures'
import { mountApp } from '@/test/mount'

vi.mock('@/api/info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/info')>()),
  getInfo: vi.fn(),
}))

/** The page as the server wrote it, opened at `pathname`. */
function page(basePath: string, pathname: string): void {
  document.head.querySelector('meta[name="bitgauge-base-path"]')?.remove()
  const meta = document.createElement('meta')
  meta.name = 'bitgauge-base-path'
  meta.content = basePath
  document.head.append(meta)
  window.history.replaceState(null, '', pathname)
}

class StubWorker extends EventTarget {
  postMessage(): void {}
  terminate(): void {}
}

beforeEach(() => {
  vi.stubGlobal('Worker', StubWorker)
})

afterEach(() => {
  vi.mocked(getInfo).mockReset()
  vi.unstubAllGlobals()
})

describe('the first load', () => {
  it('stops at the error when the page is outside the base path', async () => {
    page('/speed', '/')
    const wrapper = await mountApp(App)
    await flushPromises()
    const error = wrapper.get('main[role="alert"]')
    expect(error.text()).toContain('BitGauge is configured for /speed but this page was served at /.')
    expect(error.get('a').attributes('href')).toBe(links.subPathGuide)
    expect(wrapper.find('header').exists()).toBe(false)
    expect(getInfo).not.toHaveBeenCalled()
  })

  it('stops at the error when the page is on no fixed route under the base path', async () => {
    page('/', '/speed/')
    const wrapper = await mountApp(App)
    await flushPromises()
    expect(wrapper.get('main[role="alert"]').text()).toContain('configured for / but this page was served at /speed/')
    expect(getInfo).not.toHaveBeenCalled()
  })

  it('stops at the error when the server reports another base path', async () => {
    page('/speed', '/speed/about')
    vi.mocked(getInfo).mockResolvedValueOnce(infoFixture({ server: { basePath: '/' } }))
    const wrapper = await mountApp(App, '/about')
    await flushPromises()
    expect(getInfo).toHaveBeenCalledWith('/speed')
    const error = wrapper.get('main[role="alert"]')
    expect(error.text()).toContain("served for the base path /speed, but the server's API reports /.")
    expect(error.text()).not.toContain('this page was served at')
    expect(error.text()).toContain('Base path reported by the API')
  })

  it('loads the application when everything agrees', async () => {
    page('/speed/', '/speed/')
    vi.mocked(getInfo).mockResolvedValueOnce(infoFixture({ server: { basePath: '/speed' } }))
    const wrapper = await mountApp(App)
    await flushPromises()
    expect(wrapper.find('main[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="server"]').text()).toContain('Basement NAS')
  })
})
