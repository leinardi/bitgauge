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

// The demo's Clock (frontend.md section 9): the wiring's real-time clock, run `speed` times faster,
// so a scenario of half a minute plays in a few seconds. It can stand in for a slow timer or a busy
// Worker, and hold still so that a screen stays in one state.

export interface DemoClockOptions {
  /** How many demo milliseconds pass per real one. */
  speed: number
  /** A coarser timer: every reading is a multiple of it, and it is the reported resolution. */
  resolutionMs?: number | null
  /** The busy share of the elapsed time to report, instead of the real Worker's. */
  busyFraction?: number | null
}

export class DemoClock implements Clock {
  readonly resolutionMs: number
  readonly crossOriginIsolated: boolean
  private readonly base: Clock
  private readonly speed: number
  private readonly origin: number
  private readonly quantum: number | null
  private readonly busyFraction: number | null
  private heldAt: number | null = null

  constructor(base: Clock, options: DemoClockOptions) {
    if (!(options.speed > 0)) {
      throw new RangeError('the demo speed must be positive')
    }
    if (options.resolutionMs != null && !(options.resolutionMs > 0)) {
      throw new RangeError('a demo timer resolution must be positive')
    }
    this.base = base
    this.speed = options.speed
    this.origin = base.now()
    this.quantum = options.resolutionMs ?? null
    this.busyFraction = options.busyFraction ?? null
    this.resolutionMs = this.quantum ?? base.resolutionMs
    this.crossOriginIsolated = this.quantum === null && base.crossOriginIsolated
  }

  now(): number {
    if (this.heldAt !== null) {
      return this.heldAt
    }
    const elapsed = (this.base.now() - this.origin) * this.speed
    return this.quantum === null ? elapsed : Math.floor(elapsed / this.quantum) * this.quantum
  }

  setTimer(ms: number, fn: () => void): TimerId {
    // A held clock fires nothing: the run waits where it is until the next scenario replaces it.
    return this.base.setTimer(Math.max(0, ms) / this.speed, () => (this.heldAt === null ? fn() : undefined))
  }

  clearTimer(id: TimerId): void {
    this.base.clearTimer(id)
  }

  busyMs(): number {
    return this.busyFraction === null ? this.base.busyMs() * this.speed : this.now() * this.busyFraction
  }

  /** Stops time for good: every reading from now on is this instant, and no timer fires. */
  hold(): void {
    this.heldAt ??= this.now()
  }
}
