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

// Continuous on the Settings screen (ui/screens.md section 4, kit Settings.jsx): its direction and
// its optional run length in the preset's box, the durations gone and of the phases only idle
// latency to toggle; the direction stored only when it differs, the run length as whole seconds
// with its display rule, both in the changed list and the shareable link.

import { DOMWrapper, flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { getInfo } from '@/api/info'
import { useInfo } from '@/composables/useInfo'
import { useSettings } from '@/composables/useSettings'
import { settingsFromDefaults } from '@/lib/defaults'
import type { StoredSettings } from '@/lib/settingsStorage'
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

async function open(initial: StoredSettings = {}): Promise<VueWrapper> {
  useSettings().set(initial, settingsFromDefaults(infoFixture().defaults))
  const page = await mountApp(SettingsPage, '/settings', { attachTo: document.body })
  await flushPromises()
  return page
}

/** Picks a run length unit from its menu. */
async function pick(page: VueWrapper, unit: string): Promise<void> {
  await page.get('[data-testid="run-length-unit"]').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  await new DOMWrapper(document.body).get(`[data-testid="run-length-unit-${unit}"]`).trigger('click')
  await flushPromises()
}

const button = (page: VueWrapper, text: string) => page.findAll('[data-testid="continuous-fields"] button').find((item) => item.text() === text)

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

describe('the Continuous preset', () => {
  it('shows its direction and run length in place of the durations, and only idle latency of the phases', async () => {
    const page = await open()
    await page.get('[data-testid="preset-continuous"]').trigger('click')
    const fields = page.get('[data-testid="continuous-fields"]')
    expect(fields.text()).toContain('Continuous measures one direction until you stop it.')
    expect(fields.text()).toContain('No limit')
    expect(page.find('#settings-download-min').exists()).toBe(false)
    const toggles = page.findAll('[role="group"] button[role="checkbox"]')
    expect(toggles.map((toggle) => [toggle.text(), toggle.attributes('disabled') !== undefined])).toEqual([
      ['Latency', false],
      ['Download', true],
      ['Upload', true],
    ])
    expect(page.text()).toContain('Continuous runs the one direction chosen above.')
    expect(page.find('[aria-label="Phase order"]').exists()).toBe(false)
    page.unmount()
  })

  it('stores upload as its direction, download only over another stored value, and links it as test=upload', async () => {
    const page = await open({ preset: 'continuous' })
    await button(page, 'Upload')?.trigger('click')
    expect(stored()).toEqual({ preset: 'continuous', continuousDirection: 'upload' })
    expect(page.get('[data-testid="changed-continuousDirection"]').text()).toContain('default Download')
    expect((page.get('[data-testid="share-url"]').element as HTMLInputElement).value).toBe(`${window.location.origin}/?test=upload&preset=continuous`)
    await button(page, 'Download')?.trigger('click')
    expect(stored()).toEqual({ preset: 'continuous' })
    page.unmount()
  })

  it('takes a run length once switched on: empty means none, a whole number of hours by default, 1 minute to 7 days', async () => {
    const page = await open({ preset: 'continuous' })
    await page.get('[aria-label="Stop after a set time"]').trigger('click')
    const input = page.get('#settings-run-length')
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(input.attributes('placeholder')).toBe('none')
    expect(page.get('[data-testid="run-length-unit"]').attributes('data-unit')).toBe('hours')
    expect(page.get('[data-testid="run-length-unit"]').text()).toBe('hours')
    expect(stored()).toEqual({ preset: 'continuous' })

    await input.setValue('200')
    await input.trigger('blur')
    expect(page.get('#settings-run-length-error').text()).toBe('Run length must be 1 minute to 7 days. Not saved · Esc restores no run length.')
    expect(stored()).toEqual({ preset: 'continuous' })
    await input.setValue('2')
    await input.trigger('blur')
    expect(stored()).toEqual({ preset: 'continuous', runLengthS: 7200 })
    expect(page.get('[data-testid="changed-runLengthS"]').text()).toContain('2 h')
    expect((page.get('[data-testid="share-url"]').element as HTMLInputElement).value).toBe(`${window.location.origin}/?preset=continuous&duration=7200`)
    // A stored value is restored with the unit the field shows.
    await input.setValue('200')
    await input.trigger('blur')
    expect(page.get('#settings-run-length-error').text()).toBe('Run length must be 1 minute to 7 days. Not saved · Esc restores 2 h.')
    await input.trigger('keydown', { key: 'Escape' })

    // Switched off, it clears.
    await page.get('[aria-label="Stop after a set time"]').trigger('click')
    expect(stored()).toEqual({ preset: 'continuous' })
    expect(page.get('[data-testid="continuous-fields"]').text()).toContain('No limit')
    page.unmount()
  })

  it('keeps the number when the unit changes, within the unit’s range', async () => {
    const page = await open({ preset: 'continuous', runLengthS: 7200 })
    await pick(page, 'minutes')
    expect(stored()).toEqual({ preset: 'continuous', runLengthS: 120 })
    expect((page.get('#settings-run-length').element as HTMLInputElement).value).toBe('2')
    await page.get('#settings-run-length').setValue('30')
    await page.get('#settings-run-length').trigger('blur')
    // 30 days is past 7: the longest, 7 days.
    await pick(page, 'days')
    expect(stored()).toEqual({ preset: 'continuous', runLengthS: 604_800 })
    page.unmount()
  })

  it.each([
    [7200, '2', 'hours'],
    [172_800, '2', 'days'],
    [5400, '90', 'minutes'],
    [90, '1.5', 'minutes'],
  ])('shows a stored run length of %d s as %s %s', async (runLengthS, value, unit) => {
    const page = await open({ preset: 'continuous', runLengthS })
    expect((page.get('#settings-run-length').element as HTMLInputElement).value).toBe(value)
    expect(page.get('[data-testid="run-length-unit"]').attributes('data-unit')).toBe(unit)
    page.unmount()
  })

  it('keeps the custom durations stored, unused, and applies them again on a bounded preset', async () => {
    const page = await open({ download: { minMs: 10_000, maxMs: 30_000 } })
    await page.get('[data-testid="preset-continuous"]').trigger('click')
    expect(stored()).toEqual({ download: { minMs: 10_000, maxMs: 30_000 }, preset: 'continuous' })
    expect(page.find('[data-testid="changed-download"]').exists()).toBe(false)
    await page.get('[data-testid="preset-standard"]').trigger('click')
    expect(stored()).toEqual({ download: { minMs: 10_000, maxMs: 30_000 } })
    expect((page.get('#settings-download-max').element as HTMLInputElement).value).toBe('30')
    page.unmount()
  })
})
