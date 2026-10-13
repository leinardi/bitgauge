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

import type { Clock, TimerId } from '@/engine/types'

// A Clock for the engine tests: time moves only when a test advances it, and timers fire in order
// of their due time, then of their creation.

interface Timer {
  id: TimerId
  due: number
  fn: () => void
}

export class FakeClock implements Clock {
  private time = 0
  private nextId = 1
  private timers: Timer[] = []

  now(): number {
    return this.time
  }

  setTimer(ms: number, fn: () => void): TimerId {
    const id = this.nextId++
    this.timers.push({ id, due: this.time + Math.max(0, ms), fn })
    return id
  }

  clearTimer(id: TimerId): void {
    this.timers = this.timers.filter((timer) => timer.id !== id)
  }

  /** The timers still pending. */
  get pending(): number {
    return this.timers.length
  }

  /**
   * Moves time forward by `ms`, firing each timer due on the way at its due time. Promise
   * callbacks queued by a timer, or before the call, run before the next timer fires.
   */
  async advance(ms: number): Promise<void> {
    const end = this.time + ms
    await flush()
    for (;;) {
      const next = this.timers
        .filter((timer) => timer.due <= end)
        .sort((a, b) => a.due - b.due || a.id - b.id)[0]
      if (next === undefined) {
        break
      }
      this.timers = this.timers.filter((timer) => timer !== next)
      this.time = next.due
      next.fn()
      await flush()
    }
    this.time = end
  }
}

/** Lets every queued promise callback run. */
async function flush(): Promise<void> {
  for (let round = 0; round < 10; round++) {
    await Promise.resolve()
  }
}
