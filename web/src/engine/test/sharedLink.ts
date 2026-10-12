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
import type { ConfirmedTelemetry } from '@/engine/upload/watermark'

// A synthetic link for the engine tests, stepped one millisecond at a time. The requests whose
// bytes are crossing the bottleneck share its rate equally. On upload a request's first byte
// reaches the server half an RTT after it is sent and its response reaches the client half an RTT
// after the last byte; on download the first byte reaches the client one RTT after the request is
// sent and the request is done at its last byte. Client and server instants share one timeline
// here, which the engine itself never assumes.

export interface LinkRequest {
  stream: number
  size: number
  sentAt: number
}

export interface Completion {
  request: LinkRequest
  /** t_done: the response at the client on upload, the last byte on download. */
  doneAt: number
  /** First to last byte, on the server (upload) or the client (download). */
  transferMs: number
  /** What the server would report for an upload request. */
  telemetry: ConfirmedTelemetry
}

interface Transfer {
  request: LinkRequest
  firstByteAt: number
  read: number
  /** Bytes per cell, from the cell of the first byte on. */
  cells: number[]
  startMs: number | null
}

export class SharedLink {
  now = 0
  /** Every byte that crossed the bottleneck, per 100 ms cell: the live download series. */
  readonly totals: number[] = []
  private readonly perMs: number
  private readonly rttMs: number
  private readonly direction: Direction
  private transfers: Transfer[] = []
  private pending: Completion[] = []

  constructor(direction: Direction, bytesPerSecond: number, rttMs: number) {
    this.direction = direction
    this.perMs = bytesPerSecond / 1000
    this.rttMs = rttMs
  }

  send(stream: number, size: number): LinkRequest {
    const request = { stream, size, sentAt: this.now }
    const delay = this.direction === 'upload' ? this.rttMs / 2 : this.rttMs
    this.transfers.push({ request, firstByteAt: this.now + delay, read: 0, cells: [], startMs: null })
    return request
  }

  /** Advances one millisecond and returns the requests that completed at the client in it. */
  step(): Completion[] {
    const reading = this.transfers.filter((transfer) => transfer.firstByteAt <= this.now)
    const share = reading.length === 0 ? 0 : this.perMs / reading.length
    const cell = Math.floor(this.now / BUCKET_MS)
    for (const transfer of reading) {
      transfer.startMs ??= this.now
      const bytes = Math.min(share, transfer.request.size - transfer.read)
      const offset = cell - Math.floor(transfer.startMs / BUCKET_MS)
      transfer.cells[offset] = (transfer.cells[offset] ?? 0) + bytes
      this.totals[cell] = (this.totals[cell] ?? 0) + bytes
      transfer.read += bytes
      if (transfer.read >= transfer.request.size - 1e-9) {
        this.finish(transfer, this.now + 1)
      }
    }
    this.now++
    const done = this.pending.filter((completion) => completion.doneAt <= this.now)
    this.pending = this.pending.filter((completion) => completion.doneAt > this.now)
    return done
  }

  private finish(transfer: Transfer, endMs: number): void {
    this.transfers = this.transfers.filter((other) => other !== transfer)
    const startMs = transfer.startMs ?? endMs
    // Whole bytes per cell, adding up to the request's size.
    let carried = 0
    const buckets = Array.from(transfer.cells, (bytes = 0) => {
      const whole = Math.round(carried + bytes) - Math.round(carried)
      carried += bytes
      return whole
    })
    this.pending.push({
      request: transfer.request,
      doneAt: endMs + (this.direction === 'upload' ? this.rttMs / 2 : 0),
      transferMs: endMs - startMs,
      telemetry: { firstBucket: Math.floor(startMs / BUCKET_MS), buckets, startMs, durationMs: endMs - startMs },
    })
  }
}
