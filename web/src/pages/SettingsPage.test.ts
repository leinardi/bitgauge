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

// The Settings screen (ui/screens.md section 4): presets with Continuous disabled, each valid change
// saved as it is made, an invalid one kept in its field and not saved without moving the focus, the
// changed list with its resets, Reset all after confirmation, and the shareable link.

import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { getInfo } from '@/api/info'
import { useInfo } from '@/composables/useInfo'
import { useSettings } from '@/composables/useSettings'
import SettingsPage from '@/pages/SettingsPage.vue'
import { infoFixture } from '@/test/fixtures'
import { mountApp } from '@/test/mount'

vi.mock('@/api/info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/info')>()),
  getInfo: vi.fn(),
}))

function stored(): unknown {
  return JSON.parse(localStorage.getItem('bitgauge.settings.v1') ?? '{}')
}

async function open() {
  const page = await mountApp(SettingsPage, '/settings', { attachTo: document.body })
  await flushPromises()
  return page
}

beforeAll(async () => {
  vi.mocked(getInfo).mockResolvedValue(infoFixture())
  await useInfo().refresh()
})

beforeEach(() => {
  localStorage.clear()
  useSettings().resetAll()
  localStorage.clear()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the presets', () => {
  it('describe each preset, mark the default, and keep Continuous disabled', async () => {
    const page = await open()
    expect(page.get('[data-testid="preset-quick"]').text()).toContain('Fixed 3 streams · 5–10 s per direction · 10 pings')
    expect(page.get('[data-testid="preset-standard"]').text()).toContain('Default')
    expect(page.get('[data-testid="preset-standard"]').attributes('aria-checked')).toBe('true')
    const continuous = page.get('[data-testid="preset-continuous"]')
    expect(continuous.attributes('disabled')).toBeDefined()
    expect(continuous.text()).toContain('v0.3')
    await continuous.trigger('click')
    expect(stored()).toEqual({})
    page.unmount()
  })

  it('store the chosen preset, and the durations follow it', async () => {
    const page = await open()
    await page.get('[data-testid="preset-extended"]').trigger('click')
    expect(stored()).toEqual({ preset: 'extended' })
    expect((page.get('#settings-download-max').element as HTMLInputElement).value).toBe('40')
    expect(page.get('[data-testid="changed-preset"]').text()).toContain('default Standard')
    page.unmount()
  })
})

describe('a typed value', () => {
  it('is saved when valid, and shown as changed with its reset', async () => {
    const page = await open()
    const max = page.get('#settings-download-max')
    await max.setValue('30')
    await max.trigger('blur')
    expect(stored()).toEqual({ download: { minMs: 10_000, maxMs: 30_000 } })
    const entry = page.get('[data-testid="changed-download"]')
    expect(entry.text()).toContain('10–30 s')
    expect(entry.text()).toContain('default 10–20 s')
    await entry.get('button').trigger('click')
    expect(stored()).toEqual({})
    expect((max.element as HTMLInputElement).value).toBe('20')
    page.unmount()
  })

  it('is not saved when invalid, with its error, and the focus goes where the user puts it', async () => {
    const page = await open()
    const max = page.get('#settings-download-max')
    const next = page.get('#settings-upload-min')
    ;(max.element as HTMLInputElement).focus()
    await max.setValue('700')
    await max.trigger('keydown', { key: 'Enter' })
    expect(document.activeElement).toBe(max.element)
    expect(max.attributes('aria-invalid')).toBe('true')
    const error = page.get(`#${max.attributes('aria-describedby')}`)
    expect(error.text()).toBe('Enter whole seconds from 5 s to 10 min (600 s). Not saved · Esc restores 20 s.')
    expect(page.get('[role="status"]').text()).toBe('1 value not saved')
    // Tab leaves the field as usual: nothing pulls the focus back.
    ;(next.element as HTMLInputElement).focus()
    await max.trigger('blur')
    expect(document.activeElement).toBe(next.element)
    expect(stored()).toEqual({})

    await max.setValue('5')
    await max.trigger('keydown', { key: 'Enter' })
    expect(page.get(`#${max.attributes('aria-describedby')}`).text()).toContain('Must be at least the minimum (10 s).')
    await max.trigger('keydown', { key: 'Escape' })
    expect((max.element as HTMLInputElement).value).toBe('20')
    expect(max.attributes('aria-invalid')).toBeUndefined()
    expect(page.get('[role="status"]').text()).toBe('Saved')
    expect(stored()).toEqual({})
    page.unmount()
  })
})

describe('the changed list', () => {
  it('resets all after confirmation, keeping fields this version does not know', async () => {
    localStorage.setItem('bitgauge.settings.v1', JSON.stringify({ future: 1 }))
    const page = await open()
    await page.get('[data-testid="preset-quick"]').trigger('click')
    await page.findAll('button').find((button) => button.text() === 'Reset all to defaults')?.trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.body).get('[role="alertdialog"]')
    expect(dialog.text()).toContain('1 setting returns to its default: Preset.')
    await dialog.findAll('button').find((button) => button.text() === 'Reset all')?.trigger('click')
    await flushPromises()
    expect(stored()).toEqual({ future: 1 })
    expect(page.text()).toContain('Everything is at its default.')
    page.unmount()
  })
})

describe('the shareable link', () => {
  it('carries what differs and names what it cannot', async () => {
    const page = await open()
    await page.get('[data-testid="preset-quick"]').trigger('click')
    // Advanced is collapsed by default.
    expect(page.find('#settings-pings').exists()).toBe(false)
    await page.findAll('button').find((button) => button.text().startsWith('Advanced'))?.trigger('click')
    const pings = page.get('#settings-pings')
    await pings.setValue('30')
    await pings.trigger('blur')
    expect((page.get('[data-testid="share-url"]').element as HTMLInputElement).value).toBe(`${window.location.origin}/?preset=quick`)
    expect(page.get('[data-testid="not-in-link"]').text()).toBe('Not in the link: Ping count')
    page.unmount()
  })
})

describe('defaults this version cannot run', () => {
  it('say so instead of loading for good', async () => {
    const info = infoFixture()
    vi.mocked(getInfo).mockResolvedValueOnce({ ...info, defaults: { ...info.defaults, preset: 'continuous' } })
    await useInfo().refresh()
    const page = await open()
    expect(page.text()).toContain("The server's default preset can't run in this version")
    expect(page.find('[data-testid="preset-quick"]').exists()).toBe(false)
    page.unmount()
    await useInfo().refresh()
  })
})
