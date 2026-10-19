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

import { graceFor, type ThroughputOptions } from '@/engine/phases/options'
import { Ramp } from '@/engine/phases/ramp'
import { Warmup, type WarmupEnd } from '@/engine/phases/warmup'
import { DurationRule } from '@/engine/phases/window'
import { BUCKET_MS } from '@/engine/stats/units'
import type { Clock, Info, TimerId, Transport, UploadResponse } from '@/engine/types'
import { cellOf } from '@/engine/upload/grid'
import { type InFlight, uploadLoop, type UploadIssueHost } from '@/engine/upload/issue'
import { type Halt, uploadOutcome, type UploadOutcome } from '@/engine/upload/outcome'
import { UploadStreams } from '@/engine/upload/streams'
import { type ClientEvent, validTelemetry } from '@/engine/upload/timeline'
import { PreparationTurn } from '@/engine/upload/turn'
import { allowsUpperBound, UploadLedger } from '@/engine/upload/watermark'
import { confirmedSeries, endConditionHolds } from '@/engine/upload/window'

// The server-timed upload phase (measurement.md sections 5 and 7): streams send sized requests
// through the transport (upload/issue.ts); each answer's telemetry is validated and confirmed into
// the ledger, and every decision reads only the confirmed series. The phase stops issuing at its
// end decision, gives the requests in flight a grace, and measures the window up to W_end_final.

const MAX_FAILURES = 3
const TOO_MANY_REQUESTS = 429

export interface UploadOptions extends ThroughputOptions {
  transport: Pick<Transport, 'upload'>
  limits: Pick<Info['limits'], 'maxUploadBytes' | 'maxStreamsPerClient'>
  /** The server epoch GET /info reported at test start. */
  epoch: string
}

/** These end the phase at once; the others give the requests in flight their grace. */
const IMMEDIATE: readonly Halt[] = ['failures', 'stopped', 'server-restarted']

export class UploadPhase {
  readonly ledger = new UploadLedger()
  /** When the phase stopped issuing requests, on the client clock; null while it issues. */
  haltedAt: number | null = null

  private readonly options: UploadOptions
  private readonly clock: Clock
  private readonly streams: UploadStreams
  private readonly turn: PreparationTurn
  private readonly ramp: Ramp
  private readonly warmup: Warmup
  private readonly rule: DurationRule
  private readonly issue: UploadIssueHost
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
    this.turn = new PreparationTurn(options.clock)
    this.streams = new UploadStreams(options.rttMs)
    const { mode, fixed, max } = options.streams
    this.ramp = new Ramp({ mode, fixed, max, serverMax: options.limits.maxStreamsPerClient, ...(options.streamCap === undefined ? {} : { streamCap: options.streamCap }), rttMs: options.rttMs })
    this.warmup = new Warmup({ direction: 'upload', maxMs: options.bounds.maxMs, fixedMs: options.warmup === 'auto' ? null : options.warmup })
    this.rule = new DurationRule('upload', options.bounds, options.preset)
    this.issue = {
      clock: this.clock,
      options,
      streams: this.streams,
      turn: this.turn,
      ledger: this.ledger,
      inFlight: this.inFlight,
      issues: (stream) => this.halted === null && stream < this.ramp.streams,
      dataUsed: () => this.dataUsed,
      capped: () => this.halt('data-cap'),
      settled: (flight, response) => this.settled(flight, response),
    }
  }

  /** The end of warm-up on the confirmed series, once known. */
  get warmupEnd(): WarmupEnd | null {
    return this.warmup.end
  }

  /** The stream count the ramp has reached, which each sample reports. */
  get streamCount(): number {
    return this.ramp.streams
  }

  /** The display-only offset of section 7.4, client minus server; null before a confirmation. */
  get displayOffset(): number | null {
    return this.streams.displayOffset()
  }

  /** The requests in flight now, which loaded latency records with each ping. */
  get inFlightCount(): number {
    return this.inFlight.size
  }

  /** The bytes sent so far in this phase, from upload progress: the sending gauge's input. */
  get dataUsed(): number {
    let sent = this.sentBefore
    for (const flight of this.inFlight) {
      sent += flight.request.sent
    }
    return sent
  }

  /** The length of each structure the phase grows, which the footprint test reads. */
  footprint(): { uploadEntries: number; uploadCells: number; uploadOffsets: number } {
    return { ...this.ledger.footprint(), uploadOffsets: this.streams.footprint() }
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
    const holds = warmupEnd !== null && endConditionHolds(this.ledger, warmupEnd.bucket * BUCKET_MS)
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
      void uploadLoop(this.issue, this.streams.add())
    }
  }

  /** A request's end: it leaves the flight, its bytes count, and its answer is read. */
  private settled(flight: InFlight, response: UploadResponse | null): void {
    this.inFlight.delete(flight)
    this.sentBefore += response?.status === 200 ? flight.request.size : flight.request.sent
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
      this.turn.confirmed(request.size, request.sent)
      this.failures = 0
      this.decide()
      return
    }
    flight.controller.abort()
    this.ledger.end(request.id, now)
    this.streams.ended(request, now)
    this.failed(response?.status ?? 0)
  }

  private failed(status: number): void {
    if (this.halted !== null) {
      return
    }
    // On HTTP/1.1 or an unreported protocol a failed request stays open, freezes the window and ends the phase.
    if (!allowsUpperBound(this.ledger.protocol)) {
      this.clientEvents.push({ code: 'error', at: this.clock.now(), notice: 'upload-interrupted' })
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
      this.ramp.update(series, this.streams.idleShare, this.streams.summedRate(this.ramp.streams))
      if (this.ramp.streams > before) {
        this.addedFrom = before
      }
    }
    this.streams.settled = this.ramp.settled
    if (series !== null && this.warmup.end === null) {
      // The confirmation that ends warm-up on the server timeline is the client instant it is known.
      const end = this.warmup.update(series, this.ramp, this.streams.confirmedPerStream(this.ramp.streams))
      if (end !== null) {
        // No window counts a request whose cells all came before warm-up ended.
        this.ledger.release(end.bucket, this.clock.now())
        this.options.warmedUp?.(end)
      }
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
    // The grace of the requests in flight, min(2 s, 2 × d), which the loaded-latency pings share.
    const grace = graceFor([...this.inFlight].map((flight) => flight.request.expectedMs))
    if (this.haltedAt === null) {
      this.haltedAt = this.clock.now()
      this.options.ended?.(grace)
    }
    this.ledger.halt([...this.inFlight].map(({ request }) => ({ id: request.id, stream: request.stream })))
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
    // No request is issued from here on; those in flight get their grace to confirm.
    this.graceTimer = this.clock.setTimer(grace, () => this.finish())
  }

  /** Aborts what is still in flight, which stays open, and resolves the outcome. */
  private finish(): void {
    const done = this.done
    if (done === null) {
      return
    }
    this.done = null
    this.ledger.halt([...this.inFlight].map(({ request }) => ({ id: request.id, stream: request.stream })))
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
      idleShare: this.streams.idleShare,
      displayOffsetMs: this.streams.displayOffset(),
      events: this.clientEvents,
      startAt: this.start,
    })
  }
}
