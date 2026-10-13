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

// The server's test defaults as the engine's settings.

import { describe, expect, it } from 'vitest'

import type { Info } from '@/api/info'
import { settingsFromDefaults } from '@/lib/defaults'

const DEFAULTS: Info['defaults'] = {
  preset: 'standard',
  phases: ['idle', 'download', 'upload'],
  streams: { mode: 'auto', fixed: 4, max: 16 },
  download: { minMs: 8000, maxMs: 20_000 },
  upload: { minMs: 8000, maxMs: 20_000 },
  dataCapBytes: null,
  units: 'bits',
  warmup: 'auto',
  pingCount: 21,
  overheadCompensationPercent: 0,
}

describe('settingsFromDefaults', () => {
  it('carries every field over, copying the arrays and objects', () => {
    const settings = settingsFromDefaults(DEFAULTS)
    expect(settings).toEqual(DEFAULTS)
    expect(settings?.phases).not.toBe(DEFAULTS.phases)
    expect(settings?.streams).not.toBe(DEFAULTS.streams)
  })

  it.each([
    ['the Continuous preset', { ...DEFAULTS, preset: 'continuous' as const }],
    ['a download range without a bound', { ...DEFAULTS, download: { minMs: null, maxMs: 20_000 } }],
    ['an upload range without a bound', { ...DEFAULTS, upload: { minMs: 8000, maxMs: null } }],
  ])('gives nothing for %s', (_name, defaults) => {
    expect(settingsFromDefaults(defaults)).toBeNull()
  })
})
