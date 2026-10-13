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

// The window rule as a pure function, over synthetic value streams at 10 Hz (measurement.md
// section 14): dwell, hysteresis, the start windows, pinning and the hand-over between directions.

import { describe, expect, it } from 'vitest'

import { DWELL_MS, startK, trackWindow } from '@/components/gauge/window'

/** `seconds` of a constant value, one every 100 ms from `fromMs`. */
function steady(value: number, seconds: number, fromMs = 0): { values: number[]; clock: number[] } {
  const count = Math.round(seconds * 10) + 1
  return {
    values: Array.from({ length: count }, () => value),
    clock: Array.from({ length: count }, (_, index) => fromMs + index * 100),
  }
}

/** The window after the value at `ms`. */
function at(ks: number[], clock: number[], ms: number): number | undefined {
  return ks[clock.indexOf(ms)]
}

describe('trackWindow', () => {
  it('starts in 1 Mbit/s–10 Gbit/s and 100 kB/s–1 GB/s', () => {
    expect(startK('bits')).toBe(6)
    expect(startK('bytes')).toBe(5)
    expect(DWELL_MS).toBe(2000)
  })

  it('moves a value staying at 5 Mbit/s down exactly once, at 2.0 s and not at 1.9 s', () => {
    const { values, clock } = steady(5e6, 6)
    const ks = trackWindow(values, clock, { unit: 'bits', startK: 6 })
    expect(at(ks, clock, 1900)).toBe(6)
    expect(at(ks, clock, 2000)).toBe(5)
    expect(ks.at(-1)).toBe(5)
    expect(new Set(ks)).toEqual(new Set([6, 5]))
  })

  it('never moves a value oscillating around a boundary, since leaving the zone restarts the hold', () => {
    const values = Array.from({ length: 100 }, (_, index) => (index % 2 === 0 ? 9e6 : 1.1e7))
    const clock = values.map((_, index) => index * 100)
    expect(new Set(trackWindow(values, clock, { unit: 'bits', startK: 6 }))).toEqual(new Set([6]))
  })

  it('does not move back within the dwell after a shift, and the opposite threshold is two decades away', () => {
    // Down to k = 5 at 2.0 s, then a value just above the old boundary: k = 5's top decade starts
    // at 100 Mbit/s, so nothing moves.
    const first = steady(9e6, 2)
    const second = steady(1.1e7, 5, 2100)
    const ks = trackWindow([...first.values, ...second.values], [...first.clock, ...second.clock], { unit: 'bits', startK: 6 })
    expect(ks.slice(first.values.length - 1)).toEqual(Array.from({ length: second.values.length + 1 }, () => 5))
  })

  it('takes a 300 kbit/s link from the start window to the bottom window in two shifts', () => {
    const { values, clock } = steady(3e5, 8)
    const ks = trackWindow(values, clock, { unit: 'bits', startK: 6 })
    expect(at(ks, clock, 2000)).toBe(5)
    expect(at(ks, clock, 3900)).toBe(5)
    expect(at(ks, clock, 4000)).toBe(4)
    expect(ks.at(-1)).toBe(4)
  })

  it('uses the four byte windows, with one shift up above 100 MB/s', () => {
    const fast = steady(1.5e8, 8)
    const up = trackWindow(fast.values, fast.clock, { unit: 'bytes', startK: 5 })
    expect(at(up, fast.clock, 1900)).toBe(5)
    expect(at(up, fast.clock, 2000)).toBe(6)
    expect(up.at(-1)).toBe(6)

    // A slow link reaches the byte floor, 1 kB/s–10 MB/s, in two shifts.
    const slow = steady(5e3, 8)
    const down = trackWindow(slow.values, slow.clock, { unit: 'bytes', startK: 5 })
    expect(at(down, slow.clock, 2000)).toBe(4)
    expect(down.at(-1)).toBe(3)
  })

  it('pins below 10 kbit/s and above 10 Gbit/s instead of leaving the outermost windows', () => {
    const slow = steady(5e3, 10)
    expect(trackWindow(slow.values, slow.clock, { unit: 'bits', startK: 6 }).at(-1)).toBe(4)
    const fast = steady(5e10, 10)
    expect(new Set(trackWindow(fast.values, fast.clock, { unit: 'bits', startK: 6 }))).toEqual(new Set([6]))
    const tiny = steady(500, 10)
    expect(trackWindow(tiny.values, tiny.clock, { unit: 'bytes', startK: 5 }).at(-1)).toBe(3)
    const huge = steady(5e10, 10)
    expect(trackWindow(huge.values, huge.clock, { unit: 'bytes', startK: 5 }).at(-1)).toBe(6)
  })

  it('starts the second direction in the window the first one ended in', () => {
    const download = steady(3e5, 6)
    const ended = trackWindow(download.values, download.clock, { unit: 'bits', startK: startK('bits') }).at(-1) ?? 0
    expect(ended).toBe(4)
    const upload = steady(3e5, 1, 10_000)
    expect(trackWindow(upload.values, upload.clock, { unit: 'bits', startK: ended })).toEqual(upload.values.map(() => 4))
  })

  it('never moves the milliseconds scale', () => {
    const { values, clock } = steady(2, 10)
    expect(new Set(trackWindow(values, clock, { unit: 'ms', startK: 0 }))).toEqual(new Set([0]))
  })
})
