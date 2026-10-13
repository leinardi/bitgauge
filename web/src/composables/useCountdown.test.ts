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

// The auto-start countdown on fake timers: 3 s, then the run; Cancel stops it, Start now ends it at
// once, and a hidden page pauses it until it is visible again (ui/flows.md section 2).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { useCountdown } from '@/composables/useCountdown'

function setVisible(visible: boolean): void {
  Object.defineProperty(document, 'visibilityState', { value: visible ? 'visible' : 'hidden', configurable: true })
}

function counting() {
  const scope = effectScope()
  const countdown = scope.run(() => useCountdown())
  if (countdown === undefined) {
    throw new Error('no countdown')
  }
  const done = vi.fn()
  return { countdown, done, scope }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'visibilityState')
})

describe('the countdown', () => {
  it('counts 3 s, then starts the run once', () => {
    const { countdown, done, scope } = counting()
    expect(countdown.remainingMs.value).toBeNull()
    countdown.start(done)
    expect(countdown.remainingMs.value).toBe(3000)
    vi.advanceTimersByTime(1000)
    expect(countdown.remainingMs.value).toBe(2000)
    vi.advanceTimersByTime(1900)
    expect(done).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(done).toHaveBeenCalledOnce()
    expect(countdown.remainingMs.value).toBeNull()
    vi.advanceTimersByTime(5000)
    expect(done).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('stops on cancel without starting', () => {
    const { countdown, done, scope } = counting()
    countdown.start(done)
    vi.advanceTimersByTime(1500)
    countdown.cancel()
    expect(countdown.remainingMs.value).toBeNull()
    vi.advanceTimersByTime(5000)
    expect(done).not.toHaveBeenCalled()
    scope.stop()
  })

  it('starts at once on Start now', () => {
    const { countdown, done, scope } = counting()
    countdown.start(done)
    countdown.now()
    expect(done).toHaveBeenCalledOnce()
    expect(countdown.remainingMs.value).toBeNull()
    vi.advanceTimersByTime(5000)
    expect(done).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('pauses while the page is hidden', () => {
    const { countdown, done, scope } = counting()
    countdown.start(done)
    vi.advanceTimersByTime(1000)
    setVisible(false)
    vi.advanceTimersByTime(10_000)
    expect(countdown.remainingMs.value).toBe(2000)
    expect(done).not.toHaveBeenCalled()
    setVisible(true)
    vi.advanceTimersByTime(2000)
    expect(done).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('ends with its scope', () => {
    const { countdown, done, scope } = counting()
    countdown.start(done)
    scope.stop()
    vi.advanceTimersByTime(5000)
    expect(done).not.toHaveBeenCalled()
  })
})
