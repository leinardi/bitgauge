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

// The automatic checks of an unreachable server: after 2, 4, 8 and 16 s, then every 30 s, counted
// only while the page is visible; Retry checks at once and starts the schedule over.

import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getInfo } from '@/api/info'
import { useInfo } from '@/composables/useInfo'
import { infoFixture } from '@/test/fixtures'

vi.mock('@/api/info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/info')>()),
  getInfo: vi.fn(),
}))

function setVisible(visible: boolean): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') })
}

/** Runs the timers one second at a time, letting each check settle. */
async function seconds(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    vi.advanceTimersByTime(1000)
    await flushPromises()
  }
}

afterEach(() => {
  vi.useRealTimers()
  setVisible(true)
})

describe('useInfo', () => {
  it('checks an unreachable server again on a growing schedule while visible, and Retry starts it over', async () => {
    vi.useFakeTimers()
    vi.mocked(getInfo).mockRejectedValue(new TypeError('network'))
    const { refresh, reachability, nextCheckS } = useInfo()
    await refresh()
    expect(reachability.value).toBe('unreachable')
    expect(nextCheckS.value).toBe(2)
    await seconds(1)
    expect(nextCheckS.value).toBe(1)
    await seconds(1)
    expect(getInfo).toHaveBeenCalledTimes(2)
    expect(nextCheckS.value).toBe(4)
    await seconds(4)
    expect(nextCheckS.value).toBe(8)
    await seconds(8)
    expect(nextCheckS.value).toBe(16)
    await seconds(16)
    expect(nextCheckS.value).toBe(30)
    await seconds(30)
    expect(nextCheckS.value).toBe(30)
    expect(getInfo).toHaveBeenCalledTimes(6)

    // Hidden, the count stands still.
    setVisible(false)
    await seconds(60)
    expect(nextCheckS.value).toBe(30)
    expect(getInfo).toHaveBeenCalledTimes(6)
    setVisible(true)

    await refresh()
    expect(getInfo).toHaveBeenCalledTimes(7)
    expect(nextCheckS.value).toBe(2)

    vi.mocked(getInfo).mockResolvedValue(infoFixture())
    await seconds(2)
    expect(reachability.value).toBe('connected')
    expect(nextCheckS.value).toBeNull()
    await seconds(60)
    expect(getInfo).toHaveBeenCalledTimes(8)
  })
})
