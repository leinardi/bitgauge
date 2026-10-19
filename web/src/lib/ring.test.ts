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

import { FixedRing } from '@/lib/ring'

describe('a fixed ring', () => {
  it('holds values by absolute index from its first index', () => {
    const ring = new FixedRing<number>(4, 9000)
    ring.push(1)
    ring.push(2)
    expect([ring.firstIndex, ring.endIndex, ring.length]).toEqual([9000, 9002, 2])
    expect([ring.at(8999), ring.at(9000), ring.at(9001), ring.at(9002)]).toEqual([undefined, 1, 2, undefined])
    expect(ring.toArray()).toEqual([1, 2])
    expect(ring.evictedBefore).toBe(Number.NEGATIVE_INFINITY)
  })

  it('overwrites the oldest value once full, and never grows', () => {
    const ring = new FixedRing<number>(3)
    for (let value = 0; value < 3; value++) {
      ring.push(value)
    }
    expect(ring.evictedBefore).toBe(Number.NEGATIVE_INFINITY)
    ring.push(3)
    ring.push(4)
    expect(ring.toArray()).toEqual([2, 3, 4])
    expect([ring.firstIndex, ring.endIndex, ring.length, ring.evictedBefore]).toEqual([2, 5, 3, 2])
    expect(ring.at(1)).toBeUndefined()
  })

  it('writes over a held value, fills a hole, and drops a write below what it holds', () => {
    const ring = new FixedRing<number | null>(5, 10)
    ring.put(10, 1, null)
    ring.put(13, 4, null)
    expect(ring.toArray()).toEqual([1, null, null, 4])
    ring.put(11, 2, null)
    expect(ring.toArray()).toEqual([1, 2, null, 4])
    ring.put(16, 7, null)
    expect(ring.toArray()).toEqual([null, 4, null, null, 7])
    expect(ring.firstIndex).toBe(12)
    ring.put(11, 9, null)
    expect(ring.at(11)).toBeUndefined()
  })

  it('jumps a gap longer than itself, keeping only its last capacity', () => {
    const ring = new FixedRing<number | null>(3)
    ring.push(1)
    ring.put(100, 5, null)
    expect([ring.firstIndex, ring.endIndex]).toEqual([98, 101])
    expect(ring.toArray()).toEqual([null, null, 5])
    expect(ring.evictedBefore).toBe(98)
  })

  it('restarts empty at a new index', () => {
    const ring = new FixedRing<number>(2)
    ring.push(1)
    ring.push(2)
    ring.push(3)
    ring.restart(500)
    expect([ring.firstIndex, ring.endIndex, ring.evictedBefore]).toEqual([500, 500, Number.NEGATIVE_INFINITY])
    expect(ring.toArray()).toEqual([])
  })

  it('refuses a capacity that is not a positive whole number', () => {
    expect(() => new FixedRing(0)).toThrow(RangeError)
    expect(() => new FixedRing(1.5)).toThrow(RangeError)
  })
})
