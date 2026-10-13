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

import { dataBudget, type ThroughputOptions } from '@/engine/phases/options'
import { Ramp } from '@/engine/phases/ramp'
import { Warmup } from '@/engine/phases/warmup'
import { DurationRule } from '@/engine/phases/window'
import { BUCKET_MS } from '@/engine/stats/units'
import type { Clock, Info, TimerId, Transport, UploadResponse } from '@/engine/types'
import { cellOf } from '@/engine/upload/grid'
import { type Halt, uploadOutcome, type UploadOutcome } from '@/engine/upload/outcome'
import { type UploadRequest, UploadStreams } from '@/engine/upload/streams'
import { type ClientEvent, validTelemetry } from '@/engine/upload/timeline'
import { allowsUpperBound, UploadLedger } from '@/engine/upload/watermark'
import { confirmedSeries, steadyWindow } from '@/engine/upload/window'

// The server-timed upload phase (measurement.md sections 5 and 7): streams send sized requests
// through the transport; each answer's telemetry is validated and confirmed into the ledger, and
// every decision reads only the confirmed series. The phase stops issuing at its end decision,
// gives the requests in flight a grace, and measures the window up to W_end_final.

const TIMEOUT_MS = 30_000
const MAX_FAILURES = 3
const TOO_MANY_REQUESTS = 429
/** The grace is min(2 s, 2 × d), d the expected duration of the longest request in flight. */
const MAX_GRACE_MS = 2000

export interface UploadOptions extends ThroughputOptions {
  transport: Pick<Transport, 'upload'>
  limits: Pick<Info['limits'], 'maxUploadBytes' | 'maxStreamsPerClient'>
  /** The server epoch GET /info reported at test start. */
  epoch: string
}

/** These end the phase at once; the others give the requests in flight their grace. */
const IMMEDIATE: readonly Halt[] = ['failures', 'stopped', 'server-restarted']

interface InFlight {
  request: UploadRequest
  controller: AbortController
  /** Set once the phase has ended the request itself. */
  closed: boolean
}

export class UploadPhase {
  readonly ledger = new UploadLedger()
  /** When the phase stopped issuing requests, on the client clock; null while it issues. */
  haltedAt: number | null = null

  private readonly options: UploadOptions
  private readonly clock: Clock
  private readonly streams = new UploadStreams()
  private readonly ramp: Ramp
  private readonly warmup: Warmup
  private readonly rule: DurationRule
  private readonly inFlight = new Set<InFlight>()
  /** Events seen on the client clock, placed on the server timeline at the end. */
  private readonly clientEvents: ClientEvent[] = []
  private start = 0
  private sentBefore = 0
  private failures = 0
  private protocol: string | null = null
  private streamLimit: number | null = null
  /** The first stream the ramp's last step added, while it waits to be placed. */
  private addedFrom = 0
  private tickTimer: TimerId | null = null
  private graceTimer: TimerId | null = null
  /** The reason the phase halted for, last first: a stop or a restart can cut a grace short. */
  private halted: Halt | null = null
  private readonly halts = new Set<Halt>()
  private done: ((outcome: UploadOutcome) => void) | null = null

  constructor(options: UploadOptions) {
    this.options = options
    this.clock = options.clock
    const { mode, fixed, max } = options.streams
    this.ramp = new Ramp({ mode, fixed, max, serverMax: options.limits.maxStreamsPerClient, rttMs: options.rttMs })
    this.warmup = new Warmup({ direction: 'upload', maxMs: options.bounds.maxMs, fixedMs: options.warmup === 'auto' ? null : options.warmup })
    this.rule = new DurationRule('upload', options.bounds, options.preset)
  }

  /** The bytes sent so far in this phase, from upload progress: the sending gauge's input. */
  get dataUsed(): number {
    let sent = this.sentBefore
    for (const flight of this.inFlight) {
      sent += flight.request.sent
    }
    return sent
  }

  /** Runs the phase to its end, grace included. */
  run(): Promise<UploadOutcome> {
    return new Promise((resolve) => {
      this.done = resolve
      this.start = this.clock.now()
      this.tick()
      this.grow()
    })
  }

  /** Ends the phase now, as a user stop: requests in flight are aborted and stay open. */
  stop(): void {
    this.halt('stopped')
  }

  /** The duration rule on the client clock, every bucket; a confirmation also evaluates it. */
  private tick(): void {
    this.evaluate()
    if (this.halted === null) {
      this.tickTimer = this.clock.setTimer(BUCKET_MS, () => this.tick())
    }
  }

  private evaluate(): void {
    if (this.halted !== null) {
      return
    }
    const warmupEnd = this.warmup.end
    const holds = warmupEnd !== null && steadyWindow(this.ledger, warmupEnd.bucket * BUCKET_MS).sufficient
    const extended = this.rule.extended
    const verdict = this.rule.evaluate(this.clock.now() - this.start, holds)
    if (!extended && this.rule.extended) {
      this.clientEvents.push({ code: 'extended', at: this.clock.now() })
    }
    if (verdict === 'end') {
      this.halt('duration')
    }
  }

  private grow(): void {
    while (this.halted === null && this.streams.started < this.ramp.streams) {
      void this.loop(this.streams.add())
    }
  }

  private async loop(stream: number): Promise<void> {
    while (this.halted === null && stream < this.ramp.streams) {
      const size = this.streams.nextSize(stream, this.options.limits.maxUploadBytes, this.budget())
      if (size === null) {
        this.halt('data-cap')
        return
      }
      await this.request(stream, size)
    }
  }

  /** What the data cap still allows after data used and the bytes still to send in flight. */
  private budget(): number | null {
    let pending = 0
    for (const flight of this.inFlight) {
      pending += flight.request.size - flight.request.sent
    }
    return dataBudget(this.options, this.dataUsed, pending)
  }

  private async request(stream: number, size: number): Promise<void> {
    const sentAt = this.clock.now()
    const request = this.streams.issue(this.ledger.send(sentAt), stream, size, sentAt)
    const flight: InFlight = { request, controller: new AbortController(), closed: false }
    this.inFlight.add(flight)
    const timeout = this.clock.setTimer(TIMEOUT_MS, () => flight.controller.abort())
    const progress = (sent: number): void => {
      request.sent = Math.max(request.sent, Math.min(sent, size))
    }
    let response: UploadResponse | null = null
    try {
      response = await this.options.transport.upload(size, progress, flight.controller.signal)
    } catch {
      // Aborted, timed out, or a network error.
    }
    this.clock.clearTimer(timeout)
    if (flight.closed) {
      return
    }
    this.inFlight.delete(flight)
    this.sentBefore += response?.status === 200 ? size : request.sent
    this.answered(flight, response)
    if (this.halted !== null && !IMMEDIATE.includes(this.halted) && this.inFlight.size === 0) {
      this.finish()
    }
  }

  /** Validates an answer and confirms it, or records the failure (measurement.md section 7.3). */
  private answered(flight: InFlight, response: UploadResponse | null): void {
    const { request } = flight
    const now = this.clock.now()
    if (response?.timing) {
      this.protocol = response.timing.nextHopProtocol === '' ? 'unknown' : response.timing.nextHopProtocol
      this.ledger.protocol = response.timing.nextHopProtocol
    }
    const telemetry = response?.status === 200 ? response.telemetry : null
    if (telemetry !== null && telemetry.epoch !== this.options.epoch) {
      this.ledger.end(request.id, now)
      this.halt('server-restarted')
      return
    }
    if (telemetry !== null && validTelemetry(telemetry, request.size)) {
      this.ledger.confirm(request.id, now, telemetry)
      this.streams.confirm(request, telemetry, now)
      this.failures = 0
      this.decide()
      return
    }
    flight.controller.abort()
    this.ledger.end(request.id, now)
    this.failed(response?.status ?? 0)
  }

  private failed(status: number): void {
    if (this.halted !== null) {
      return
    }
    // On HTTP/1.1 or an unreported protocol a failed request stays open and freezes the window.
    if (!allowsUpperBound(this.ledger.protocol)) {
      this.halt('interrupted')
      return
    }
    if (status === TOO_MANY_REQUESTS) {
      this.ramp.lowerCap()
      this.streamLimit = this.ramp.cap
    }
    if (++this.failures >= MAX_FAILURES) {
      this.clientEvents.push({ code: 'error', at: this.clock.now(), notice: 'requests-failed' })
      this.halt('failures')
      return
    }
    this.decide()
  }

  /** Reads the confirmed series after it changed: ramp, warm-up, then the duration rule. */
  private decide(): void {
    const series = confirmedSeries(this.ledger)
    if (series !== null && !this.ramp.settled) {
      if (this.ramp.placing) {
        // The trial starts at the cell of the latest first byte among the added streams.
        const latest = this.streams.latestFirstStart(this.addedFrom, this.ramp.streams)
        if (latest !== null) {
          this.ramp.stepStarted(cellOf(latest))
        }
      }
      const before = this.ramp.streams
      this.ramp.update(series)
      if (this.ramp.streams > before) {
        this.addedFrom = before
      }
    }
    if (series !== null && this.warmup.end === null) {
      this.warmup.update(series, this.ramp, this.streams.confirmedPerStream(this.ramp.streams))
    }
    this.evaluate()
    this.grow()
  }

  private halt(reason: Halt): void {
    // A stop or a restart during the grace still ends the phase at once.
    const graceful = this.halted !== null && !IMMEDIATE.includes(this.halted)
    if (this.done === null || (this.halted !== null && !(graceful && IMMEDIATE.includes(reason)))) {
      return
    }
    this.halted = reason
    this.halts.add(reason)
    this.haltedAt ??= this.clock.now()
    if (this.tickTimer !== null) {
      this.clock.clearTimer(this.tickTimer)
    }
    const at = this.clock.now()
    if (reason === 'data-cap') {
      this.clientEvents.push({ code: 'data-cap', at })
    } else if (reason === 'stopped') {
      this.clientEvents.push({ code: 'cancelled', at })
    } else if (reason === 'server-restarted') {
      this.clientEvents.push({ code: 'error', at, notice: 'server-restarted' })
    }
    if (IMMEDIATE.includes(reason) || this.inFlight.size === 0) {
      this.finish()
      return
    }
    // No request is issued from here on; those in flight get min(2 s, 2 × d) to confirm.
    const expected = [...this.inFlight].map((flight) => flight.request.expectedMs ?? MAX_GRACE_MS)
    this.graceTimer = this.clock.setTimer(Math.min(MAX_GRACE_MS, 2 * Math.max(...expected)), () => this.finish())
  }

  /** Aborts what is still in flight, which stays open, and resolves the outcome. */
  private finish(): void {
    const done = this.done
    if (done === null) {
      return
    }
    this.done = null
    if (this.graceTimer !== null) {
      this.clock.clearTimer(this.graceTimer)
    }
    for (const flight of this.inFlight) {
      flight.closed = true
      this.sentBefore += flight.request.sent
      this.ledger.end(flight.request.id, this.clock.now())
      flight.controller.abort()
    }
    this.inFlight.clear()
    done(this.outcome())
  }

  private outcome(): UploadOutcome {
    return uploadOutcome({
      halts: this.halts,
      warmup: this.warmup.end,
      ledger: this.ledger,
      rule: this.rule,
      streams: this.ramp.streams,
      plateau: this.ramp.plateau,
      bytes: this.sentBefore,
      protocol: this.protocol,
      streamLimit: this.streamLimit,
      bufferingSuspected: this.streams.bufferingSuspected,
      displayOffsetMs: this.streams.displayOffset(),
      events: this.clientEvents,
      startAt: this.start,
    })
  }
}
