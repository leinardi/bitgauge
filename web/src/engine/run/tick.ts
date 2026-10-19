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

import type { BusyTrack } from '@/engine/stats/busy'
import type { Clock, TimerId } from '@/engine/types'

// The run's housekeeping tick (measurement.md sections 14 and 16, edge-cases.md section 15): every
// 100 ms it records the Worker's busy time, lets the run emit its live sample, and reports a tick
// that came more than 1 s late, the sign of a throttled or paused Worker.

const TICK_MS = 100
const LATE_MS = 1000

interface TickOptions {
  clock: Clock
  busy: BusyTrack
  /** A tick more than 1 s late, with the instant of the last on-time one. */
  late: (lastTick: number) => void
  /** Every tick, after the busy time is recorded. */
  tick: (now: number) => void
}

export class Housekeeping {
  private readonly options: TickOptions
  private lastTick: number | null = null
  private timer: TimerId | null = null

  constructor(options: TickOptions) {
    this.options = options
  }

  /** Ticks now and every 100 ms after it. */
  start(): void {
    const { clock, busy } = this.options
    const now = clock.now()
    const last = this.lastTick
    if (last !== null && now - last - TICK_MS > LATE_MS) {
      this.options.late(last)
    }
    this.lastTick = now
    busy.record(now, clock.busyMs())
    this.options.tick(now)
    this.timer = clock.setTimer(TICK_MS, () => this.start())
  }

  stop(): void {
    if (this.timer !== null) {
      this.options.clock.clearTimer(this.timer)
    }
  }
}
