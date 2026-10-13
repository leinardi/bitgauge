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
import { FakeServer } from '@/engine/test/fakeServer'
import type { DownloadChunk, DownloadResponse, Info, InfoResult, ProbeTiming, ResourceTiming, Transport, UploadResponse, WsEcho } from '@/engine/types'

// A Transport for the engine tests that replays a scenario on the FakeClock, on the shared-link
// model of measurement.md section 19.1: per direction, the requests whose bytes are crossing the
// bottleneck share its rate equally, stepped one millisecond at a time. A download's first byte
// reaches the client one RTT after the request is sent; an upload's first byte reaches the server
// half an RTT after it is sent and its response the client half an RTT after the last byte. The
// server's grid runs `gridOffsetMs` ahead of the client clock.

/** What one request replays instead of a normal transfer. */
export type Failure =
  /** Answered one RTT after it is sent with this status and no body. */
  | { kind: 'status'; status: number }
  /** Rejected one RTT after it is sent, like a network error. */
  | { kind: 'error' }
  /** Nothing arrives until the request is aborted. */
  | { kind: 'stall' }
  /** The body ends cleanly after `bytes` bytes. */
  | { kind: 'short'; bytes: number }

export interface Scenario {
  /** The bottleneck's goodput in bytes per second at instant `atMs`. */
  rate: (direction: Direction, atMs: number) => number
  /** The most one request can carry in bytes per second, such as a connection's CPU limit. */
  perRequest?: number
  rttMs: number
  /** Every entry's nextHopProtocol; null for requests without a Resource Timing entry. */
  protocol: string | null
  /** The failure the `index`-th request of `direction` (from 0) replays, or null. */
  failure?: (direction: Direction, index: number) => Failure | null
  /** The Content-Encoding of every download response. */
  contentEncoding?: string | null
  /** The server grid's instant minus the client's. */
  gridOffsetMs?: number
  /** The server epoch at the start; FakeServer.restart changes it. */
  epoch?: string
  limits?: Partial<Info['limits']>
}

interface Transfer {
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

function abortError(): DOMException {
  return new DOMException('The request was aborted.', 'AbortError')
}

/** A download body: chunks queued by the link and read by the engine. */
class Body implements AsyncIterable<DownloadChunk> {
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
    this.failure = reason
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

export class FakeTransport implements Transport {
  /** The sizes requested, per direction, in issue order. */
  readonly requested: Record<Direction, number[]> = { download: [], upload: [] }
  private readonly clock: FakeClock
  private readonly scenario: Scenario
  private transfers: Transfer[] = []
  /** The whole bytes the bottleneck carried per 100 ms cell of the client clock, per direction. */
  readonly carried: Record<Direction, number[]> = { download: [], upload: [] }
  /** The server's latency endpoints and GET /info. */
  readonly server: FakeServer
  /** The largest number of transfers that were in flight together, per direction. */
  readonly peakInFlight: Record<Direction, number> = { download: 0, upload: 0 }
  private ticking = false
  private lastTick = -1

  constructor(clock: FakeClock, scenario: Scenario) {
    this.clock = clock
    this.scenario = scenario
    this.server = new FakeServer(clock, scenario)
  }

  download(size: number, signal: AbortSignal): Promise<DownloadResponse> {
    const failure = this.next('download', size)
    const sentAt = this.clock.now()
    const { rttMs } = this.scenario
    return this.respond(rttMs, signal, failure, (status) => {
      const body = new Body()
      let endAt = sentAt + rttMs
      const timing = (): ResourceTiming | null =>
        this.entry({ requestStart: sentAt, responseStart: sentAt + rttMs, responseEnd: endAt })
      if (status !== 200) {
        body.end()
        return { status, contentEncoding: null, chunks: body, timing }
      }
      const transfer = this.start('download', failure?.kind === 'short' ? failure.bytes : size, sentAt + rttMs, {
        moved: (bytes, _total, at) => {
          if (bytes > 0) {
            body.push({ bytes, at })
          }
        },
        done: (at) => {
          endAt = at
          body.end()
        },
      })
      signal.addEventListener('abort', () => {
        this.drop(transfer)
        body.fail(abortError())
      })
      return { status, contentEncoding: this.scenario.contentEncoding ?? null, chunks: body, timing }
    })
  }

  upload(size: number, onProgress: (sentBytes: number, at: number) => void, signal: AbortSignal): Promise<UploadResponse> {
    const failure = this.next('upload', size)
    const sentAt = this.clock.now()
    const half = this.scenario.rttMs / 2
    const offset = this.scenario.gridOffsetMs ?? 0
    if (failure !== null && failure.kind !== 'short') {
      return this.respond(this.scenario.rttMs, signal, failure, (status) => ({
        status,
        telemetry: null,
        timing: this.entry({ requestStart: sentAt, responseStart: sentAt + this.scenario.rttMs, responseEnd: sentAt }),
      }))
    }
    return new Promise((resolve, reject) => {
      const transfer = this.start('upload', failure?.bytes ?? size, sentAt + half, {
        moved: (_bytes, total, at) => onProgress(Math.round(total), at),
        done: (at) => {
          const startMs = (transfer.startMs ?? at) + offset
          // `at` is the end of the last byte's millisecond, one after the tick that moved it.
          const timer = this.clock.setTimer(half + 1, () => {
            const responseStart = this.clock.now()
            resolve({
              status: 200,
              telemetry: {
                epoch: this.server.epoch,
                bucketMs: BUCKET_MS,
                firstBucket: Math.floor(startMs / BUCKET_MS),
                buckets: wholeBytes(transfer.cells),
                bytes: Math.round(transfer.read),
                startMs,
                durationMs: at + offset - startMs,
              },
              timing: this.entry({ requestStart: sentAt, responseStart, responseEnd: responseStart }),
            })
          })
          signal.addEventListener('abort', () => this.clock.clearTimer(timer))
        },
      })
      signal.addEventListener('abort', () => {
        this.drop(transfer)
        reject(abortError())
      })
    })
  }

  ws(): Promise<WsEcho> {
    return this.server.ws()
  }

  probe(path: string): Promise<ProbeTiming> {
    return this.server.probe(path)
  }

  info(): Promise<InfoResult> {
    return this.server.info()
  }

  /** Records a request and returns the failure it replays. */
  private next(direction: Direction, size: number): Failure | null {
    const index = this.requested[direction].push(size) - 1
    return this.scenario.failure?.(direction, index) ?? null
  }

  private entry(times: Omit<ResourceTiming, 'nextHopProtocol'>): ResourceTiming | null {
    const protocol = this.scenario.protocol
    return protocol === null ? null : { nextHopProtocol: protocol, ...times }
  }

  /** Answers after `delayMs` with `answer(status)`, replaying `failure`, unless aborted first. */
  private respond<T>(
    delayMs: number,
    signal: AbortSignal,
    failure: Failure | null,
    answer: (status: number) => T,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer =
        failure?.kind === 'stall'
          ? null
          : this.clock.setTimer(delayMs, () => {
              if (failure?.kind === 'error') {
                reject(new TypeError('network error'))
              } else {
                resolve(answer(failure?.kind === 'status' ? failure.status : 200))
              }
            })
      signal.addEventListener('abort', () => {
        if (timer !== null) {
          this.clock.clearTimer(timer)
        }
        reject(abortError())
      })
    })
  }

  private start(
    direction: Direction,
    target: number,
    firstByteAt: number,
    callbacks: Pick<Transfer, 'moved' | 'done'>,
  ): Transfer {
    const transfer: Transfer = {
      direction,
      target,
      firstByteAt,
      read: 0,
      cells: [],
      startMs: null,
      ...callbacks,
    }
    this.transfers.push(transfer)
    const inFlight = this.transfers.filter((other) => other.direction === direction).length
    this.peakInFlight[direction] = Math.max(this.peakInFlight[direction], inFlight)
    if (!this.ticking) {
      this.ticking = true
      this.clock.setTimer(this.lastTick === this.clock.now() ? 1 : 0, () => this.tick())
    }
    return transfer
  }

  private drop(transfer: Transfer): void {
    this.transfers = this.transfers.filter((other) => other !== transfer)
  }

  /** Moves one millisecond of bytes in both directions. */
  private tick(): void {
    const now = this.clock.now()
    this.lastTick = now
    const offset = this.scenario.gridOffsetMs ?? 0
    for (const direction of ['download', 'upload'] as const) {
      const reading = this.transfers.filter((transfer) => transfer.direction === direction && transfer.firstByteAt <= now)
      const fair = reading.length === 0 ? 0 : this.scenario.rate(direction, now) / reading.length
      const share = Math.min(fair, this.scenario.perRequest ?? Number.POSITIVE_INFINITY) / 1000
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
function wholeBytes(cells: readonly (number | undefined)[]): number[] {
  let carried = 0
  return Array.from(cells, (bytes = 0) => {
    const whole = Math.round(carried + bytes) - Math.round(carried)
    carried += bytes
    return whole
  })
}
