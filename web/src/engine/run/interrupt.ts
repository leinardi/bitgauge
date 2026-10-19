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

import type { RunErrorCode } from '@/engine/run/report'

// How a run ends early (edge-cases.md sections 2, 5, 6, 11 and 15): a user stop, at an earlier
// instant for a page the browser paused, or an error. The first interruption is the run's; every
// wait the run guards settles once it is recorded.

export type Interrupt = { kind: 'stop'; at?: number } | { kind: 'error'; code: RunErrorCode }

export class Interruption {
  private current: Interrupt | null = null
  private wake: () => void = () => undefined
  private readonly woken: Promise<null>

  constructor() {
    this.woken = new Promise((resolve) => {
      this.wake = () => resolve(null)
    })
  }

  /** The run's interruption, or null while it runs uninterrupted. */
  get value(): Interrupt | null {
    return this.current
  }

  /** Records `interrupt` unless one already was; false when it was not recorded. */
  record(interrupt: Interrupt): boolean {
    if (this.current !== null) {
      return false
    }
    this.current = interrupt
    return true
  }

  /** Settles every guarded wait, once the interruption is recorded and its phase told to stop. */
  release(): void {
    this.wake()
  }

  /** Settles with `promise`, or with null once the run is interrupted. */
  guard<T>(promise: Promise<T>): Promise<T | null> {
    return Promise.race([promise, this.woken])
  }
}
