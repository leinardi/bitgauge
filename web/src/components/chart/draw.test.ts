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

// The series path: straight lines between known points, a gap never joined across, the point before
// a gap held up to where it starts, and the area under each run down to 0.

import type uPlot from 'uplot'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { holdLinear, lastPoint } from '@/components/chart/draw'

/** A Path2D that records its calls, since the test environment has none. */
class Recorder {
  calls: string[] = []
  moveTo(x: number, y: number) {
    this.calls.push(`M${x},${y}`)
  }
  lineTo(x: number, y: number) {
    this.calls.push(`L${x},${y}`)
  }
  closePath() {
    this.calls.push('Z')
  }
}

/** A plot whose scales are the identity, with y as the value, so a path reads in data units. */
function plot(xs: number[], values: (number | null)[]): uPlot {
  return { data: [xs, values], valToPos: (value: number) => value } as unknown as uPlot
}

function paths(xs: number[], values: (number | null)[]) {
  const result = holdLinear(plot(xs, values), 1, 0, xs.length - 1)
  return { stroke: (result?.stroke as unknown as Recorder).calls.join(' '), fill: (result?.fill as unknown as Recorder).calls.join(' ') }
}

describe('holdLinear', () => {
  beforeEach(() => vi.stubGlobal('Path2D', Recorder))
  afterEach(() => vi.unstubAllGlobals())

  it('joins known points with straight lines and closes the area under them at 0', () => {
    expect(paths([0, 1, 2], [5, 7, 6])).toEqual({ stroke: 'M0,5 L0,5 L1,7 L2,6', fill: 'M0,0 L0,5 L1,7 L2,6 L2,0 Z' })
  })

  it('holds the point before a gap up to where the gap starts, and starts again after it', () => {
    expect(paths([0, 1, 2, 3], [5, 7, null, 6]).stroke).toBe('M0,5 L0,5 L1,7 L2,7 M3,6 L3,6')
  })

  it('holds nothing where the series has ended, nor before it starts', () => {
    expect(paths([0, 1, 2, 3], [null, 4, 4, null]).stroke).toBe('M1,4 L1,4 L2,4')
  })
})

describe('lastPoint', () => {
  it('is the last known point, or null', () => {
    expect(lastPoint([0, 1, 2], [3, 4, null])).toEqual([1, 4])
    expect(lastPoint([0, 1], [null, null])).toBeNull()
  })
})
