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

// The insufficient-data notice (ui/screens.md section 7): while the run goes on to the other
// direction, once it has ended, and with each offer.

import { describe, expect, it } from 'vitest'

import { insufficientWording } from '@/components/test/insufficient'
import type { Wording } from '@/components/test/wording'
import type { Direction, DirectionResult, PhaseName, Preset } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { settingsFromDefaults } from '@/lib/defaults'
import { infoFixture, resultFixture } from '@/test/fixtures'

const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }
const settings = settingsFromDefaults(infoFixture().defaults)
const ENDED: DirectionResult = { status: 'insufficient-data', streams: 1, bytes: 50_000, events: [] }

function words(direction: Direction, offer: Preset | null, current: PhaseName | null, ended = true): { title: string; body: string } {
  const shown = insufficientWording({ code: 'insufficient-data', direction, offer }, { ...wording, settings, directions: ended ? { [direction]: ENDED } : {}, current })
  return { title: shown.title, body: shown.body.replace(/ /gu, ' ') }
}

describe('the insufficient-data notice', () => {
  it('names the direction, its maximum, its data used, the direction still running and the offer', () => {
    expect(words('download', 'extended', 'upload')).toEqual({
      title: 'Download: insufficient data',
      body: 'Download reached its 20 s maximum without a confirmed steady window long enough for a number. 50 kB used. Upload continues; Extended allows up to 40 s per direction.',
    })
  })

  it('drops the direction still running once the run has ended, and reads the data used from the result', () => {
    const result = resultFixture({ upload: { ...resultFixture().upload!, ...ENDED, bytes: 75_000 } })
    const shown = insufficientWording({ code: 'insufficient-data', direction: 'upload', offer: 'standard' }, { ...wording, settings, result, current: null })
    expect(shown.body.replace(/ /gu, ' ')).toBe(
      'Upload reached its 25 s maximum without a confirmed steady window long enough for a number. 75 kB used. Standard allows up to 20 s for download and 25 s for upload.',
    )
  })

  it('says the data cap ended a direction it stopped before a steady window, offering nothing', () => {
    const capped: DirectionResult = { ...ENDED, events: [{ code: 'data-cap', atMs: 73 }] }
    const shown = insufficientWording({ code: 'insufficient-data', direction: 'download', offer: null }, { ...wording, settings, directions: { download: capped }, current: null })
    expect(shown.body.replace(/\u00a0/gu, ' ')).toBe('Download stopped at the data cap before a confirmed steady window long enough for a number. 50 kB used.')
  })

  it('offers nothing after Extended, and says only that the other direction goes on', () => {
    expect(words('download', null, 'upload').body).toBe('Download reached its 20 s maximum without a confirmed steady window long enough for a number. 50 kB used. Upload continues.')
  })
})
