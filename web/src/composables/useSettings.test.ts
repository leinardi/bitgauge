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

// The user's settings (frontend.md section 4): sparse storage shared with the theme, the resets,
// and the effective settings of a page load, URL over stored over server defaults
// (ui/url-params.md section 1).

import { describe, expect, it } from 'vitest'

import { createSettings, effectiveSettings } from '@/composables/useSettings'
import { createTheme } from '@/composables/useTheme'
import { parseUrlParams } from '@/composables/useUrlParams'
import type { TestSettings } from '@/engine/messages'
import { settingsFromDefaults } from '@/lib/defaults'
import { SETTINGS_KEY, type SettingsStorage } from '@/lib/settingsStorage'
import { infoFixture } from '@/test/fixtures'

const DEFAULTS = settingsFromDefaults(infoFixture().defaults) as TestSettings

function memory(initial: unknown = undefined): SettingsStorage & { value: () => unknown } {
  let raw = initial === undefined ? null : JSON.stringify(initial)
  return {
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value
    },
    value: () => (raw === null ? null : JSON.parse(raw)),
  }
}

function settingsOver(storage: SettingsStorage) {
  const theme = createTheme({
    storage,
    matchMedia: () => ({ matches: false, addEventListener: () => undefined }) as unknown as MediaQueryList,
    root: document.createElement('html'),
  })
  return { theme, settings: createSettings({ storage, theme }) }
}

describe('the stored settings', () => {
  it('stores only the fields that differ, next to the theme and unknown fields', () => {
    const storage = memory({ theme: 'dark', future: 1 })
    const { settings } = settingsOver(storage)
    settings.set({ preset: 'extended', pingCount: 50, units: 'bytes' }, DEFAULTS)
    expect(storage.value()).toEqual({ theme: 'dark', future: 1, preset: 'extended', units: 'bytes' })
    expect(settings.stored.value).toEqual({ preset: 'extended', units: 'bytes', theme: 'dark' })
    expect(settings.saved.value).toBe(true)
  })

  it('sets and resets the theme through the theme', () => {
    const storage = memory()
    const { theme, settings } = settingsOver(storage)
    settings.set({ theme: 'light' }, DEFAULTS)
    expect(theme.choice.value).toBe('light')
    expect(storage.value()).toEqual({ theme: 'light' })
    settings.set({ units: 'bytes' }, DEFAULTS)
    // The header's choice is the same stored field.
    theme.setTheme('dark')
    expect(settings.stored.value).toEqual({ units: 'bytes', theme: 'dark' })
    settings.reset(['theme'], DEFAULTS)
    expect(theme.choice.value).toBe('system')
    expect(storage.value()).toEqual({ units: 'bytes' })
  })

  it('resets a field and what then equals its default', () => {
    const storage = memory()
    const { settings } = settingsOver(storage)
    settings.set({ preset: 'quick', pingCount: 20 }, DEFAULTS)
    expect(storage.value()).toEqual({ preset: 'quick', pingCount: 20 })
    // Without Quick, 20 pings is the Standard default again.
    settings.reset(['preset'], DEFAULTS)
    expect(storage.value()).toEqual({})
  })

  it('resets all, leaving the fields this version does not know', () => {
    const storage = memory({ theme: 'light', future: 'kept', units: 'bytes', label: 'VPN' })
    const { theme, settings } = settingsOver(storage)
    settings.resetAll()
    expect(storage.value()).toEqual({ future: 'kept' })
    expect(theme.choice.value).toBe('system')
    expect(settings.stored.value).toEqual({})
  })

  it('keeps a change for the page when the browser refuses it', () => {
    const storage: SettingsStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    }
    const { settings } = settingsOver(storage)
    settings.set({ units: 'bytes' }, DEFAULTS)
    expect(settings.stored.value).toEqual({ units: 'bytes' })
    expect(settings.saved.value).toBe(false)
    expect(SETTINGS_KEY).toBe('bitgauge.settings.v1')
  })
})

describe('the effective settings', () => {
  it('apply the stored settings over the server defaults', () => {
    const { settings, override, ignored } = effectiveSettings(parseUrlParams(''), DEFAULTS, { preset: 'extended', streams: { mode: 'fixed', fixed: 4 } })
    expect(settings).toMatchObject({ preset: 'extended', streams: { mode: 'fixed', fixed: 4, max: 6 }, download: { minMs: 20_000, maxMs: 40_000 }, pingCount: 50 })
    expect(override).toEqual({})
    expect(ignored).toEqual([])
  })

  it('let the URL parameters win over the stored settings', () => {
    const { settings, override } = effectiveSettings(parseUrlParams('?streams=2&units=bits&test=upload'), DEFAULTS, {
      streams: { mode: 'single', fixed: 3 },
      units: 'bytes',
      phases: ['upload', 'download'],
    })
    expect(settings.units).toBe('bytes')
    expect(override).toEqual({ streams: { mode: 'fixed', fixed: 2, max: 6 }, units: 'bits', phases: ['idle', 'upload'] })
  })

  it('check a fixed URL stream count against the server maximum', () => {
    const { override, ignored } = effectiveSettings(parseUrlParams('?streams=6'), { ...DEFAULTS, streams: { ...DEFAULTS.streams, max: 4 } }, {})
    expect(override).toEqual({})
    expect(ignored).toEqual([{ parameter: 'streams', value: '6' }])
  })
})
