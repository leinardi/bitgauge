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
})
