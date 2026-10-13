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

import { describe, expect, it } from 'vitest'

import { BusyTrack, cpuBound } from '@/engine/stats/busy'

describe('the busy fraction', () => {
  it('is the busy time over the elapsed time, read between the tick samples', () => {
    const track = new BusyTrack()
    track.record(0, 0)
    track.record(100, 50)
    track.record(200, 150)
    expect(track.fraction(0, 200)).toBe(0.75)
    // 50 ms in, the busy time is interpolated: 25 ms at 50 ms, 100 ms at 150 ms.
    expect(track.fraction(50, 150)).toBe(0.75)
    expect(track.fraction(100, 200)).toBe(1)
  })

  it('is clamped to the sampled span, and null without one', () => {
    const track = new BusyTrack()
    expect(track.fraction(0, 100)).toBeNull()
    track.record(100, 10)
    expect(track.fraction(0, 100)).toBeNull()
    track.record(200, 30)
    expect(track.fraction(0, 500)).toBeCloseTo(0.2, 10)
    // A sample out of order is ignored.
    track.record(150, 999)
    expect(track.fraction(100, 200)).toBeCloseTo(0.2, 10)
  })

  it('makes a direction cpu-bound only above 90 %', () => {
    expect(cpuBound(0.9)).toBe(false)
    expect(cpuBound(0.91)).toBe(true)
    expect(cpuBound(null)).toBe(false)
  })
})
