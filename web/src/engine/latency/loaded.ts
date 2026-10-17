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

import type { SharedEcho } from '@/engine/latency/shared'
import type { LoadedSource } from '@/engine/messages'
import type { Clock, TimerId, Transport } from '@/engine/types'

// Loaded latency, path A and its HTTP fallback (measurement.md sections 11.1, 11.2 and 11.6): a
// ping every 300 ms on the injected clock while a direction runs, at most 4 outstanding on the
// WebSocket and 1 probe on HTTP, a tick over the bound skipped and never queued. While the
// WebSocket's close sequence runs there is no path: the tick is skipped, a gap in the series. A
// ping unanswered after 30 s is lost, and so is one still outstanding on an echo that closed, as
// soon as the pinger sees the echo gone, so it never holds the bound on the reopened one. At the direction's end the pinger stops sending and waits
// for the outstanding pings up to the grace; the rest are lost.

const PING_PATH = '/api/v1/ping'
const LOADED_INTERVAL_MS = 300
const WEBSOCKET_OUTSTANDING = 4
const HTTP_OUTSTANDING = 1
const LOSS_MS = 30_000

/** The fallback's sources: the reserved HTTP/1.1 connection, or a multiplexed HTTP/2 or HTTP/3 one. */
export type HttpSource = Exclude<LoadedSource, 'websocket'>

/** Where loaded latency probes: the shared echo, or GET /api/v1/ping. */
export type LoadedPath = { kind: 'websocket'; echo: SharedEcho } | { kind: 'http'; transport: Pick<Transport, 'probe'> }

/** An answered ping: its send instant from the phase start on the client clock, and what was in flight when it went. */
export interface LoadedSample {
  atMs: number
  rttMs: number
  /** At least one of the direction's throughput requests was in flight at the send. */
  loaded: boolean
  inFlight: number
  source: LoadedSource
}

export interface LoadedOutcome {
  /** The answered pings, in send order. */
  samples: LoadedSample[]
  /** Ticks skipped for the outstanding bound or for having no path. */
  skippedTicks: number
  lost: number
  /** The most throughput requests in flight at any send. */
  maxInFlight: number
  /** The sources pings were sent on, in the order first used. */
  sources: LoadedSource[]
}

export interface LoadedOptions {
  clock: Clock
  /** The path to probe on now; null while the close sequence runs. */
  path: () => LoadedPath | null
  /** The direction's throughput requests in flight now. */
  inFlight: () => number
  /** The source the HTTP fallback's samples carry. */
  httpSource: HttpSource
  /** The direction's phase start on the client clock. */
  startAt: number
  /** Each answered ping, for the live sample event. */
  answered?: (ping: { atMs: number; rttMs: number }) => void
}

interface Pending {
  sentAt: number
  kind: LoadedPath['kind']
  /** The echo a WebSocket ping went out on; null for a probe. */
  echo: SharedEcho | null
  source: LoadedSource
  inFlight: number
  timer: TimerId
  controller: AbortController | null
}

type Answer = { rttMs: number } | 'lost' | 'unmeasured'

export class LoadedLatency {
  private readonly options: LoadedOptions
  private readonly clock: Clock
  private readonly pending = new Map<number, Pending>()
  private readonly samples: LoadedSample[] = []
  private readonly sources: LoadedSource[] = []
  private skippedTicks = 0
  private lost = 0
  private maxInFlight = 0
  private next = 0
  private tickTimer: TimerId | null = null
  private graceTimer: TimerId | null = null
  private stopped = false
  private settled: (() => void) | null = null
  private subscribed: SharedEcho | null = null
  private readonly listener = (seq: number, sentAt: number, receivedAt: number): void => {
    const ping = this.pending.get(seq)
    if (ping?.kind === 'websocket' && ping.sentAt === sentAt) {
      this.answer(seq, { rttMs: receivedAt - sentAt })
    }
  }

  constructor(options: LoadedOptions) {
    this.options = options
    this.clock = options.clock
  }

  /** Sends the first ping now and one every 300 ms. */
  start(): void {
    if (this.stopped) {
      return
    }
    this.tickTimer = this.clock.setTimer(LOADED_INTERVAL_MS, () => this.start())
    this.send()
  }

  /** Stops sending; resolves once every outstanding ping is answered, or after `graceMs` with the rest lost. */
  finish(graceMs: number): Promise<LoadedOutcome> {
    this.stop()
    return new Promise((resolve) => {
      const done = (): void => {
        if (this.graceTimer !== null) {
          this.clock.clearTimer(this.graceTimer)
          this.graceTimer = null
        }
        this.settled = null
        this.lost += this.pending.size
        this.drop()
        resolve(this.outcome())
      }
      if (this.pending.size === 0) {
        done()
        return
      }
      this.settled = done
      this.graceTimer = this.clock.setTimer(Math.max(0, graceMs), done)
    })
  }

  /** Stops at once, the outstanding pings dropped uncounted: the run is over. */
  drain(): LoadedOutcome {
    this.stop()
    if (this.graceTimer !== null) {
      this.clock.clearTimer(this.graceTimer)
      this.graceTimer = null
    }
    this.settled = null
    this.drop()
    return this.outcome()
  }

  private stop(): void {
    this.stopped = true
    if (this.tickTimer !== null) {
      this.clock.clearTimer(this.tickTimer)
      this.tickTimer = null
    }
  }

  private send(): void {
    const path = this.options.path()
    const echo = path?.kind === 'websocket' ? path.echo : null
    if (this.subscribed !== null && this.subscribed !== echo) {
      this.abandon(this.subscribed)
    }
    const bound = path?.kind === 'websocket' ? WEBSOCKET_OUTSTANDING : HTTP_OUTSTANDING
    if (path === null || [...this.pending.values()].filter((ping) => ping.kind === path.kind).length >= bound) {
      this.skippedTicks++
      return
    }
    const seq = this.next++
    const sentAt = this.clock.now()
    const inFlight = this.options.inFlight()
    const source = path.kind === 'websocket' ? 'websocket' : this.options.httpSource
    if (!this.sources.includes(source)) {
      this.sources.push(source)
    }
    this.maxInFlight = Math.max(this.maxInFlight, inFlight)
    const controller = path.kind === 'http' ? new AbortController() : null
    const timer = this.clock.setTimer(LOSS_MS, () => this.answer(seq, 'lost'))
    this.pending.set(seq, { sentAt, kind: path.kind, echo, source, inFlight, timer, controller })
    if (path.kind === 'websocket') {
      this.subscribe(path.echo)
      path.echo.ping(seq, sentAt)
      return
    }
    path.transport.probe(PING_PATH, controller?.signal).then(
      (probe) => this.answer(seq, probe.status !== 204 ? 'lost' : probe.timing === null ? 'unmeasured' : { rttMs: probe.timing.responseStart - probe.timing.requestStart }),
      () => this.answer(seq, 'lost'),
    )
  }

  private subscribe(echo: SharedEcho): void {
    if (this.subscribed !== echo) {
      echo.onPong(this.listener)
      this.subscribed = echo
    }
  }

  /** The echo closed: its outstanding pings can no longer be answered, so they are lost now. */
  private abandon(echo: SharedEcho): void {
    echo.offPong(this.listener)
    this.subscribed = null
    for (const [seq, ping] of this.pending) {
      if (ping.echo === echo) {
        this.clock.clearTimer(ping.timer)
        this.pending.delete(seq)
        this.lost++
      }
    }
  }

  private answer(seq: number, answer: Answer): void {
    const ping = this.pending.get(seq)
    if (ping === undefined) {
      return
    }
    this.pending.delete(seq)
    this.clock.clearTimer(ping.timer)
    if (answer === 'lost') {
      // An HTTP probe unanswered after 30 s is aborted.
      ping.controller?.abort()
      this.lost++
    } else if (answer !== 'unmeasured') {
      const atMs = ping.sentAt - this.options.startAt
      this.samples.push({ atMs, rttMs: answer.rttMs, loaded: ping.inFlight > 0, inFlight: ping.inFlight, source: ping.source })
      this.options.answered?.({ atMs, rttMs: answer.rttMs })
    }
    if (this.pending.size === 0) {
      this.settled?.()
    }
  }

  /** Clears what is still outstanding and stops listening. */
  private drop(): void {
    for (const ping of this.pending.values()) {
      this.clock.clearTimer(ping.timer)
      ping.controller?.abort()
    }
    this.pending.clear()
    this.subscribed?.offPong(this.listener)
    this.subscribed = null
  }

  private outcome(): LoadedOutcome {
    return {
      samples: [...this.samples].sort((left, right) => left.atMs - right.atMs),
      skippedTicks: this.skippedTicks,
      lost: this.lost,
      maxInFlight: this.maxInFlight,
      sources: [...this.sources],
    }
  }
}
