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

// The preparation turn of measurement.md section 7.2: of the upload requests of at least 1 MiB,
// one at a time may be preparing, from its send until upload progress first reports a byte sent,
// its end, or 1 s, whichever comes first. Streams take the turn in the order they asked for it.

/** Upload requests from this size on wait for the turn. */
export const TURN_MIN_BYTES = 1024 * 1024

/** A request holds the turn at most this long after its send. */
export const TURN_MAX_MS = 1000

/** A request's hold on the turn, from the moment the turn is its own. */
export interface TurnHold {
  /** The request is sent: the hold ends at the latest TURN_MAX_MS from now. */
  sent(): void
  /** Upload progress reported `bytes` sent; the first byte ends the hold. */
  progress(bytes: number): void
  /** Ends the hold; later calls change nothing. */
  release(): void
}

/** The hold of a request that does not wait for the turn. */
export const NO_HOLD: TurnHold = {
  sent: () => undefined,
  progress: () => undefined,
  release: () => undefined,
}

class Hold implements TurnHold {
  readonly released: Promise<void>
  private readonly clock: Clock
  private resolve: () => void = () => undefined
  private timer: TimerId | null = null
  private open = true

  constructor(clock: Clock) {
    this.clock = clock
    this.released = new Promise((resolve) => {
      this.resolve = resolve
    })
  }

  sent(): void {
    if (this.open) {
      this.timer = this.clock.setTimer(TURN_MAX_MS, () => this.release())
    }
  }

  progress(bytes: number): void {
    if (bytes > 0) {
      this.release()
    }
  }

  release(): void {
    if (!this.open) {
      return
    }
    this.open = false
    if (this.timer !== null) {
      this.clock.clearTimer(this.timer)
    }
    this.resolve()
  }
}

export class PreparationTurn {
  private readonly clock: Clock
  /** Resolves when the last request to ask for the turn has released it. */
  private last: Promise<void> = Promise.resolve()
  /** Set once the browser showed it reports no upload progress: no request waits any more. */
  private dropped = false

  constructor(clock: Clock) {
    this.clock = clock
  }

  /** Whether a request of `size` bytes waits for the turn. */
  waits(size: number): boolean {
    return !this.dropped && size >= TURN_MIN_BYTES
  }

  /** Resolves with the caller's hold once every earlier request has released the turn. */
  take(): Promise<TurnHold> {
    const hold = new Hold(this.clock)
    const before = this.last
    this.last = hold.released
    return before.then(() => hold)
  }

  /** A confirmed request of at least 1 MiB with no byte reported sent drops the turn. */
  confirmed(size: number, sent: number): void {
    if (size >= TURN_MIN_BYTES && sent === 0) {
      this.dropped = true
    }
  }
}
