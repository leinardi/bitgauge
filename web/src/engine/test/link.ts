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

import type { Direction } from '@/engine/messages'
import { BUCKET_MS } from '@/engine/stats/units'
import type { FakeClock } from '@/engine/test/fakeClock'

// The fake transport's bottleneck, on the shared-link model of measurement.md section 19.1: per
// direction, the transfers whose bytes are crossing it share its rate equally, stepped one
// millisecond at a time on the FakeClock.

/** The link a scenario describes. */
export interface LinkModel {
  /** The bottleneck's goodput in bytes per second at instant `atMs`. */
  rate: (direction: Direction, atMs: number) => number
  /** The most one request can carry in bytes per second, such as a connection's CPU limit. */
  perRequest?: number
  /** The server grid's instant minus the client's. */
  gridOffsetMs?: number
}

export interface Transfer {
  direction: Direction
  /** The bytes this transfer moves: the request's size, or fewer for a short body. */
  target: number
  firstByteAt: number
  read: number
  /** On upload, the bytes per server cell from the cell of the first byte on. */
  cells: number[]
  startMs: number | null
  /** Called each millisecond with the whole bytes moved and the bytes moved so far. */
  moved: (bytes: number, total: number, at: number) => void
  /** Called once the last byte has crossed, at the end of its millisecond. */
  done: (at: number) => void
}

export class Link {
  /** The whole bytes the bottleneck carried per 100 ms cell of the client clock, per direction. */
  readonly carried: Record<Direction, number[]> = { download: [], upload: [] }
  /** The largest number of transfers that were in flight together, per direction. */
  readonly peakInFlight: Record<Direction, number> = { download: 0, upload: 0 }
  private readonly clock: FakeClock
  private readonly model: LinkModel
  private transfers: Transfer[] = []
  private ticking = false
  private lastTick = -1

  constructor(clock: FakeClock, model: LinkModel) {
    this.clock = clock
    this.model = model
  }

  /** Puts a transfer on the link; its bytes start to cross at `firstByteAt`. */
  start(direction: Direction, target: number, firstByteAt: number, callbacks: Pick<Transfer, 'moved' | 'done'>): Transfer {
    const transfer: Transfer = { direction, target, firstByteAt, read: 0, cells: [], startMs: null, ...callbacks }
    this.transfers.push(transfer)
    const inFlight = this.transfers.filter((other) => other.direction === direction).length
    this.peakInFlight[direction] = Math.max(this.peakInFlight[direction], inFlight)
    if (!this.ticking) {
      this.ticking = true
      this.clock.setTimer(this.lastTick === this.clock.now() ? 1 : 0, () => this.tick())
    }
    return transfer
  }

  drop(transfer: Transfer): void {
    this.transfers = this.transfers.filter((other) => other !== transfer)
  }

  /** Moves one millisecond of bytes in both directions. */
  private tick(): void {
    const now = this.clock.now()
    this.lastTick = now
    const offset = this.model.gridOffsetMs ?? 0
    for (const direction of ['download', 'upload'] as const) {
      const reading = this.transfers.filter((transfer) => transfer.direction === direction && transfer.firstByteAt <= now)
      const fair = reading.length === 0 ? 0 : this.model.rate(direction, now) / reading.length
      const share = Math.min(fair, this.model.perRequest ?? Number.POSITIVE_INFINITY) / 1000
      for (const transfer of reading) {
        transfer.startMs ??= now
        const bytes = Math.min(share, transfer.target - transfer.read)
        const before = transfer.read
        transfer.read += bytes
        if (direction === 'upload') {
          const index = Math.floor((now + offset) / BUCKET_MS) - Math.floor((transfer.startMs + offset) / BUCKET_MS)
          transfer.cells[index] = (transfer.cells[index] ?? 0) + bytes
        }
        const whole = Math.round(transfer.read) - Math.round(before)
        const cell = Math.floor(now / BUCKET_MS)
        this.carried[direction][cell] = (this.carried[direction][cell] ?? 0) + whole
        transfer.moved(whole, transfer.read, now)
        if (transfer.read >= transfer.target - 1e-9) {
          this.drop(transfer)
          transfer.done(now + 1)
        }
      }
    }
    if (this.transfers.length === 0) {
      this.ticking = false
    } else {
      this.clock.setTimer(1, () => this.tick())
    }
  }
}

/** Whole bytes per cell, adding up to the rounded total. */
export function wholeBytes(cells: readonly (number | undefined)[]): number[] {
  let carried = 0
  return Array.from(cells, (bytes = 0) => {
    const whole = Math.round(carried + bytes) - Math.round(carried)
    carried += bytes
    return whole
  })
}
