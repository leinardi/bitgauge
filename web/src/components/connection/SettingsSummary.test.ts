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
// one chip per changed setting; and the Edit link to the Settings screen (ui/screens.md section 1).

import { describe, expect, it } from 'vitest'

import SettingsSummary from '@/components/connection/SettingsSummary.vue'
import type { TestSettings } from '@/engine/messages'
import { settingsFromDefaults } from '@/lib/defaults'
import { storedOver } from '@/lib/settingsStorage'
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
    expect(wrapper.get('[data-testid="settings-line"]').text()).toBe('Standard preset · Auto streams · No data cap')
  })

  it.each([
    [{ ...DEFAULTS, preset: 'quick', streams: { ...DEFAULTS.streams, mode: 'fixed', fixed: 1 }, dataCapBytes: 1_500_000_000 }, 'Quick preset · 1 stream · Cap 1.5 GB'],
    [{ ...DEFAULTS, preset: 'extended', streams: { ...DEFAULTS.streams, mode: 'single' } }, 'Extended preset · Single stream · No data cap'],
  ] as const)('reads other defaults the same way', async (settings, line) => {
    const wrapper = await summary(settings as TestSettings, settings as TestSettings)
    expect(wrapper.get('[data-testid="settings-line"]').text()).toBe(line)
  })

  it('shows one chip per changed setting', async () => {
    const settings: TestSettings = { ...storedOver(DEFAULTS, { preset: 'extended' }), streams: { mode: 'fixed', fixed: 4, max: 6 }, dataCapBytes: 500_000_000, units: 'bytes' }
    const wrapper = await summary(settings)
    const chips = wrapper.findAll('span.rounded-full').map((chip) => chip.text())
    expect(chips).toEqual(['Extended', '4 streams', 'Cap 500 MB', 'Units · MB/s'])
    expect(wrapper.text()).toContain('4 changed:')
  })

  it("counts a preset's own durations, streams and pings as no change", async () => {
    const wrapper = await summary(storedOver(DEFAULTS, { preset: 'quick' }))
    expect(wrapper.findAll('span.rounded-full').map((chip) => chip.text())).toEqual(['Quick'])
  })

  it.each([
    [{ phases: ['idle', 'upload'] }, 'Phases · Latency, Upload'],
    [{ download: { minMs: 5000, maxMs: 60_000 } }, 'Download 5–60 s'],
    [{ upload: { minMs: 8000, maxMs: 20_000 } }, 'Upload 8–20 s'],
    [{ warmup: 5000 }, 'Warm-up 5 s'],
    [{ pingCount: 30 }, '30 pings'],
    [{ overheadCompensationPercent: 5 }, 'Overhead +5 %'],
  ] as const)('shows a chip for %o', async (change, chip) => {
    const wrapper = await summary({ ...DEFAULTS, ...change } as TestSettings)
    expect(wrapper.findAll('span.rounded-full').map((part) => part.text())).toEqual([chip])
  })

  it('shows the Continuous phases when idle latency is off', async () => {
    const continuous = storedOver(DEFAULTS, { preset: 'continuous' })
    const wrapper = await summary({ ...continuous, phases: ['download'] })
    expect(wrapper.findAll('span.rounded-full').map((chip) => chip.text())).toEqual(['Continuous', 'Phases · Download'])
  })

  it('shows the Continuous direction and run length, and no durations or phases', async () => {
    const continuous = storedOver(DEFAULTS, { preset: 'continuous' })
    const wrapper = await summary({ ...continuous, continuousDirection: 'upload', runLengthMs: 3_600_000, phases: ['idle', 'download'] })
    expect(wrapper.findAll('span.rounded-full').map((chip) => chip.text())).toEqual(['Continuous', 'Direction · Upload', 'Run length 1 h'])
  })

  it('links to the Settings screen, changed or not', async () => {
    for (const settings of [DEFAULTS, { ...DEFAULTS, units: 'bytes' as const }]) {
      const link = (await summary(settings)).get('a')
      expect(link.text()).toBe('Edit')
      expect(link.attributes('href')).toBe('/settings')
      expect(link.attributes('aria-label')).toBe('Edit settings')
    }
  })

  it('leaves out what did not change', async () => {
    const wrapper = await summary({ ...DEFAULTS, units: 'bytes' })
    expect(wrapper.findAll('span.rounded-full').map((chip) => chip.text())).toEqual(['Units · MB/s'])
    expect(wrapper.text()).toContain('1 changed:')
  })
})
