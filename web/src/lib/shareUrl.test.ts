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

// The shareable settings URL (ui/url-params.md section 3): the parameters that differ, in table
// order, and a link that a fresh browser reads back to the same settings.

import { describe, expect, it } from 'vitest'

import { parseUrlParams, urlOverride } from '@/composables/useUrlParams'
import type { TestSettings } from '@/engine/messages'
import { settingsFromDefaults } from '@/lib/defaults'
import { type StoredSettings, storedOver } from '@/lib/settingsStorage'
import { buildSettingsUrl } from '@/lib/shareUrl'
import { infoFixture } from '@/test/fixtures'

const DEFAULTS = settingsFromDefaults(infoFixture().defaults) as TestSettings
const BASE = 'https://speed.example.lan/speed/'

function link(stored: StoredSettings, run = false) {
  return buildSettingsUrl(BASE, storedOver(DEFAULTS, stored), DEFAULTS, stored, run)
}

/** What opening the link applies in a browser with nothing stored, the run's preset resolved as the engine does. */
function opened(url: string) {
  const params = parseUrlParams(new URL(url).search)
  const { override, ignored } = urlOverride(params, DEFAULTS)
  const { durationMs, ...fields } = override
  let settings = storedOver(DEFAULTS, { preset: fields.preset ?? DEFAULTS.preset })
  settings = { ...settings, ...fields }
  if (durationMs !== undefined) {
    settings.download = { minMs: Math.min(settings.download.minMs, durationMs), maxMs: durationMs }
    settings.upload = { minMs: Math.min(settings.upload.minMs, durationMs), maxMs: durationMs }
  }
  return { params, settings, ignored }
}

describe('the shareable URL', () => {
  it('is the bare base with nothing changed', () => {
    expect(link({})).toEqual({ url: BASE, notInLink: [] })
  })

  it('lists the changed parameters in the table order', () => {
    const stored: StoredSettings = {
      label: 'Kitchen Wi-Fi & co',
      theme: 'dark',
      lang: 'en',
      units: 'bytes',
      dataCapBytes: 500_000_000,
      streams: { mode: 'fixed', fixed: 4 },
      preset: 'extended',
      phases: ['idle', 'download'],
    }
    expect(link(stored, true).url).toBe(`${BASE}?run=1&test=download&preset=extended&streams=4&cap=500MB&units=bytes&lang=en&theme=dark&label=Kitchen%20Wi-Fi%20%26%20co`)
  })

  it('adds run=1 only when asked', () => {
    expect(link({ units: 'bytes' }).url).toBe(`${BASE}?units=bytes`)
    expect(link({ units: 'bytes' }, true).url).toBe(`${BASE}?run=1&units=bytes`)
    expect(link({ autoStart: { enabled: true, countdownS: 3 } }).url).toBe(BASE)
  })

  it('carries the theme and language only when stored, and the label only when set', () => {
    expect(link({ theme: 'system', label: '' }).url).toBe(BASE)
  })

  it('reads back to the same settings', () => {
    const cases: StoredSettings[] = [
      { preset: 'quick', units: 'bytes', label: 'VPN/ä?=&' },
      { preset: 'extended', streams: { mode: 'single', fixed: 3 }, dataCapBytes: null, phases: ['idle'] },
      { download: { minMs: 10_000, maxMs: 15_000 }, upload: { minMs: 15_000, maxMs: 15_000 }, dataCapBytes: 2_000_000 },
      { preset: 'quick', streams: { mode: 'auto', fixed: 3 }, phases: ['idle', 'upload'] },
    ]
    for (const stored of cases) {
      const { url, notInLink } = link(stored, true)
      const { params, settings, ignored } = opened(url)
      expect(notInLink).toEqual([])
      expect(ignored).toEqual([])
      expect(params.run).toBe(true)
      expect(params.label).toBe(stored.label)
      expect(settings).toEqual(storedOver(DEFAULTS, stored))
    }
  })

  it('names what no parameter carries', () => {
    expect(link({ phases: ['idle', 'upload', 'download'] }).notInLink).toEqual(['phases'])
    expect(link({ phases: ['download', 'upload'] }).notInLink).toEqual(['phases'])
    expect(link({ download: { minMs: 6000, maxMs: 30_000 } }).notInLink).toEqual(['durations'])
    expect(link({ autoStart: { enabled: true, countdownS: 5 }, warmup: 3000, pingCount: 30, overheadCompensationPercent: 6 }).notInLink).toEqual(['countdown', 'warmup', 'pingCount', 'overhead'])
    // A preset's own ping count travels with the preset.
    expect(link({ preset: 'extended' }).notInLink).toEqual([])
  })
})
