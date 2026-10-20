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

// The quality list's wording (ui/screens.md section 6): a band name per experience or the inputs it
// misses, and the basis only when the scores rest on one direction.

import { describe, expect, it } from 'vitest'

import { pendingQualityView, qualityView } from '@/components/result/qualityList'
import type { Wording } from '@/components/test/wording'
import type { Scores } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { resultFixture } from '@/test/fixtures'

const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }

const scores = (patch: Partial<Scores> = {}): Scores => ({
  basis: 'download+upload',
  packetLoss: 'not-measured',
  streaming: { points: 90, band: 'great' },
  gaming: { points: 45, band: 'average' },
  rtc: { points: 10, band: 'bad' },
  ...patch,
})

describe('qualityView', () => {
  it('names each experience with its band, without a basis on both directions', () => {
    expect(qualityView(resultFixture({ scores: scores() }), wording)).toEqual({
      basis: null,
      rows: [
        { experience: 'streaming', name: 'Streaming', band: 'great', text: 'Great' },
        { experience: 'gaming', name: 'Gaming', band: 'average', text: 'Average' },
        { experience: 'rtc', name: 'Video calls', band: 'bad', text: 'Bad' },
      ],
    })
  })

  it('names the inputs an experience misses, and the one direction the scores rest on', () => {
    const view = qualityView(resultFixture({ scores: scores({ basis: 'download', gaming: { missing: ['loaded-latency'] }, rtc: { missing: ['idle-latency', 'jitter', 'download'] } }) }), wording)
    expect(view?.basis).toBe('download only')
    expect(view?.rows.map((row) => [row.band, row.text])).toEqual([
      ['great', 'Great'],
      [null, 'needs loaded latency'],
      [null, 'needs idle latency, jitter, and download'],
    ])
    expect(qualityView(resultFixture({ scores: scores({ basis: 'upload' }) }), wording)?.basis).toBe('upload only')
    expect(qualityView(resultFixture({ scores: scores({ basis: 'none' }) }), wording)?.basis).toBeNull()
  })

  it('is absent without scores', () => {
    expect(qualityView(resultFixture(), wording)).toBeNull()
  })
})

describe('pendingQualityView', () => {
  it('reads "—" before a run ends and "needs a full test" when it ended without a result, as the kit does', () => {
    const texts = (ended: boolean) => pendingQualityView(wording, ended).rows.map((row) => [row.name, row.band, row.text])
    expect(texts(false)).toEqual([
      ['Streaming', null, '—'],
      ['Gaming', null, '—'],
      ['Video calls', null, '—'],
    ])
    expect(texts(true).map(([, , text]) => text)).toEqual(['needs a full test', 'needs a full test', 'needs a full test'])
    expect(pendingQualityView(wording).basis).toBeNull()
  })
})
