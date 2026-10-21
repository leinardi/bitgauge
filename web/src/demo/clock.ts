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
// Worker, and hold still so that a screen stays in one state. A scheduled clock runs its own
// timers: each due timer runs in a task of its own, in order of its instant, reading that instant,
// unclamped by the browser's few milliseconds for a nested timer. Its time is event time: it
// moves from one timer's instant to the next, and stays there while the work that timer started
// goes on, so a run reads the same instants however late the browser runs its tasks. Real time
// only paces it, and only an outside message (sync) moves it on between timers. It can change its
// speed on the way, and pause where it is until the page answers.

/** The grid a scheduled clock's sync lands on, a whole multiple of every grid the demo counts on. */
const SYNC_GRID_MS = 1000

export interface DemoClockOptions {
  /** How many demo milliseconds pass per real one. */
  speed: number
  /** A coarser timer: every reading is a multiple of it, and it is the reported resolution. */
  resolutionMs?: number | null
  /** The busy share of the elapsed time to report, instead of the real Worker's. */
  busyFraction?: number | null
  /**
   * Runs `fn` in a task of its own, soon and unclamped, for a scheduled clock; absent, the clock
   * fires its timers on the base clock's and reads real time.
   */
  nextTask?: ((fn: () => void) => void) | null
}

interface Scheduled {
  id: TimerId
  due: number
  fn: () => void
}

export class DemoClock implements Clock {
  readonly resolutionMs: number
  readonly crossOriginIsolated: boolean
  private readonly base: Clock
  private speed: number
  /** The base instant the current speed runs from, and the demo time it read then. */
  private origin: number
  private offset = 0
  private readonly quantum: number | null
  private readonly busyFraction: number | null
  private heldAt: number | null = null
  /** A scheduled clock's paused instant: it reads this and fires nothing until resumed. */
  private pausedAt: number | null = null
  /** A scheduled clock's event time: the instant of the last timer it ran, or of the last sync. */
  private last = 0
  private nextTimer = 1
  /** Each timer's base timer, which a timer armed before a speed change replaces. */
  private readonly timers = new Map<TimerId, TimerId>()
  /** A scheduled clock's own timers, in order of their instants, and how it runs them. */
  private readonly nextTask: ((fn: () => void) => void) | null
  private queue: Scheduled[] = []
  /** The instant of the scheduled timer running now, which every reading meanwhile is. */
  private firing: number | null = null
  private waiting: TimerId | null = null
  private posted = false

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
    this.nextTask = options.nextTask ?? null
    this.resolutionMs = this.quantum ?? base.resolutionMs
    this.crossOriginIsolated = this.quantum === null && base.crossOriginIsolated
  }

  now(): number {
    if (this.heldAt !== null) {
      return this.heldAt
    }
    if (this.pausedAt !== null) {
      return this.pausedAt
    }
    const reading = this.reading()
    return this.quantum === null ? reading : Math.floor(reading / this.quantum) * this.quantum
  }

  setTimer(ms: number, fn: () => void): TimerId {
    const id = this.nextTimer++
    if (this.nextTask !== null) {
      const due = this.reading() + Math.max(0, ms)
      // After every timer of the same instant or earlier, as the browser orders its own.
      const at = this.queue.findIndex((timer) => timer.due > due)
      this.queue.splice(at === -1 ? this.queue.length : at, 0, { id, due, fn })
      this.wake()
      return id
    }
    const due = this.elapsed() + Math.max(0, ms)
    const arm = (waitMs: number) => {
      const speed = this.speed
      this.timers.set(
        id,
        this.base.setTimer(waitMs / speed, () => {
          // A held clock fires nothing: the run waits where it is until the next scenario replaces it.
          if (this.heldAt !== null) {
            return
          }
          // Armed at another speed, it would fire early or late in demo time: it waits for the rest.
          const left = due - this.elapsed()
          if (speed !== this.speed && left > 0) {
            arm(left)
            return
          }
          this.timers.delete(id)
          fn()
        }),
      )
    }
    arm(Math.max(0, ms))
    return id
  }

  clearTimer(id: TimerId): void {
    if (this.nextTask !== null) {
      this.queue = this.queue.filter((timer) => timer.id !== id)
      return
    }
    const timer = this.timers.get(id)
    if (timer !== undefined) {
      this.base.clearTimer(timer)
      this.timers.delete(id)
    }
  }

  busyMs(): number {
    return this.busyFraction === null ? this.base.busyMs() * this.speed : this.now() * this.busyFraction
  }

  /** Runs at `speed` from now on, demo time carrying on from where it is. */
  setSpeed(speed: number): void {
    if (!(speed > 0)) {
      throw new RangeError('the demo speed must be positive')
    }
    const at = this.nextTask === null ? this.elapsed() : this.reading()
    this.speed = speed
    this.rebase(at)
  }

  /**
   * Moves a scheduled clock's event time on to real time, never past its next timer: for a message
   * from outside, which arrives in real time. It lands on a whole second, so a run started by it
   * meets the same instants of everything the demo counts on a fixed grid (the transport's
   * buckets, the link's ticks), wherever in the second the message arrived. A paused clock stays
   * where it is.
   */
  sync(): void {
    if (this.nextTask === null || this.firing !== null || this.pausedAt !== null) {
      return
    }
    const real = Math.ceil(this.elapsed() / SYNC_GRID_MS) * SYNC_GRID_MS
    const next = this.queue[0]
    this.last = Math.max(this.last, next === undefined ? real : Math.min(real, next.due))
    // Ahead of real time, it paces on from there rather than waiting for real time to catch up.
    if (this.last > this.elapsed()) {
      this.rebase(this.last)
    }
  }

  /** Stops a scheduled clock where it is until `resume`: it reads this instant and fires nothing. */
  pause(): void {
    if (this.nextTask !== null) {
      this.pausedAt ??= this.reading()
    }
  }

  /** Carries a paused clock on from its paused instant, as if no real time had passed meanwhile. */
  resume(): void {
    const at = this.pausedAt
    if (at === null) {
      return
    }
    this.pausedAt = null
    this.last = at
    this.rebase(at)
  }

  /** Stops time for good: every reading from now on is this instant, and no timer fires. */
  hold(): void {
    this.heldAt ??= this.now()
  }

  /** Paces the clock from `at`, demo time, at the current speed from now on. */
  private rebase(at: number): void {
    this.offset = at
    this.origin = this.base.now()
    if (this.waiting !== null) {
      this.base.clearTimer(this.waiting)
      this.waiting = null
    }
    this.wake()
  }

  /** The demo milliseconds since the clock started, unquantized. */
  private elapsed(): number {
    return this.offset + (this.base.now() - this.origin) * this.speed
  }

  /** The unquantized reading: real time, or a scheduled clock's event time. */
  private reading(): number {
    if (this.nextTask === null) {
      return this.elapsed()
    }
    return this.firing ?? this.last
  }

  /** Runs the next scheduled timer in a task of its own once it is due, or waits on the base clock until it is. */
  private wake(): void {
    const next = this.queue[0]
    if (this.heldAt !== null || this.pausedAt !== null || this.posted || next === undefined) {
      return
    }
    const left = next.due - this.elapsed()
    if (left <= 0) {
      this.posted = true
      this.nextTask?.(() => {
        this.posted = false
        this.fire()
      })
      return
    }
    if (this.waiting !== null) {
      this.base.clearTimer(this.waiting)
    }
    this.waiting = this.base.setTimer(left / this.speed, () => {
      this.waiting = null
      this.wake()
    })
  }

  private fire(): void {
    const next = this.queue[0]
    if (this.heldAt !== null || this.pausedAt !== null || next === undefined) {
      return
    }
    if (next.due <= this.elapsed()) {
      this.queue.shift()
      this.firing = next.due
      this.last = next.due
      try {
        next.fn()
      } finally {
        // A timer that throws still leaves the next one posted.
        this.firing = null
        this.wake()
      }
      return
    }
    this.wake()
  }
}
