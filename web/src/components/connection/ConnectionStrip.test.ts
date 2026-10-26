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

  it('shows an operator label from server.labels as the server wrote it', async () => {
    const info = infoFixture({ client: { addressClass: 'private', ip: '10.8.0.7', ipVersion: 4, suggestedLabel: 'WireGuard' } })
    const wrapper = await mountApp(ConnectionStrip, '/', { props: { info }, attachTo: document.body })
    expect(wrapper.get('[data-testid="context-label"]').text()).toBe('WireGuard')
    expect(wrapper.get('[data-testid="context-label"]').attributes('aria-label')).toBe('Context: WireGuard, suggested')
    expect(useContextLabel({ value: 'WireGuard' } as never).label.value).toBe('WireGuard')
    // The custom field opens only when the user picks Custom.
    expect(wrapper.find('input').exists()).toBe(false)

    const items = await openMenu(wrapper)
    expect(items.map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'true'])
    items[0]?.click()
    await flushPromises()
    expect(wrapper.get('[data-testid="context-label"]').text()).toBe('LAN')
    wrapper.unmount()
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
    ['suggested', '', 'WireGuard', 'WireGuard'],
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
    expect(wrapper.get('[data-testid="connection-streams"]').text()).toMatch(/—\s*auto$/)
  })

  it('show the run protocol by its label and live stream count when given', async () => {
    const wrapper = await mountApp(ConnectionStrip, '/', { props: { info: infoFixture(), protocol: 'h2', streams: 4 } })
    expect(wrapper.get('[data-testid="connection-protocol"]').text()).toMatch(/HTTP\/2$/)
    expect(wrapper.get('[data-testid="connection-streams"]').text()).toMatch(/4\s*auto$/)
    const after = await mountApp(ConnectionStrip, '/', { props: { info: infoFixture(), protocol: 'http/1.1', streams: 4, plateau: 'cap' } })
    expect(after.get('[data-testid="connection-protocol"]').text()).toMatch(/HTTP\/1\.1$/)
    expect(after.get('[data-testid="connection-streams"]').text()).toMatch(/4\s*auto · plateau: cap$/)
    const unreported = await mountApp(ConnectionStrip, '/', { props: { info: infoFixture(), protocol: 'unknown' } })
    expect(unreported.get('[data-testid="connection-protocol"]').text()).toMatch(/—\s*not reported/)
  })

  it('hold the count to the HTTP/1.1 probe reservation and name it as the plateau', async () => {
    const auto = await mountApp(ConnectionStrip, '/', { props: { info: infoFixture(), protocol: 'http/1.1', streams: 5, plateau: 'cap', reserved: 5 } })
    expect(auto.get('[data-testid="connection-streams"]').text()).toMatch(/5\s*auto · plateau: HTTP\/1\.1 probe reservation$/)
    const info = infoFixture()
    const fixed = await mountApp(ConnectionStrip, '/', { props: { info: { ...info, defaults: { ...info.defaults, streams: { mode: 'fixed', fixed: 6 } } }, reserved: 5 } })
    expect(fixed.get('[data-testid="connection-streams"]').text()).toMatch(/5\s*fixed$/)
    // A server cap below the reserved one is a plain cap.
    const server = await mountApp(ConnectionStrip, '/', { props: { info: infoFixture(), streams: 3, plateau: 'cap', reserved: 5 } })
    expect(server.get('[data-testid="connection-streams"]').text()).toMatch(/3\s*auto · plateau: cap$/)
  })

  it("show the run's stream mode over the server's", async () => {
    const fixed = await mountApp(ConnectionStrip, '/', { props: { info: infoFixture(), configured: { mode: 'fixed', fixed: 4, max: 6 } } })
    expect(fixed.get('[data-testid="connection-streams"]').text()).toMatch(/4\s*fixed$/)
    const single = await mountApp(ConnectionStrip, '/', { props: { info: infoFixture(), configured: { mode: 'single', fixed: 4, max: 6 } } })
    expect(single.get('[data-testid="connection-streams"]').text()).toMatch(/1\s*single$/)
    const info = infoFixture()
    const auto = await mountApp(ConnectionStrip, '/', { props: { info: { ...info, defaults: { ...info.defaults, streams: { mode: 'fixed', fixed: 3 } } }, configured: { mode: 'auto', fixed: 3, max: 6 } } })
    expect(auto.get('[data-testid="connection-streams"]').text()).toMatch(/—\s*auto$/)
  })

  it('show dashes without the server info', async () => {
    const wrapper = await mountApp(ConnectionStrip, '/', { props: { info: null } })
    expect(wrapper.get('[data-testid="context-label"]').text()).toBe('—')
    expect(wrapper.get('[data-testid="connection-ip"]').text()).toBe('Client IP—')
    expect(wrapper.get('[data-testid="connection-streams"]').text()).toBe('Streams—')
  })
})
