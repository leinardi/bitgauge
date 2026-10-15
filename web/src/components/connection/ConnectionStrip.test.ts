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

// The connection info: the suggested label from the address class, editing it, and the facts
// before a run (ui/screens.md section 1, edge-cases.md section 16).

import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import ConnectionStrip from '@/components/connection/ConnectionStrip.vue'
import { resolveLabel, useContextLabel } from '@/composables/useContextLabel'
import { infoFixture } from '@/test/fixtures'
import { mountApp } from '@/test/mount'

afterEach(() => {
  const { choice, custom } = useContextLabel({ value: undefined } as never)
  choice.value = 'suggested'
  custom.value = ''
  document.body.innerHTML = ''
})

async function openMenu(wrapper: Awaited<ReturnType<typeof mountApp>>) {
  await wrapper.get('[data-testid="context-label"]').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
}

describe('the context label', () => {
  it.each([
    ['private', '192.168.1.42', 4, 'LAN', 'LAN', true],
    ['cgnat', '100.101.4.17', 4, 'VPN', 'VPN', true],
    ['ula', 'fd7a:115c:a1e0::5', 6, 'VPN', 'VPN', true],
    ['link-local', 'fe80::1', 6, 'LAN', 'LAN', true],
    ['public', '2001:db8::1', 6, null, 'None', false],
  ] as const)('shows the suggestion for a %s address', async (addressClass, ip, ipVersion, suggestedLabel, chip, hinted) => {
    const info = infoFixture({ client: { addressClass, ip, ipVersion, suggestedLabel } })
    const wrapper = await mountApp(ConnectionStrip, '/', { props: { info } })
    expect(wrapper.get('[data-testid="context-label"]').text()).toBe(chip)
    expect(wrapper.text().includes('suggested')).toBe(hinted)
    // One announcement carries the suggestion; the visible hint is hidden from it.
    expect(wrapper.get('[data-testid="context-label"]').attributes('aria-label')).toBe(hinted ? `Context: ${chip}, suggested` : `Context: ${chip}`)
    expect(wrapper.get('[data-testid="connection-ip"]').text()).toMatch(new RegExp(`${ip.replace(/\./g, '\\.')}\\s*IPv${ipVersion}`))
  })

  it('takes the user choice over the suggestion, including a custom label', async () => {
    const wrapper = await mountApp(ConnectionStrip, '/', { props: { info: infoFixture() }, attachTo: document.body })
    const { label } = useContextLabel({ value: 'LAN' } as never)
    expect(label.value).toBe('LAN')

    let items = await openMenu(wrapper)
    expect(items.map((item) => item.textContent?.trim())).toEqual(['LAN', 'VPN', 'None', 'Custom…'])
    items[1]?.click()
    await flushPromises()
    expect(wrapper.get('[data-testid="context-label"]').text()).toBe('VPN')
    expect(wrapper.text()).not.toContain('suggested')

    items = await openMenu(wrapper)
    items[3]?.click()
    await flushPromises()
    await wrapper.get('input').setValue('  Hotel Wi-Fi ')
    expect(wrapper.get('[data-testid="context-label"]').text()).toBe('Hotel Wi-Fi')
    wrapper.unmount()
  })

  it.each([
    ['suggested', '', 'VPN', 'VPN'],
    ['suggested', '', null, null],
    ['LAN', '', 'VPN', 'LAN'],
    ['none', '', 'LAN', null],
    ['custom', ' Office ', 'LAN', 'Office'],
    ['custom', '   ', 'LAN', null],
  ] as const)('resolves %s with %j over the suggestion %j to %j', (choice, custom, suggested, label) => {
    expect(resolveLabel(choice, custom, suggested)).toBe(label)
  })
})

describe('the facts before a run', () => {
  it('show the configured stream mode and an unreported protocol', async () => {
    const wrapper = await mountApp(ConnectionStrip, '/', { props: { info: infoFixture() } })
    expect(wrapper.get('[data-testid="connection-protocol"]').text()).toMatch(/—\s*not reported/)
    expect(wrapper.get('[data-testid="connection-streams"]').text()).toMatch(/—\s*auto, up to 6/)
  })

  it('show the run protocol and live stream count when given', async () => {
    const wrapper = await mountApp(ConnectionStrip, '/', { props: { info: infoFixture(), protocol: 'HTTP/2', streams: 4 } })
    expect(wrapper.get('[data-testid="connection-protocol"]').text()).toMatch(/HTTP\/2$/)
    expect(wrapper.get('[data-testid="connection-streams"]').text()).toMatch(/4\s*auto, up to 6/)
  })

  it('show dashes without the server info', async () => {
    const wrapper = await mountApp(ConnectionStrip, '/', { props: { info: null } })
    expect(wrapper.get('[data-testid="context-label"]').text()).toBe('—')
    expect(wrapper.get('[data-testid="connection-ip"]').text()).toBe('Client IP—')
    expect(wrapper.get('[data-testid="connection-streams"]').text()).toBe('Streams—')
  })
})
