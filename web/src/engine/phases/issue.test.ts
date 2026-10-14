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

// The issue gap and early issue of measurement.md section 3.

import { describe, expect, it } from 'vitest'

import { deferred, doneBefore, ISSUE_GAP_MS, IssueGaps, issueGap, issuesEarly } from '@/engine/phases/issue'
import { FakeClock } from '@/engine/test/fakeClock'

describe('issueGap', () => {
  it('is the client duration minus the transfer and the RTT, counted from the issue', () => {
    // Issued at 1000, first byte at 1154 (4 ms RTT + 150 ms gap), last byte at 2154.
    expect(issueGap(1000, null, 2154, 1000, 4)).toBe(150)
  })

  it('is counted from the previous request end when the request was issued early', () => {
    // Issued at 900, while the previous request still ran until 1000.
    expect(issueGap(900, 1000, 2154, 1000, 4)).toBe(150)
    expect(issueGap(1000, 900, 2154, 1000, 4)).toBe(150)
  })

  it('never goes below zero', () => {
    expect(issueGap(1000, null, 2000, 1000, 4)).toBe(0)
  })
})

describe('IssueGaps', () => {
  it('turns to early issue once a gap over 50 ms has shown, with the largest gap as the lead', () => {
    const gaps = new IssueGaps()
    gaps.record(ISSUE_GAP_MS)
    expect(gaps.early).toBe(false)
    expect(gaps.leadMs).toBeNull()
    gaps.record(150)
    gaps.record(80)
    expect(gaps.early).toBe(true)
    expect(gaps.leadMs).toBe(150)
  })
})

describe('issuesEarly', () => {
  it('resolves true by the lead before the expected end, once the first byte has come', async () => {
    const clock = new FakeClock()
    const first = deferred<number>()
    const done = deferred<void>()
    const instants: number[] = []
    const early = issuesEarly(clock, 150, { firstByte: first.promise, done: done.promise, expectedMs: 1000, tailMs: 4 }).then((value) => {
      instants.push(clock.now())
      return value
    })
    await clock.advance(154)
    first.resolve(154)
    // The expected end is 154 + 4 + 1000 = 1158; the lead puts the issue at 1008.
    await clock.advance(1000)
    expect(await early).toBe(true)
    expect(instants).toEqual([1008])
  })

  it('never issues before the first byte, when the lead exceeds the transfer', async () => {
    const clock = new FakeClock()
    const first = deferred<number>()
    const done = deferred<void>()
    const early = issuesEarly(clock, 1670, { firstByte: first.promise, done: done.promise, expectedMs: 1000, tailMs: 8 })
    await clock.advance(1670)
    first.resolve(1670)
    await clock.advance(1)
    expect(await early).toBe(true)
    expect(clock.now()).toBe(1671)
  })

  it('resolves false when the request ends first, or when the phase does not issue early', async () => {
    const clock = new FakeClock()
    const first = deferred<number>()
    const done = deferred<void>()
    const early = issuesEarly(clock, 150, { firstByte: first.promise, done: done.promise, expectedMs: 1000, tailMs: 0 })
    first.resolve(0)
    done.resolve()
    expect(await early).toBe(false)
    expect(await issuesEarly(clock, null, { firstByte: first.promise, done: done.promise, expectedMs: 1000, tailMs: 0 })).toBe(false)
    expect(await issuesEarly(clock, 150, { firstByte: first.promise, done: done.promise, expectedMs: null, tailMs: 0 })).toBe(false)
  })

  it('doneBefore clears its timer when the request ends first', async () => {
    const clock = new FakeClock()
    const done = deferred<void>()
    const before = doneBefore(clock, 500, done.promise)
    done.resolve()
    expect(await before).toBe(true)
    expect(clock.pending).toBe(0)
    const late = doneBefore(clock, clock.now() + 10, new Promise(() => undefined))
    await clock.advance(10)
    expect(await late).toBe(false)
  })
})
