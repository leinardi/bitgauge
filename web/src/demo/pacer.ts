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

import type { Link } from '@/demo/link'
import type { Direction } from '@/engine/messages'
import type { Clock, DownloadChunk, TimerId } from '@/engine/types'

// The bytes in flight on the demo link: every TICK_MS of demo time, the transfers whose first byte
// is due share each direction's bottleneck equally, each up to the per-request limit, for the time
// since they last moved. No byte exists: a transfer is a count.

export const TICK_MS = 10

export interface Transfer {
  readonly direction: Direction
  /** The bytes it moves. */
  readonly target: number
  /** The instant its first byte crosses the bottleneck. */
  readonly firstByteAt: number
  /** Bytes moved so far, fractional. */
  moved: number
  /** The instant up to which it has moved, once it started. */
  movedTo: number | null
  /** Called after each move with the bytes it moved from instant `from` to instant `to`. */
  onMove(bytes: number, from: number, to: number): void
  /** Called once with the instant its last byte crossed. */
  onDone(at: number): void
  /** Called once when the link ends it, with the reason. */
  onFail(reason: unknown): void
}

export class Pacer {
  private readonly clock: Clock
  private readonly link: Link
  private transfers = new Set<Transfer>()
  private timer: TimerId | null = null

  constructor(clock: Clock, link: Link) {
    this.clock = clock
    this.link = link
  }

  add(transfer: Transfer): void {
    this.transfers.add(transfer)
    this.timer ??= this.clock.setTimer(TICK_MS, () => this.tick())
  }

  remove(transfer: Transfer): void {
    this.transfers.delete(transfer)
  }

  /** Ends every transfer in flight with `reason`, as a dropped connection does. */
  failAll(reason: () => unknown): void {
    const ended = [...this.transfers]
    this.transfers.clear()
    ended.forEach((transfer) => transfer.onFail(reason()))
  }

  private tick(): void {
    const now = this.clock.now()
    this.timer = null
    for (const direction of ['download', 'upload'] as const) {
      const moving = [...this.transfers].filter((transfer) => transfer.direction === direction && transfer.firstByteAt < now)
      if (moving.length === 0) {
        continue
      }
      const share = Math.min(this.link.bytesPerMs(direction) / moving.length, this.link.perRequestBytesPerMs(direction))
      for (const transfer of moving) {
        this.move(transfer, share, now)
      }
    }
    if (this.transfers.size > 0) {
      this.timer = this.clock.setTimer(TICK_MS, () => this.tick())
    }
  }

  private move(transfer: Transfer, share: number, now: number): void {
    const from = transfer.movedTo ?? transfer.firstByteAt
    const bytes = Math.min(share * (now - from), transfer.target - transfer.moved)
    const to = share > 0 ? Math.min(now, from + bytes / share) : now
    transfer.moved += bytes
    transfer.movedTo = to
    transfer.onMove(bytes, from, to)
    if (transfer.moved >= transfer.target - 1e-6) {
      this.transfers.delete(transfer)
      transfer.onDone(to)
    }
  }
}

/** A download body: the chunks the pacer moved, read by the engine as they arrive. */
export class Body implements AsyncIterable<DownloadChunk> {
  private readonly queue: DownloadChunk[] = []
  private ended = false
  private failure: unknown = null
  private wake: (() => void) | null = null

  push(chunk: DownloadChunk): void {
    this.queue.push(chunk)
    this.notify()
  }

  end(): void {
    this.ended = true
    this.notify()
  }

  fail(reason: unknown): void {
    this.failure ??= reason
    this.notify()
  }

  async *[Symbol.asyncIterator](): AsyncIterator<DownloadChunk> {
    for (;;) {
      const chunk = this.queue.shift()
      if (chunk !== undefined) {
        yield chunk
      } else if (this.failure !== null) {
        throw this.failure
      } else if (this.ended) {
        return
      } else {
        await new Promise<void>((resolve) => {
          this.wake = resolve
        })
      }
    }
  }

  private notify(): void {
    const wake = this.wake
    this.wake = null
    wake?.()
  }
}

/** Whole bytes from fractional moves: each call returns the new whole bytes, adding up to the rounded total. */
export function wholeBytes(): (bytes: number) => number {
  let total = 0
  return (bytes) => {
    const whole = Math.round(total + bytes) - Math.round(total)
    total += bytes
    return whole
  }
}
