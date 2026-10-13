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
import { Body, Pacer, TICK_MS, type Transfer, wholeBytes } from '@/demo/pacer'
import type { Direction } from '@/engine/messages'
import type { BrowserIdentity, Clock, DownloadResponse, Info, InfoResult, ProbeTiming, ResourceTiming, Transport, UploadResponse, WsEcho } from '@/engine/types'

// The demo's Transport (frontend.md section 9): the engine's requests answered by a simulated
// server across the simulated link, on the demo clock. A download's first byte arrives one round
// trip after it is sent; an upload's first byte reaches the server half a round trip after it is
// sent, and its answer carries the telemetry of wire-protocol.md section 4, counted on the server's
// own 100 ms grid from the paced arrivals. The WebSocket echo and the probes answer one jittered
// round trip later, and GET /info answers with the fixture and the link's current epoch.

const BUCKET_MS = 100
/** The server grid's instant minus the client's: the two clocks share no origin. */
const GRID_OFFSET_MS = 1_000_037
const WS_GOING_AWAY = 1001
const WS_ABNORMAL = 1006

function abortError(): DOMException {
  return new DOMException('The request was aborted.', 'AbortError')
}

function networkError(): TypeError {
  return new TypeError('network error')
}

/** Adds `bytes`, moved evenly from `from` to `to` on the server timeline, to the grid cells from `first` on. */
function spread(cells: number[], first: number, from: number, to: number, bytes: number): void {
  const last = Math.max(Math.floor(from / BUCKET_MS), Math.ceil(to / BUCKET_MS) - 1)
  for (let cell = Math.floor(from / BUCKET_MS); cell <= last; cell++) {
    const overlap = to > from ? (Math.min(to, (cell + 1) * BUCKET_MS) - Math.max(from, cell * BUCKET_MS)) / (to - from) : 1
    cells[cell - first] = (cells[cell - first] ?? 0) + bytes * overlap
  }
}

export class DemoTransport implements Transport {
  private readonly clock: Clock
  private readonly link: Link
  private readonly fixture: Info
  private readonly browser: BrowserIdentity
  private readonly pacer: Pacer
  private readonly closers = new Set<(code: number) => void>()

  constructor(clock: Clock, link: Link, fixture: Info, browser: BrowserIdentity) {
    this.clock = clock
    this.link = link
    this.fixture = fixture
    this.browser = browser
    this.pacer = new Pacer(clock, link)
    // A server that stops answering drops every connection at that instant. A restart closes the
    // WebSocket as the old process goes away, while its requests in flight drain, as a graceful
    // shutdown lets them.
    link.onEvent((event, at) => {
      const drop = () => {
        if (event === 'unreachable') {
          this.pacer.failAll(networkError)
        }
        const closers = [...this.closers]
        this.closers.clear()
        closers.forEach((close) => close(event === 'restart' ? WS_GOING_AWAY : WS_ABNORMAL))
      }
      const delay = at - clock.now()
      if (delay > 0) {
        clock.setTimer(delay, drop)
      } else {
        drop()
      }
    })
  }

  download(size: number, signal: AbortSignal): Promise<DownloadResponse> {
    const sentAt = this.clock.now()
    const rtt = this.link.profile.rttMs
    return this.answer(rtt, signal, this.failed(sentAt), () => {
      const body = new Body()
      let endAt = sentAt + rtt
      const whole = wholeBytes()
      const transfer = this.transfer('download', size, sentAt + rtt, {
        // One chunk per tick of the stretch moved, each stamped with its own arrival: a Worker busy
        // elsewhere fires the pacer late, and one chunk stamped at the end of a long stretch would
        // count bytes of a closed 100 ms bucket in the next one.
        onMove: (bytes, from, to) => {
          const slices = Math.max(1, Math.ceil((to - from) / TICK_MS - 1e-9))
          for (let slice = 1; slice <= slices; slice++) {
            const moved = whole(bytes / slices)
            if (moved > 0) {
              body.push({ bytes: moved, at: this.stamp(from + ((to - from) * slice) / slices) })
            }
          }
        },
        onDone: (at) => {
          endAt = at
          body.end()
        },
        onFail: (reason) => body.fail(reason),
      })
      signal.addEventListener('abort', () => {
        this.pacer.remove(transfer)
        body.fail(abortError())
      })
      return {
        status: 200,
        contentEncoding: null,
        chunks: body,
        timing: () => this.entry(sentAt, sentAt + rtt, endAt),
      }
    })
  }

  upload(size: number, onProgress: (sentBytes: number, at: number) => void, signal: AbortSignal): Promise<UploadResponse> {
    const sentAt = this.clock.now()
    const half = this.link.profile.rttMs / 2
    if (signal.aborted || this.failed(sentAt)) {
      // A lost upload fails like an XMLHttpRequest's error, once the round trip has passed.
      return this.answer(this.link.profile.rttMs, signal, true, () => {
        throw networkError()
      })
    }
    return new Promise((resolve, reject) => {
      // The server reads its clock in whole milliseconds: the first byte's instant is placed on
      // one, and the cells, the first bucket and the telemetry all derive from it.
      const startMs = Math.round(sentAt + half + GRID_OFFSET_MS)
      const firstBucket = Math.floor(startMs / BUCKET_MS)
      const cells: number[] = []
      const transfer = this.transfer('upload', size, startMs - GRID_OFFSET_MS, {
        onMove: (bytes, from, to) => {
          spread(cells, firstBucket, from + GRID_OFFSET_MS, to + GRID_OFFSET_MS, bytes)
          onProgress(Math.round(transfer.moved), this.stamp(to))
        },
        onDone: (at) => {
          const timer = this.clock.setTimer(at + half - this.clock.now(), () => {
            const responseAt = this.clock.now()
            if (!this.link.reachable(responseAt)) {
              reject(networkError())
              return
            }
            const whole = wholeBytes()
            resolve({
              status: 200,
              telemetry: {
                epoch: this.link.epochAt(at),
                bucketMs: BUCKET_MS,
                firstBucket,
                buckets: Array.from(cells, (bytes = 0) => whole(bytes)),
                bytes: size,
                startMs,
                durationMs: Math.max(0, Math.round(at + GRID_OFFSET_MS) - startMs),
              },
              timing: this.entry(sentAt, responseAt, responseAt),
            })
          })
          signal.addEventListener('abort', () => this.clock.clearTimer(timer))
        },
        onFail: reject,
      })
      signal.addEventListener('abort', () => {
        this.pacer.remove(transfer)
        reject(abortError())
      })
    })
  }

  ws(): Promise<WsEcho> {
    const { clock, link } = this
    return this.later(link.roundTrip(), (resolve, reject) => {
      if (link.profile.webSocket === false || !link.reachable(clock.now())) {
        reject(new Error('the WebSocket did not open'))
        return
      }
      let open = true
      let onPong: ((seq: number, sentAt: number, receivedAt: number) => void) | null = null
      let onClose: ((code: number) => void) | null = null
      const closer = (code: number) => {
        open = false
        onClose?.(code)
      }
      this.closers.add(closer)
      resolve({
        ping: (seq, sentAt) => {
          if (open) {
            // The echo is stamped with its simulated arrival: a timer fires no earlier than the
            // browser's floor, a few milliseconds, which would otherwise lengthen a LAN round trip.
            const at = clock.now()
            const rtt = link.roundTrip()
            clock.setTimer(rtt, () => (open ? onPong?.(seq, sentAt, this.stamp(at + rtt)) : undefined))
          }
        },
        onPong: (listener) => {
          onPong = listener
        },
        onClose: (listener) => {
          onClose = listener
        },
        close: () => {
          open = false
          this.closers.delete(closer)
        },
      })
    })
  }

  probe(path: string): Promise<ProbeTiming> {
    const sentAt = this.clock.now()
    const lost = this.failed(sentAt)
    const rtt = this.link.roundTrip()
    return this.later(rtt, (resolve, reject) => {
      if (lost) {
        reject(networkError())
        return
      }
      // Stamped with the simulated answer, as the echo is.
      const doneAt = this.stamp(sentAt + rtt)
      const status = path.endsWith('/ping') ? 204 : path.endsWith('/small') ? 200 : 404
      resolve({ status, sentAt, doneAt, timing: this.entry(sentAt, doneAt, doneAt) })
    })
  }

  info(): Promise<InfoResult> {
    return this.later(this.link.roundTrip(), (resolve, reject) => {
      const now = this.clock.now()
      if (!this.link.reachable(now)) {
        reject(networkError())
        return
      }
      const server = { ...this.fixture.server, epoch: this.link.epochAt(now) }
      resolve({ info: { ...this.fixture, server }, browser: this.browser })
    })
  }

  /**
   * A simulated instant as the clock would read it: on a multiple of its resolution, so a coarse
   * timer coarsens what the transport reports too.
   */
  private stamp(at: number): number {
    const step = this.clock.resolutionMs
    return step > 0 ? Math.floor(at / step + 1e-9) * step : at
  }

  /** Whether a request sent at `at` fails: the server is gone, or the link lost it. */
  private failed(at: number): boolean {
    return !this.link.reachable(at) || this.link.lost(at)
  }

  /**
   * Answers a request after `delayMs` with `respond()`, or fails it when it was `lost` or the server
   * stopped answering meanwhile, unless it is aborted first.
   */
  private answer<T>(delayMs: number, signal: AbortSignal, lost: boolean, respond: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError())
        return
      }
      const timer = this.clock.setTimer(delayMs, () => {
        if (lost || !this.link.reachable(this.clock.now())) {
          reject(networkError())
        } else {
          resolve(respond())
        }
      })
      signal.addEventListener('abort', () => {
        this.clock.clearTimer(timer)
        reject(abortError())
      })
    })
  }

  private transfer(direction: Direction, target: number, firstByteAt: number, callbacks: Pick<Transfer, 'onMove' | 'onDone' | 'onFail'>): Transfer {
    const transfer: Transfer = { direction, target, firstByteAt, moved: 0, movedTo: null, ...callbacks }
    this.pacer.add(transfer)
    return transfer
  }

  private entry(requestStart: number, responseStart: number, responseEnd: number): ResourceTiming | null {
    const protocol = this.link.profile.protocol
    return protocol === null ? null : { nextHopProtocol: protocol, requestStart, responseStart, responseEnd }
  }

  /** Settles `delayMs` from now. */
  private later<T>(delayMs: number, settle: (resolve: (value: T) => void, reject: (reason: unknown) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      this.clock.setTimer(delayMs, () => settle(resolve, reject))
    })
  }
}
