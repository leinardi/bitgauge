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

// The result's chart cards: a Continuous stop is labeled Stopped, a bounded one Cancelled.

import { describe, expect, it } from 'vitest'

import { chartCards } from '@/components/result/charts'
import type { Wording } from '@/components/test/wording'
import type { DirectionResult } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { continuousResultSettings } from '@/test/continuous'
import { resultFixture } from '@/test/fixtures'

const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }

function stopped(download: DirectionResult | undefined): DirectionResult {
  if (download === undefined) {
    throw new Error('the fixture has a download')
  }
  return { ...download, events: [{ code: 'cancelled', atMs: 5000 }] }
}

describe('the result chart cards', () => {
  it('mark a Continuous stop Stopped, and a bounded one Cancelled', () => {
    const base = resultFixture()
    const bounded = resultFixture({ download: stopped(base.download) })
    expect(chartCards(bounded, 'bits', wording)[0]?.summary).toContain('Cancelled')
    const continuous = resultFixture({ settings: continuousResultSettings('download'), download: stopped(base.download), upload: undefined })
    const summary = chartCards(continuous, 'bits', wording)[0]?.summary
    expect(summary).toContain('Stopped')
    expect(summary).not.toContain('Cancelled')
  })
})
