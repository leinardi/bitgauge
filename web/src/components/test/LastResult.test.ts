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

// The last result line (ui/screens.md section 1): when, the headline numbers and the label of the
// latest saved result; a Continuous result's one direction, named as Continuous.

import { describe, expect, it } from 'vitest'

import LastResult from '@/components/test/LastResult.vue'
import type { Result } from '@/engine/messages'
import { continuousResult } from '@/test/continuous'
import { resultFixture } from '@/test/fixtures'
import { mountApp } from '@/test/mount'

describe('the last result line', () => {
  it('shows both directions of a bounded result, and the one a Continuous result ran', async () => {
    const bounded = await mountApp(LastResult, '/', { props: { result: resultFixture({ label: 'Desk' }), units: 'bits' } })
    expect(bounded.text().replace(/\u00a0/gu, ' ')).toMatch(/↓ 612 · ↑ 438 Mbit\/s · 3\.1 ms · Desk View$/)
    bounded.unmount()
    const continuous = await mountApp(LastResult, '/', { props: { result: { ...continuousResult({ direction: 'upload', endMs: 7_200_000, bucketMs: 60_000 }), label: 'Rack' }, units: 'bits' } })
    expect(continuous.text().replace(/\u00a0/gu, ' ')).toMatch(/↑ 921 Mbit\/s · Continuous · 3\.1 ms · Rack View$/)
    continuous.unmount()
  })

  it('breaks a long unbroken label within the line', async () => {
    const wrapper = await mountApp(LastResult, '/', { props: { result: resultFixture({ label: 'x'.repeat(64) }), units: 'bits' } })
    expect(wrapper.get('[data-testid="last-result-label"]').classes()).toEqual(expect.arrayContaining(['min-w-0', 'wrap-anywhere']))
    expect(wrapper.get('[data-testid="last-result"]').classes()).toContain('min-w-0')
    wrapper.unmount()
  })

  it('carries each speed\'s qualifiers in History\'s words, each rate with its own unit', async () => {
    const base = resultFixture()
    const { bitsPerSecond: _b, peakBitsPerSecond: _p, ...upload } = base.upload!
    const line = async (result: Result) => {
      const wrapper = await mountApp(LastResult, '/', { props: { result, units: 'bits' } })
      const text = wrapper.text().replace(/\u00a0/gu, ' ')
      wrapper.unmount()
      return text
    }
    // A partial run stopped in the upload: the download partial, the upload without a number.
    const partial = resultFixture({ status: 'partial', download: { ...base.download!, status: 'partial' }, upload: { ...upload, status: 'insufficient-data' } })
    expect(await line(partial)).toMatch(/↓ 612 Mbit\/s partial · ↑ insufficient data · 3\.1 ms/)
    // A complete run whose download had insufficient data.
    const { bitsPerSecond: _d, peakBitsPerSecond: _dp, ...download } = base.download!
    expect(await line(resultFixture({ download: { ...download, status: 'insufficient-data' } }))).toMatch(/↓ insufficient data · ↑ 438 Mbit\/s · 3\.1 ms/)
    // Low confidence with overhead compensation: the compensated numbers, each qualified.
    const compensated = resultFixture({
      settings: { ...base.settings, overheadCompensationPercent: 5 },
      download: { ...base.download!, confidence: { level: 'low', reasons: ['unstable'] } },
    })
    expect(await line(compensated)).toMatch(/↓ 612 Mbit\/s low confidence: unstable, \+5\.0 % overhead compensation · ↑ 438 Mbit\/s \+5\.0 % overhead compensation · 3\.1 ms/)
  })
})
