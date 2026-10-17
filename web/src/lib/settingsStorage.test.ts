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

// The stored settings (frontend.md section 4, ui/screens.md section 4): what is read and kept, how
// they sit over the server defaults, and which fields count as changed.

import { describe, expect, it } from 'vitest'

import type { TestSettings } from '@/engine/messages'
import { settingsFromDefaults } from '@/lib/defaults'
import { changedKeys, defaultOf, pruned, readStored, SETTINGS_KEY, type SettingsStorage, storedOver, writeStored } from '@/lib/settingsStorage'
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

describe('reading and writing', () => {
  it('applies only the known fields within their ranges', () => {
    const storage = memory({
      theme: 'dark',
      preset: 'continuous',
      phases: ['download', 'idle'],
      streams: { mode: 'fixed', fixed: 4 },
      download: { minMs: 5000, maxMs: 10_000 },
      upload: { minMs: 12_000, maxMs: 10_000 },
      dataCapBytes: 1_500_000,
      units: 'bytes',
      autoStart: { enabled: true, countdownS: 31 },
      pingCount: 30,
      label: 'x'.repeat(65),
      future: 'kept',
    })
    expect(readStored(storage)).toEqual({ theme: 'dark', streams: { mode: 'fixed', fixed: 4 }, download: { minMs: 5000, maxMs: 10_000 }, units: 'bytes', pingCount: 30 })
  })

  it('reads nothing from a malformed value', () => {
    expect(readStored({ getItem: () => '[1]', setItem: () => undefined })).toEqual({})
    expect(readStored({ getItem: () => '{', setItem: () => undefined })).toEqual({})
  })

  it('keeps the fields it does not change, unknown ones and the theme included', () => {
    const storage = memory({ theme: 'light', future: { a: 1 }, units: 'bytes' })
    expect(writeStored(storage, { pingCount: 50 }, ['units'])).toBe(true)
    expect(storage.value()).toEqual({ theme: 'light', future: { a: 1 }, pingCount: 50 })
  })

  it('reports a refused write', () => {
    const storage: SettingsStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(writeStored(storage, { units: 'bytes' })).toBe(false)
    expect(SETTINGS_KEY).toBe('bitgauge.settings.v1')
  })
})

describe('the stored settings over the server defaults', () => {
  it('brings a stored preset with its stream mode, durations and ping count', () => {
    expect(storedOver(DEFAULTS, { preset: 'quick' })).toEqual({
      ...DEFAULTS,
      preset: 'quick',
      streams: { mode: 'fixed', fixed: 3, max: 6 },
      download: { minMs: 5000, maxMs: 10_000 },
      upload: { minMs: 5000, maxMs: 10_000 },
      pingCount: 10,
    })
  })

  it('lets the other stored fields win over the preset', () => {
    const settings = storedOver(DEFAULTS, { preset: 'extended', download: { minMs: 7000, maxMs: 9000 }, pingCount: 12, dataCapBytes: 2_000_000 })
    expect(settings.download).toEqual({ minMs: 7000, maxMs: 9000 })
    expect(settings.upload).toEqual({ minMs: 20_000, maxMs: 40_000 })
    expect(settings.pingCount).toBe(12)
    expect(settings.dataCapBytes).toBe(2_000_000)
  })

  it('keeps the server stream maximum and leaves out a fixed mode whose count is above it', () => {
    const small = { ...DEFAULTS, streams: { ...DEFAULTS.streams, max: 2 } }
    expect(storedOver(small, { streams: { mode: 'fixed', fixed: 2 } }).streams).toEqual({ mode: 'fixed', fixed: 2, max: 2 })
    expect(storedOver(small, { streams: { mode: 'fixed', fixed: 4 } }).streams).toEqual(small.streams)
    expect(storedOver(small, { preset: 'quick' }).streams).toEqual({ mode: 'fixed', fixed: 2, max: 2 })
    // Another mode stays, its count within the maximum.
    expect(storedOver(small, { streams: { mode: 'single', fixed: 5 } }).streams).toEqual({ mode: 'single', fixed: 2, max: 2 })
  })

  it('shares nothing with the defaults', () => {
    const settings = storedOver(DEFAULTS, {})
    settings.phases.push('idle')
    settings.download.minMs = 1
    expect(DEFAULTS.phases).toEqual(['idle', 'download', 'upload'])
    expect(DEFAULTS.download.minMs).toBe(10_000)
  })
})

describe('changed fields', () => {
  it('measures a field against its default under the other stored fields', () => {
    const stored = { preset: 'extended' as const, pingCount: 20 }
    expect(changedKeys(DEFAULTS, stored)).toEqual(['preset', 'pingCount'])
    expect(defaultOf('pingCount', DEFAULTS, stored)).toBe(50)
    expect(defaultOf('preset', DEFAULTS, stored)).toBe('standard')
  })

  it('counts a stream count only for the fixed mode', () => {
    expect(changedKeys(DEFAULTS, { streams: { mode: 'auto', fixed: 5 } })).toEqual([])
    expect(changedKeys(DEFAULTS, { streams: { mode: 'fixed', fixed: 3 } })).toEqual(['streams'])
  })

  it('removes what equals its default, one field at a time', () => {
    expect(pruned(DEFAULTS, { preset: 'standard', pingCount: 20, units: 'bytes', theme: 'system', label: '', lang: 'en' })).toEqual({ units: 'bytes', lang: 'en' })
    // The durations equal Extended's once the preset is Extended.
    expect(pruned(DEFAULTS, { preset: 'extended', download: { minMs: 20_000, maxMs: 40_000 } })).toEqual({ preset: 'extended' })
    expect(pruned(DEFAULTS, { autoStart: { enabled: false, countdownS: 3 } })).toEqual({})
  })
})
