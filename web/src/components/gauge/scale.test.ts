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

// The gauge's log mapping and its 1-2-5 ticks (measurement.md section 14).

import { describe, expect, it } from 'vitest'

import { angle, arcPath, fraction, MS_SCALE, rateScale, ticks } from '@/components/gauge/scale'

describe('the scale', () => {
  it('maps the window logarithmically onto the arc and pins outside it', () => {
    const scale = rateScale(5)
    expect(scale).toEqual({ lo: 1e5, hi: 1e9 })
    expect(fraction(1e5, scale)).toBe(0)
    expect(fraction(1e7, scale)).toBeCloseTo(0.5)
    expect(fraction(1e9, scale)).toBe(1)
    expect(fraction(10, scale)).toBe(0)
    expect(fraction(0, scale)).toBe(0)
    expect(fraction(5e10, scale)).toBe(1)
    expect(fraction(10, MS_SCALE)).toBeCloseTo(1 / 3)
  })

  it('turns 270° clockwise from 135°', () => {
    expect(angle(0)).toBe(135)
    expect(angle(1)).toBe(405)
    expect(arcPath(100, 100, 50, 0.5, 0.5)).toBe('')
    // The whole track takes the long way round.
    expect(arcPath(100, 100, 50, 0, 1)).toContain('A50 50 0 1 1')
  })

  it('puts 1, 2 and 5 ticks in every decade, the decade starts major, both ends included', () => {
    const marks = ticks(rateScale(6))
    expect(marks.map((tick) => tick.value)).toEqual([1e6, 2e6, 5e6, 1e7, 2e7, 5e7, 1e8, 2e8, 5e8, 1e9, 2e9, 5e9, 1e10])
    expect(marks.filter((tick) => tick.major).map((tick) => tick.value)).toEqual([1e6, 1e7, 1e8, 1e9, 1e10])
    expect(marks[0]?.at).toBe(0)
    expect(marks.at(-1)?.at).toBe(1)
    expect(ticks(MS_SCALE).map((tick) => tick.value)).toEqual([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000])
  })
})
