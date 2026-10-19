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

/** A deterministic sequence in [0, 1), so a failure replays. */
function sequence(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
}

/** A pinned track and its unbounded reference, fed the same ticks: every 100 ms, with jitter. */
function tracks(pinAt: number, ticks: number, busy: (at: number, step: number) => number, seed = 1) {
  const random = sequence(seed)
  const pinned = new BusyTrack()
  const reference = new BusyTrack()
  let at = 0
  let busyMs = 0
  const instants: number[] = []
  for (let tick = 0; tick < ticks; tick++) {
    const step = 100 + (random() - 0.5) * 20
    at += step
    busyMs += busy(at, step) * step
    pinned.record(at, busyMs)
    reference.record(at, busyMs)
    instants.push(at)
    if (at >= pinAt && instants.at(-2) !== undefined && (instants.at(-2) ?? 0) < pinAt) {
      pinned.pin(pinAt)
    }
  }
  return { pinned, reference, last: at, instants }
}

describe('a pinned busy track', () => {
  const random = sequence(7)
  /** A Worker busy between 20 % and 100 % of each tick. */
  const noisy = () => 0.2 + 0.8 * random()

  it('answers every span from near the pin to anywhere in the ring exactly as the unbounded track', () => {
    // 20 minutes of ticks, pinned at 60 s: the ring keeps the last 10 minutes.
    const { pinned, reference, last } = tracks(60_000, 12_000, noisy)
    const check = sequence(3)
    for (let trial = 0; trial < 500; trial++) {
      const from = 60_000 + (check() - 0.5) * 50_000
      const to = last - check() * 590_000
      expect(pinned.fraction(from, to), `from ${from}, to ${to}`).toBe(reference.fraction(from, to))
      expect(pinned.fraction(from, to)).not.toBeNull()
    }
  })

  it('answers a delayed upload confirmation, its window end 2 s before the latest tick', () => {
    const { pinned, reference, last } = tracks(10_000, 3000, noisy)
    expect(pinned.fraction(10_300, last - 2000)).toBe(reference.fraction(10_300, last - 2000))
    expect(pinned.fraction(10_300, last - 2000)).not.toBeNull()
  })

  it('answers a stop: the span ends at the stop’s tick', () => {
    const { pinned, reference, last } = tracks(10_000, 900, noisy)
    // The run records one more sample at its stop, between two ticks.
    pinned.record(last + 40, 0)
    reference.record(last + 40, 0)
    expect(pinned.fraction(10_000, last + 40)).toBe(reference.fraction(10_000, last + 40))
    expect(pinned.fraction(10_000, last + 40)).not.toBeNull()
  })

  it('answers a hidden page that ends at the last on-time tick', () => {
    const { pinned, reference, last } = tracks(10_000, 900, noisy)
    // The paused page's next tick comes 40 s late; the window ends at the last on-time one.
    pinned.record(last + 40_000, 40_000)
    reference.record(last + 40_000, 40_000)
    expect(pinned.fraction(10_000, last)).toBe(reference.fraction(10_000, last))
    expect(pinned.fraction(10_000, last)).not.toBeNull()
  })

  it('reads a window end between its real neighbors: busy through second 9, idle in second 10, is 1.0 to 9 s', () => {
    const pinned = new BusyTrack()
    for (let at = 0; at <= 10_000; at += 100) {
      pinned.record(at, Math.min(at, 9000))
      if (at === 100) {
        pinned.pin(100)
      }
    }
    expect(pinned.fraction(0, 9000)).toBe(1)
    expect(pinned.fraction(0, 10_000)).toBe(0.9)
  })

  it('reads a window start a few hundred ms off the pin, as an upload display offset places it, exactly', () => {
    const { pinned, reference } = tracks(30_000, 3000, (at) => (at < 30_000 ? 0.1 : 1))
    for (const from of [29_550, 29_800, 30_000, 30_270, 30_640]) {
      expect(pinned.fraction(from, 200_000)).toBe(reference.fraction(from, 200_000))
      expect(pinned.fraction(from, 200_000)).not.toBeNull()
    }
  })

  it('answers nothing for a span outside what it kept, never a guess', () => {
    const { pinned, reference, last } = tracks(60_000, 12_000, noisy)
    // Before the pinned span, whose samples were dropped.
    expect(pinned.fraction(20_000, last)).toBeNull()
    // After it, in the dropped stretch.
    expect(pinned.fraction(120_000, last)).toBeNull()
    // An end older than the ring.
    expect(pinned.fraction(60_000, last - 700_000)).toBeNull()
    // The reference answers each of them.
    expect(reference.fraction(20_000, last)).not.toBeNull()
    expect(reference.fraction(60_000, last - 700_000)).not.toBeNull()
  })

  it('answers an end exactly at the ring’s oldest sample and a start exactly at the pinned span’s first', () => {
    const pinned = new BusyTrack()
    for (let tick = 1; tick <= 9000; tick++) {
      // Half busy throughout: 50 ms in every 100 ms tick.
      pinned.record(tick * 100, tick * 50)
      if (tick === 600) {
        pinned.pin(60_000)
      }
    }
    // The pinned span starts at 30 s; the ring's oldest sample is 6000 ticks before the latest.
    expect(pinned.fraction(30_000, 300_100)).toBeCloseTo(0.5, 12)
    expect(pinned.fraction(29_950, 300_100)).toBeNull()
    expect(pinned.fraction(30_000, 300_050)).toBeNull()
  })

  it('answers a span before the pin from the run’s first sample on, when nothing before it was dropped', () => {
    const { pinned, reference } = tracks(5000, 3000, noisy)
    expect(pinned.fraction(0, 200_000)).toBe(reference.fraction(0, 200_000))
  })

  it('keeps a constant number of samples once the pinned span has passed', () => {
    const pinned = new BusyTrack()
    const footprints: number[] = []
    for (let tick = 1; tick <= 9000; tick++) {
      pinned.record(tick * 100, tick * 50)
      if (tick === 300) {
        pinned.pin(30_000)
      }
      if (tick === 3000 || tick === 9000) {
        footprints.push(pinned.footprint())
      }
    }
    // 30 s either side of the pin at 100 ms, and the ring.
    expect(footprints).toEqual([600 + 6000, 600 + 6000])
  })

  it('is unchanged while unpinned: it keeps every sample', () => {
    const track = new BusyTrack()
    for (let tick = 1; tick <= 1000; tick++) {
      track.record(tick * 100, tick * 50)
    }
    expect(track.footprint()).toBe(1000)
  })
})
