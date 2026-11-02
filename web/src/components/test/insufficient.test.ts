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

// The insufficient-data notice (ui/screens.md section 7): with each offer, while the run goes on
// and once it has ended, its body the same whatever phase runs.

import { describe, expect, it } from 'vitest'

import { insufficientWording } from '@/components/test/insufficient'
import type { Wording } from '@/components/test/wording'
import type { Direction, DirectionResult, Preset } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { settingsFromDefaults } from '@/lib/defaults'
import { infoFixture, resultFixture } from '@/test/fixtures'

const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }
const settings = settingsFromDefaults(infoFixture().defaults)
const ENDED: DirectionResult = { status: 'insufficient-data', streams: 1, bytes: 50_000, events: [] }

function words(direction: Direction, offer: Preset | null): { title: string; body: string } {
  const shown = insufficientWording({ code: 'insufficient-data', direction, offer }, { ...wording, settings, directions: { [direction]: ENDED } })
  return { title: shown.title, body: shown.body.replace(/\u00a0/gu, ' ') }
}

describe('the insufficient-data notice', () => {
  it('names the direction, its maximum, its data used and the offer, and not the phase running now', () => {
    expect(words('download', 'extended')).toEqual({
      title: 'Download: insufficient data',
      body: 'Download reached its 20 s maximum without a confirmed steady window long enough for a number. 50 kB used. Extended allows up to 40 s per direction.',
    })
  })

  it('reads the data used from the result once the run has ended', () => {
    const result = resultFixture({ upload: { ...resultFixture().upload!, ...ENDED, bytes: 75_000 } })
    const shown = insufficientWording({ code: 'insufficient-data', direction: 'upload', offer: 'standard' }, { ...wording, settings, result })
    expect(shown.body.replace(/\u00a0/gu, ' ')).toBe(
      'Upload reached its 25 s maximum without a confirmed steady window long enough for a number. 75 kB used. Standard allows up to 20 s for download and 25 s for upload.',
    )
  })

  it('says the data cap ended a direction it stopped before a steady window, offering nothing', () => {
    const capped: DirectionResult = { ...ENDED, events: [{ code: 'data-cap', atMs: 73 }] }
    const shown = insufficientWording({ code: 'insufficient-data', direction: 'download', offer: null }, { ...wording, settings, directions: { download: capped } })
    expect(shown.body.replace(/\u00a0/gu, ' ')).toBe('Download stopped at the data cap before a confirmed steady window long enough for a number. 50 kB used.')
  })

  it('says no data used for a direction stopped before its first byte', () => {
    const none: DirectionResult = { ...ENDED, bytes: 0, events: [{ code: 'cancelled', atMs: 40 }] }
    const shown = insufficientWording({ code: 'insufficient-data', direction: 'download', offer: null }, { ...wording, settings, directions: { download: none } })
    expect(shown.body).not.toContain('used')
  })

  it('offers nothing after Extended', () => {
    expect(words('download', null).body).toBe('Download reached its 20 s maximum without a confirmed steady window long enough for a number. 50 kB used.')
  })
})
