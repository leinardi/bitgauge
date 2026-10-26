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

// The Theme field under a `theme` URL parameter (ui/screens.md section 4, flows.md section 9): it
// shows the theme in effect, the parameter's over the stored one, and choosing the stored one
// stores and applies it. Each test loads the page afresh, since the URL applies once per page load.

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { getInfo } from '@/api/info'
import { infoFixture } from '@/test/fixtures'

vi.mock('@/api/info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/info')>()),
  getInfo: vi.fn(),
}))

async function load(search: string) {
  window.history.replaceState(null, '', `/settings${search}`)
  vi.resetModules()
  vi.mocked(getInfo).mockResolvedValue(infoFixture())
  const { useInfo } = await import('@/composables/useInfo')
  await useInfo().refresh()
  const { mountApp } = await import('@/test/mount')
  const { default: SettingsPage } = await import('@/pages/SettingsPage.vue')
  const page = await mountApp(SettingsPage, `/settings${search}`, { attachTo: document.body })
  await flushPromises()
  return page
}

const checked = (page: Awaited<ReturnType<typeof load>>) =>
  page
    .findAll('[role="radiogroup"][aria-label="Theme"] [role="radio"]')
    .filter((radio) => radio.attributes('aria-checked') === 'true')
    .map((radio) => radio.text())

// The page's module graph, transformed once, so the test does not pay for the cold import within its timeout.
beforeAll(async () => {
  await import('@/pages/SettingsPage.vue')
}, 60_000)

afterEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/')
})

describe('the Theme field under ?theme=', () => {
  it('shows the theme in effect, and stores the one chosen', async () => {
    localStorage.setItem('bitgauge.settings.v1', JSON.stringify({ theme: 'light' }))
    const page = await load('?theme=dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(checked(page)).toEqual(['Dark'])

    await page.findAll('[role="radiogroup"][aria-label="Theme"] [role="radio"]').find((radio) => radio.text() === 'Light')?.trigger('click')
    await flushPromises()
    expect(checked(page)).toEqual(['Light'])
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(JSON.parse(localStorage.getItem('bitgauge.settings.v1') ?? '{}')).toMatchObject({ theme: 'light' })
    page.unmount()
  })
})
