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

// A Settings edit over the URL parameters of the page load (ui/flows.md section 9): each row of
// the governing table, with a `preset` parameter that differs from the stored preset, so the edit
// stores the link's preset with what it brings, holds in the settings a run resolves, and drops
// only the parameters that govern the field.

import { describe, expect, it } from 'vitest'

import { parseUrlParams, urlOverride, type UrlParams } from '@/composables/useUrlParams'
import { resolveSettings, type TestSettings } from '@/engine/messages'
import { settingsFromDefaults } from '@/lib/defaults'
import { applyEdit, linkedKeys, linkedSettings } from '@/lib/settingsEdit'
import { type StoredKey, type StoredSettings, storedOver } from '@/lib/settingsStorage'
import { infoFixture } from '@/test/fixtures'

const DEFAULTS = settingsFromDefaults(infoFixture().defaults)
// The stored preset differs from the link's in every case.
const STORED: StoredSettings = { preset: 'extended' }

/** The settings the next run resolves after the edit, with the dropped parameters gone. */
function after(url: UrlParams, stored: StoredSettings, drop: readonly string[]): TestSettings {
  const left: UrlParams = { ...url }
  const fields: Record<string, keyof UrlParams> = { preset: 'preset', test: 'test', duration: 'durationMs', streams: 'streams', cap: 'dataCapBytes', units: 'units', lang: 'lang', theme: 'theme', label: 'label' }
  drop.forEach((name) => Reflect.deleteProperty(left, fields[name] ?? name))
  const base = storedOver(DEFAULTS, stored)
  const resolved = resolveSettings(base, urlOverride(left, base).override)
  if (!resolved.ok) {
    throw new Error('the run does not resolve')
  }
  return resolved.settings
}

/** The run's settings under the link before any edit. */
function before(url: UrlParams): TestSettings {
  return linkedSettings(DEFAULTS, STORED, url)
}

function edit<K extends StoredKey>(search: string, field: K, value: StoredSettings[K]) {
  const url = parseUrlParams(search)
  const { stored, drop } = applyEdit(DEFAULTS, STORED, url, field, value)
  return { url, stored, drop, run: after(url, stored, drop) }
}

describe('an edit under a preset parameter', () => {
  it('stores the download maximum alone; the other preset values keep the link preset', () => {
    const { url, drop, run } = edit('?preset=quick', 'download', { minMs: 5000, maxMs: 8000 })
    expect(drop).toEqual(['preset'])
    expect(run.preset).toBe('quick')
    expect(run.download).toEqual({ minMs: 5000, maxMs: 8000 })
    expect(run.upload).toEqual(before(url).upload)
    expect(run.pingCount).toBe(before(url).pingCount)
    expect(run.streams).toEqual(before(url).streams)
  })

  it('stores the ping count alone', () => {
    const { url, drop, run } = edit('?preset=quick', 'pingCount', 25)
    expect(drop).toEqual(['preset'])
    expect(run.pingCount).toBe(25)
    expect(run.preset).toBe('quick')
    expect(run.download).toEqual(before(url).download)
    expect(run.streams).toEqual(before(url).streams)
  })

  it('stores the stream count alone, dropping streams and preset', () => {
    const { url, drop, run } = edit('?preset=quick&streams=2&cap=200MB', 'streams', { mode: 'fixed', fixed: 4 })
    expect(drop).toEqual(['streams', 'preset'])
    expect(run.streams.mode).toBe('fixed')
    expect(run.streams.fixed).toBe(4)
    expect(run.pingCount).toBe(before(url).pingCount)
    expect(run.download).toEqual(before(url).download)
    // The cap does not govern streams, so it stays with the link.
    expect(run.dataCapBytes).toBe(200_000_000)
  })

  it('stores the preset, dropping it alone', () => {
    const { drop, run, stored } = edit('?preset=quick&units=bytes', 'preset', 'standard')
    expect(drop).toEqual(['preset'])
    expect(stored).toEqual({ preset: 'standard' })
    expect(run.preset).toBe('standard')
    expect(run.units).toBe('bytes')
  })
})

describe('an edit under Continuous', () => {
  const link = '?preset=continuous&test=upload&duration=3600'

  it('stores the direction, dropping test and preset and keeping the duration', () => {
    const { drop, run } = edit(link, 'continuousDirection', 'download')
    expect(drop).toEqual(['test', 'preset'])
    expect(run.preset).toBe('continuous')
    expect(run.continuousDirection).toBe('download')
    expect(run.runLengthMs).toBe(3_600_000)
  })

  it('stores the run length, dropping duration and preset and keeping the direction', () => {
    const { drop, run } = edit(link, 'runLengthS', 7200)
    expect(drop).toEqual(['duration', 'preset'])
    expect(run.preset).toBe('continuous')
    expect(run.runLengthMs).toBe(7_200_000)
    expect(run.continuousDirection).toBe('upload')
  })

  it('keeps the stored direction and run length over a bounded stored preset when it stores the link preset', () => {
    const url = parseUrlParams('?preset=continuous')
    const stored: StoredSettings = { preset: 'quick', continuousDirection: 'upload', runLengthS: 7200 }
    expect(linkedSettings(DEFAULTS, stored, url)).toMatchObject({ preset: 'continuous', continuousDirection: 'upload', runLengthMs: 7_200_000 })
    const edited = applyEdit(DEFAULTS, stored, url, 'pingCount', 30)
    expect(edited.drop).toEqual(['preset'])
    expect(edited.stored).toMatchObject({ preset: 'continuous', continuousDirection: 'upload', runLengthS: 7200, pingCount: 30 })
  })

  it('marks the direction, the run length and the preset as from the link', () => {
    expect([...linkedKeys(DEFAULTS, STORED, parseUrlParams(link))].sort()).toEqual(['continuousDirection', 'pingCount', 'preset', 'runLengthS', 'streams'])
  })
})

describe('an edit under a bounded preset', () => {
  it('stores the phases, dropping test alone and keeping the link preset', () => {
    const { drop, run, stored } = edit('?preset=quick&test=upload', 'phases', ['idle', 'download'])
    expect(drop).toEqual(['test'])
    expect(stored.preset).toBe('extended')
    expect(run.phases).toEqual(['idle', 'download'])
    expect(run.preset).toBe('quick')
  })

  it('drops the duration with the bounds it caps', () => {
    const { drop, run } = edit('?preset=quick&duration=8', 'upload', { minMs: 5000, maxMs: 9000 })
    expect(drop).toEqual(['duration', 'preset'])
    expect(run.upload).toEqual({ minMs: 5000, maxMs: 9000 })
  })
})

describe('an edit nothing in the link governs', () => {
  it('drops nothing', () => {
    expect(edit('?units=bytes&theme=dark', 'dataCapBytes', 100_000_000).drop).toEqual([])
    expect(edit('?preset=quick', 'units', 'bytes').drop).toEqual([])
    expect(edit('', 'pingCount', 12).drop).toEqual([])
  })

  it('does not count a preset parameter equal to the stored preset', () => {
    expect(edit('?preset=extended', 'pingCount', 12).drop).toEqual([])
  })
})

describe('the fields with a parameter of their own', () => {
  it.each([
    ['?preset=quick&cap=200MB', 'dataCapBytes', 100_000_000, ['cap']],
    ['?preset=quick&units=bytes', 'units', 'bits', ['units']],
    ['?preset=quick&label=VPN', 'label', 'LAN', ['label']],
    ['?preset=quick&theme=dark', 'theme', 'light', ['theme']],
    ['?preset=quick&lang=en', 'lang', 'en', ['lang']],
  ] as const)('%s drops its parameter on a %s edit, and leaves the preset in place', (search, field, value, dropped) => {
    const { drop, stored, run } = edit(search, field, value)
    expect(drop).toEqual(dropped)
    expect(stored.preset).toBe('extended')
    expect(run.preset).toBe('quick')
  })

  it('returns a field to its default when its value is undefined, dropping what governs it', () => {
    const { drop, stored, run } = edit('?preset=continuous&test=upload&duration=3600', 'runLengthS', undefined)
    expect(drop).toEqual(['duration', 'preset'])
    expect(stored).not.toHaveProperty('runLengthS')
    expect(run.preset).toBe('continuous')
    expect(run.runLengthMs).toBeUndefined()
  })
})
