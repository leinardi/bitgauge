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

// The URL parameters of ui/url-params.md section 2, row by row with valid, invalid and mixed-case
// values, the rules of section 1 (first occurrence, unknown names silent, invalid values named),
// and the settings they hand to configure over the server defaults.

import { describe, expect, it } from 'vitest'

import { parseUrlParams, urlOverride } from '@/composables/useUrlParams'
import type { TestSettings } from '@/engine/messages'

const DEFAULTS: TestSettings = {
  preset: 'standard',
  phases: ['idle', 'upload', 'download'],
  streams: { mode: 'auto', fixed: 3, max: 4 },
  download: { minMs: 10_000, maxMs: 20_000 },
  upload: { minMs: 15_000, maxMs: 25_000 },
  dataCapBytes: null,
  units: 'bits',
  warmup: 'auto',
  pingCount: 20,
  overheadCompensationPercent: 0,
}

describe('parseUrlParams', () => {
  it('reads nothing from an empty query', () => {
    expect(parseUrlParams('')).toEqual({ run: false, ignored: [] })
  })

  it.each([
    ['?run', true],
    ['?run=', true],
    ['?run=1', true],
    ['?Run=TRUE', true],
    ['?run=0', false],
    ['?RUN=False', false],
  ])('reads %s as run %s', (search, run) => {
    expect(parseUrlParams(search)).toEqual({ run, ignored: [] })
  })

  it('ignores an invalid run flag', () => {
    expect(parseUrlParams('?run=yes')).toEqual({ run: false, ignored: ['run'] })
  })

  it.each([
    ['all', 'all'],
    ['Download', 'download'],
    ['UPLOAD', 'upload'],
    ['latency', 'latency'],
    ['Ping', 'latency'],
  ])('reads test=%s as %s', (value, test) => {
    expect(parseUrlParams(`?test=${value}`)).toEqual({ run: false, test, ignored: [] })
  })

  it.each([
    ['test', 'both'],
    ['preset', 'turbo'],
    ['preset', 'continuous'],
    ['duration', '4'],
    ['duration', '601'],
    ['duration', '10.5'],
    ['duration', '30s'],
    ['streams', '0'],
    ['streams', '7'],
    ['streams', '2.5'],
    ['streams', 'many'],
    ['cap', '1048575'],
    ['cap', '500kB'],
    ['cap', '1.5'],
    ['cap', '-1MB'],
    ['cap', '10TB'],
    ['units', 'nibbles'],
    ['lang', 'xx'],
    ['theme', 'sepia'],
    ['label', 'x'.repeat(65)],
  ])('ignores %s=%s and names it', (name, value) => {
    expect(parseUrlParams(`?${name}=${encodeURIComponent(value)}`)).toEqual({ run: false, ignored: [name] })
  })

  it.each([
    ['?preset=Quick', { preset: 'quick' }],
    ['?PRESET=extended', { preset: 'extended' }],
    ['?duration=5', { durationMs: 5000 }],
    ['?Duration=600', { durationMs: 600_000 }],
    ['?streams=AUTO', { streams: { mode: 'auto' } }],
    ['?streams=single', { streams: { mode: 'single' } }],
    ['?streams=6', { streams: { mode: 'fixed', fixed: 6 } }],
    ['?cap=0', { dataCapBytes: null }],
    ['?cap=None', { dataCapBytes: null }],
    ['?cap=1048576', { dataCapBytes: 1_048_576 }],
    ['?cap=500MB', { dataCapBytes: 500_000_000 }],
    ['?cap=1.5gb', { dataCapBytes: 1_500_000_000 }],
    ['?cap=2KiB', null],
    ['?cap=1MiB', { dataCapBytes: 1_048_576 }],
    ['?cap=3GiB', { dataCapBytes: 3 * 1024 ** 3 }],
    ['?units=Bytes', { units: 'bytes' }],
    ['?lang=EN', { lang: 'en' }],
    ['?theme=Dark', { theme: 'dark' }],
    ['?label=Kitchen%20Wi-Fi', { label: 'Kitchen Wi-Fi' }],
    [`?label=${'é'.repeat(64)}`, { label: 'é'.repeat(64) }],
  ])('reads %s', (search, fields) => {
    const params = parseUrlParams(search)
    expect(params).toEqual(fields === null ? { run: false, ignored: ['cap'] } : { run: false, ignored: [], ...fields })
  })

  it('applies the rest when one value is invalid, takes the first of a repeated name, and ignores unknown names silently', () => {
    expect(parseUrlParams('?run=1&streams=12&Preset=quick&preset=extended&server=other&R=1')).toEqual({ run: true, preset: 'quick', ignored: ['streams'] })
  })
})

describe('urlOverride', () => {
  it('runs the phases a test value names, idle latency first and the directions in the configured order', () => {
    const phases = (test: string) => urlOverride(parseUrlParams(`?test=${test}`), DEFAULTS).override.phases
    expect(phases('all')).toEqual(['idle', 'upload', 'download'])
    expect(phases('download')).toEqual(['idle', 'download'])
    expect(phases('upload')).toEqual(['idle', 'upload'])
    expect(phases('ping')).toEqual(['idle'])
    // All three, even when the defaults leave a direction out.
    expect(urlOverride(parseUrlParams('?test=all'), { ...DEFAULTS, phases: ['download'] }).override.phases).toEqual(['idle', 'download', 'upload'])
  })

  it('hands the settings to configure over the defaults', () => {
    const { override, ignored } = urlOverride(parseUrlParams('?preset=quick&duration=30&streams=2&cap=500MB&units=bytes&label=VPN&lang=en&theme=light&run=1'), DEFAULTS)
    expect(override).toEqual({ preset: 'quick', durationMs: 30_000, streams: { mode: 'fixed', fixed: 2, max: 4 }, dataCapBytes: 500_000_000, units: 'bytes' })
    expect(ignored).toEqual([])
    expect(urlOverride(parseUrlParams('?streams=single'), DEFAULTS).override.streams).toEqual({ mode: 'single', fixed: 3, max: 4 })
    expect(urlOverride(parseUrlParams(''), DEFAULTS)).toEqual({ override: {}, ignored: [] })
  })

  it('ignores a fixed stream count above the server maximum', () => {
    expect(urlOverride(parseUrlParams('?streams=5&units=bytes'), DEFAULTS)).toEqual({ override: { units: 'bytes' }, ignored: ['streams'] })
  })
})
