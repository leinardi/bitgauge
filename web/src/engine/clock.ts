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
import { resolutionOf } from '@/engine/wiring'

// The production Clock (frontend.md section 2): performance.now() and the Worker's timers, the
// busy time of its own tasks for the busy fraction (measurement.md section 16), the detected timer
// resolution and cross-origin isolation (edge-cases.md section 9).

/** Consecutive differences sampled to detect the resolution, within at most 50 ms. */
const RESOLUTION_STEPS = 21
const RESOLUTION_LIMIT_MS = 50

/** The differences between consecutive distinct readings of performance.now(). */
function readingSteps(): number[] {
  const deltas: number[] = []
  const start = performance.now()
  let last = start
  while (deltas.length < RESOLUTION_STEPS) {
    const now = performance.now()
    if (now - start > RESOLUTION_LIMIT_MS) {
      break
    }
    if (now !== last) {
      deltas.push(now - last)
      last = now
    }
  }
  return deltas
}

export class BrowserClock implements Clock {
  readonly resolutionMs: number
  readonly crossOriginIsolated: boolean
  private busy = 0
  /** How many measured tasks are running: a task inside another is counted once. */
  private depth = 0

  constructor() {
    const steps = readingSteps()
    // A clock coarser than the sampling window changed at most once: its resolution is at least
    // the window, which is what is reported.
    this.resolutionMs = steps.length < 2 ? RESOLUTION_LIMIT_MS : resolutionOf(steps)
    this.crossOriginIsolated = self.crossOriginIsolated
  }

  now(): number {
    return performance.now()
  }

  setTimer(ms: number, fn: () => void): TimerId {
    return self.setTimeout(() => this.task(fn), ms)
  }

  clearTimer(id: TimerId): void {
    self.clearTimeout(id)
  }

  busyMs(): number {
    return this.busy
  }

  /** Runs one of the Worker's own tasks (a timer, a message, a network callback) and counts its time. */
  task<T>(fn: () => T): T {
    if (this.depth > 0) {
      return fn()
    }
    const start = performance.now()
    this.depth++
    try {
      return fn()
    } finally {
      this.depth--
      this.busy += performance.now() - start
    }
  }

  /** Counts time a task took that the caller measured itself, as between two chunk reads. */
  count(ms: number): void {
    if (ms > 0) {
      this.busy += ms
    }
  }
}
