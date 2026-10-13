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

// The persistent header: the server's name and host with the reachability text, the theme control
// and the v0.1 navigation (ui/screens.md section 1).

import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import type { Info } from '@/api/info'
import AppHeader from '@/components/layout/AppHeader.vue'
import TabBar from '@/components/layout/TabBar.vue'
import { useInfo } from '@/composables/useInfo'
import { mountApp } from '@/test/mount'

const INFO = { server: { name: 'Basement NAS', basePath: '/' } } as Info

const answering = (() => Promise.resolve(new Response(JSON.stringify(INFO)))) as typeof fetch
const failing = (() => Promise.reject(new TypeError('network'))) as typeof fetch

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  localStorage.clear()
})

describe('the header', () => {
  it('shows the server name, the host and the reachability text', async () => {
    const wrapper = await mountApp(AppHeader)
    expect(wrapper.find('[data-testid="server"]').exists()).toBe(false)

    await useInfo().refresh(answering)
    await flushPromises()
    const server = wrapper.get('[data-testid="server"]')
    expect(server.text()).toContain('Basement NAS')
    expect(server.text()).toContain(window.location.host)
    expect(server.get('.sr-only').text()).toBe(', connected')
    expect(server.attributes('title')).toBe('Server connected')
    expect(wrapper.find('[aria-live="polite"]').text()).toBe('')

    await useInfo().refresh(failing)
    await flushPromises()
    expect(server.get('.sr-only').text()).toBe(', unreachable')
    expect(server.text()).toContain('Unreachable')
    expect(wrapper.find('[aria-live="polite"]').text()).toBe('Server unreachable')
  })

  it('switches and persists the theme', async () => {
    const wrapper = await mountApp(AppHeader)
    const light = wrapper.get('[role="radio"][aria-label="Light"]')
    await light.trigger('click')
    expect(light.attributes('aria-checked')).toBe('true')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(JSON.parse(localStorage.getItem('bitgauge.settings.v1') ?? '{}')).toEqual({ theme: 'light' })
  })

  it('navigates to Test and About only, marking the current page', async () => {
    const wrapper = await mountApp(AppHeader, '/about')
    const links = wrapper.get('nav').findAll('a')
    expect(links.map((link) => link.text())).toEqual(['Test', 'About'])
    expect(links[1]?.attributes('aria-current')).toBe('page')
    expect(links[0]?.attributes('aria-current')).toBeUndefined()
  })
})

describe('the tab bar', () => {
  it('shows Test and About', async () => {
    const wrapper = await mountApp(TabBar)
    const links = wrapper.findAll('a')
    expect(links.map((link) => link.text())).toEqual(['Test', 'About'])
    expect(links[0]?.attributes('aria-current')).toBe('page')
  })
})
