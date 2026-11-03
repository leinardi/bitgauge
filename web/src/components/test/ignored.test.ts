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

// The URL parameter ignored notice per parameter (ui/url-params.md section 2): the value the link
// gave, the values allowed, and what the setting stays on for the run.

import { describe, expect, it } from 'vitest'

import { ignoredBody, screenNotices } from '@/components/test/ignored'
import type { Wording } from '@/components/test/wording'
import type { TestSettings } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { settingsFromDefaults } from '@/lib/defaults'
import { infoFixture } from '@/test/fixtures'

const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }
const SETTINGS = settingsFromDefaults(infoFixture().defaults) as TestSettings
const body = (parameter: string, value: string, settings: TestSettings | null = SETTINGS) =>
  ignoredBody({ code: 'url-parameter-ignored', parameter, value }, { ...wording, settings, theme: 'system' }).replace(/\u00a0/gu, ' ')
const TAIL = '; the other parameters from the link were applied.'

describe('the ignored URL parameter notice', () => {
  it.each([
    ['streams', '12', 'streams=12 ignored, allowed 1–6. Streams stay on Auto'],
    ['streams', 'many', 'streams=many ignored, allowed auto, single, or 1–6. Streams stay on Auto'],
    ['run', 'yes', 'run=yes ignored, allowed 1, true, 0, or false. The test waits for Start'],
    ['test', 'both', 'test=both ignored, allowed all, download, upload, or latency. Phases stay on idle latency, download, and upload'],
    ['preset', 'turbo', 'preset=turbo ignored, allowed quick, standard, extended, or continuous. The preset stays on Standard'],
    ['duration', '4', 'duration=4 ignored, allowed 5–600 s. Durations stay on 10–20 s for download and 15–25 s for upload'],
    ['cap', '2KiB', 'cap=2KiB ignored, allowed 1 MiB or more, 0, or none. The data cap stays on none'],
    ['units', 'nibbles', 'units=nibbles ignored, allowed bits or bytes. Units stay on bits'],
    ['lang', 'xx', 'lang=xx ignored, allowed en. The language stays on English'],
    ['theme', 'sepia', 'theme=sepia ignored, allowed system, light, or dark. The theme stays on System'],
    ['label', 'x', 'label=x ignored, allowed at most 64 characters. The label stays on the suggested one'],
  ])('words %s=%s', (parameter, value, words) => {
    expect(body(parameter, value)).toBe(words + TAIL)
  })

  it('names the stored durations and label the run keeps', () => {
    const stored = { ...SETTINGS, download: { minMs: 10_000, maxMs: 30_000 }, upload: { minMs: 10_000, maxMs: 30_000 } }
    expect(body('duration', '601', stored)).toBe('duration=601 ignored, allowed 5–600 s. Durations stay on 10–30 s' + TAIL)
    const split = { ...stored, upload: { minMs: 15_000, maxMs: 25_000 } }
    expect(body('duration', '601', split)).toBe('duration=601 ignored, allowed 5–600 s. Durations stay on 10–30 s for download and 15–25 s for upload' + TAIL)
    const label = ignoredBody({ code: 'url-parameter-ignored', parameter: 'label', value: 'x' }, { ...wording, settings: SETTINGS, theme: 'system', label: 'Desk' })
    expect(label).toBe('label=x ignored, allowed at most 64 characters. The label stays on “Desk”' + TAIL)
  })

  it('words test and duration under Continuous: the direction, and the run length or none', () => {
    const continuous: TestSettings = { ...SETTINGS, preset: 'continuous', download: { minMs: null, maxMs: null }, upload: { minMs: null, maxMs: null }, continuousDirection: 'download' }
    expect(body('test', 'latency', continuous)).toBe('test=latency ignored, allowed all, download, or upload. The direction is download' + TAIL)
    expect(body('duration', '30', continuous)).toBe('duration=30 ignored, allowed 60–604800 s. The run has no run length' + TAIL)
    expect(body('duration', '30', { ...continuous, runLengthMs: 7_200_000 })).toBe('duration=30 ignored, allowed 60–604800 s. The run length stays on 2 h' + TAIL)
    expect(body('preset', 'turbo', continuous)).toBe('preset=turbo ignored, allowed quick, standard, extended, or continuous. The preset stays on Continuous' + TAIL)
  })

  it('falls back to the default before the run has settings', () => {
    expect(body('streams', '12', null)).toBe('streams=12 ignored, allowed 1–6. The setting stays on its default' + TAIL)
  })
})

describe('the notices the Test screen lists', () => {
  const ignored = [{ parameter: 'cap', value: '1MB' }]
  const notice = { code: 'url-parameter-ignored', parameter: 'cap', value: '1MB' } as const
  const extended = { code: 'slow-link-extended', direction: 'download' } as const

  it('shows no ignored parameter before GET /info answers, then the ones a run will carry', () => {
    expect(screenNotices({ idle: true, settled: false, ignored, run: [] })).toEqual([])
    expect(screenNotices({ idle: true, settled: true, ignored, run: [] })).toEqual([notice])
  })

  it('keeps the ignored parameters from a run start until the run brings its own', () => {
    expect(screenNotices({ idle: false, settled: true, ignored, run: [] })).toEqual([notice])
    expect(screenNotices({ idle: false, settled: true, ignored, run: [extended] })).toEqual([notice, extended])
    expect(screenNotices({ idle: false, settled: true, ignored, run: [extended, notice] })).toEqual([extended, notice])
  })
})
