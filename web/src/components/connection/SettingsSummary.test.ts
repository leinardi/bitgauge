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

// The settings summary: the preset line when nothing differs from the server defaults, otherwise
// one chip per changed setting; never an Edit link in v0.1 (ui/screens.md section 1).

import { describe, expect, it } from 'vitest'

import SettingsSummary from '@/components/connection/SettingsSummary.vue'
import type { TestSettings } from '@/engine/messages'
import { settingsFromDefaults } from '@/lib/defaults'
import { infoFixture } from '@/test/fixtures'
import { mountApp } from '@/test/mount'

const DEFAULTS = settingsFromDefaults(infoFixture().defaults) as TestSettings

async function summary(settings: TestSettings, defaults = DEFAULTS) {
  const wrapper = await mountApp(SettingsSummary, '/', { props: { settings, defaults } })
  return wrapper
}

describe('the settings summary', () => {
  it('reads the preset, stream mode and cap when nothing differs', async () => {
    const wrapper = await summary(DEFAULTS)
    expect(wrapper.text()).toBe('Standard preset · Auto streams · No data cap')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it.each([
    [{ ...DEFAULTS, preset: 'quick', streams: { ...DEFAULTS.streams, mode: 'fixed', fixed: 1 }, dataCapBytes: 1_500_000_000 }, 'Quick preset · 1 stream · Cap 1.5 GB'],
    [{ ...DEFAULTS, preset: 'extended', streams: { ...DEFAULTS.streams, mode: 'single' } }, 'Extended preset · Single stream · No data cap'],
  ] as const)('reads other defaults the same way', async (settings, line) => {
    const wrapper = await summary(settings as TestSettings, settings as TestSettings)
    expect(wrapper.text()).toBe(line)
  })

  it('shows one chip per changed setting', async () => {
    const settings: TestSettings = { ...DEFAULTS, preset: 'extended', streams: { mode: 'fixed', fixed: 4, max: 6 }, dataCapBytes: 500_000_000, units: 'bytes' }
    const wrapper = await summary(settings)
    const chips = wrapper.findAll('span.rounded-full').map((chip) => chip.text())
    expect(chips).toEqual(['Extended', '4 streams', 'Cap 500 MB', 'Units · MB/s'])
    expect(wrapper.text()).toContain('4 changed:')
  })

  it('leaves out what did not change', async () => {
    const wrapper = await summary({ ...DEFAULTS, units: 'bytes' })
    expect(wrapper.findAll('span.rounded-full').map((chip) => chip.text())).toEqual(['Units · MB/s'])
    expect(wrapper.text()).toContain('1 changed:')
  })
})
