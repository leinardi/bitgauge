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
    // A link that says no also turns a stored Auto-start off for its load (url-params.md section 1).
    expect(parseUrlParams(search)).toEqual(run ? { run, ignored: [] } : { run, noRun: true, ignored: [] })
  })

  it('ignores an invalid run flag', () => {
    expect(parseUrlParams('?run=yes')).toEqual({ run: false, ignored: [{ parameter: 'run', value: 'yes' }] })
  })

  it.each([
    ['all', 'all'],
    ['Download', 'download'],
    ['UPLOAD', 'upload'],
    ['latency', 'latency'],
    ['Ping', 'latency'],
  ])('reads test=%s as %s', (value, test) => {
    // The value as given stays for the notice, should the resolved preset ignore it.
    expect(parseUrlParams(`?test=${value}`)).toEqual({ run: false, test, given: { test: value }, ignored: [] })
  })

  it.each([
    ['test', 'both'],
    ['preset', 'turbo'],
    ['duration', '4'],
    ['duration', '604801'],
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
    // Too long for a double: Infinity bytes.
    ['cap', `1${'0'.repeat(320)}`],
    ['units', 'nibbles'],
    ['lang', 'xx'],
    ['theme', 'sepia'],
    ['label', 'x'.repeat(65)],
  ])('ignores %s=%s and names it with its value, cut to 64 characters', (name, value) => {
    const { given: _given, ...params } = parseUrlParams(`?${name}=${encodeURIComponent(value)}`)
    expect(params).toEqual({ run: false, ignored: [{ parameter: name, value: [...value].slice(0, 64).join('') }] })
  })

  it.each([
    ['?preset=Quick', { preset: 'quick' }],
    ['?PRESET=extended', { preset: 'extended' }],
    ['?preset=Continuous', { preset: 'continuous' }],
    ['?duration=5', { durationMs: 5000, given: { duration: '5' } }],
    ['?Duration=600', { durationMs: 600_000, given: { duration: '600' } }],
    // Within the run length's range: the resolved preset decides (urlOverride).
    ['?duration=604800', { durationMs: 604_800_000, given: { duration: '604800' } }],
    ['?streams=AUTO', { streams: { mode: 'auto' } }],
    ['?streams=single', { streams: { mode: 'single' } }],
    ['?streams=6', { streams: { mode: 'fixed', fixed: 6 }, given: { streams: '6' } }],
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
    expect(params).toEqual(fields === null ? { run: false, ignored: [{ parameter: 'cap', value: '2KiB' }] } : { run: false, ignored: [], ...fields })
  })

  it('applies the rest when one value is invalid, takes the first of a repeated name, and ignores unknown names silently', () => {
    expect(parseUrlParams('?run=1&streams=12&Preset=quick&preset=extended&server=other&R=1')).toEqual({ run: true, preset: 'quick', ignored: [{ parameter: 'streams', value: '12' }] })
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

  it('checks a duration against the resolved preset: 5–600 s bounded, 60–604800 s for Continuous', () => {
    const CONTINUOUS: TestSettings = { ...DEFAULTS, preset: 'continuous', download: { minMs: null, maxMs: null }, upload: { minMs: null, maxMs: null }, continuousDirection: 'download' }
    expect(urlOverride(parseUrlParams('?duration=601'), DEFAULTS)).toEqual({ override: {}, ignored: [{ parameter: 'duration', value: '601' }] })
    expect(urlOverride(parseUrlParams('?duration=601&preset=continuous'), DEFAULTS).override).toEqual({ preset: 'continuous', durationMs: 601_000 })
    // The stored preset resolves it when the link names none.
    expect(urlOverride(parseUrlParams('?duration=604800'), CONTINUOUS)).toEqual({ override: { durationMs: 604_800_000 }, ignored: [] })
    expect(urlOverride(parseUrlParams('?duration=30'), CONTINUOUS)).toEqual({ override: {}, ignored: [{ parameter: 'duration', value: '30' }] })
    expect(urlOverride(parseUrlParams('?duration=3600&preset=standard'), CONTINUOUS)).toEqual({ override: { preset: 'standard' }, ignored: [{ parameter: 'duration', value: '3600' }] })
  })

  it('picks the Continuous direction with test: download for all, latency ignored and giving download, the phases left as stored', () => {
    const direction = (search: string) => urlOverride(parseUrlParams(`?preset=continuous&${search}`), DEFAULTS)
    expect(direction('test=upload')).toEqual({ override: { preset: 'continuous', continuousDirection: 'upload' }, ignored: [] })
    expect(direction('test=Download')).toEqual({ override: { preset: 'continuous', continuousDirection: 'download' }, ignored: [] })
    expect(direction('test=all')).toEqual({ override: { preset: 'continuous', continuousDirection: 'download' }, ignored: [] })
    expect(direction('test=Ping')).toEqual({ override: { preset: 'continuous', continuousDirection: 'download' }, ignored: [{ parameter: 'test', value: 'Ping' }] })
    expect(direction('test=upload&duration=3600').override).toEqual({ preset: 'continuous', continuousDirection: 'upload', durationMs: 3_600_000 })
  })

  it('ignores a fixed stream count above the server maximum', () => {
    expect(urlOverride(parseUrlParams('?streams=5&units=bytes'), DEFAULTS)).toEqual({ override: { units: 'bytes' }, ignored: [{ parameter: 'streams', value: '5' }] })
  })

  it('names the stream count as the link gave it', () => {
    expect(urlOverride(parseUrlParams('?streams=05'), DEFAULTS).ignored).toEqual([{ parameter: 'streams', value: '05' }])
  })
})
