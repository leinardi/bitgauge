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

import { type DownloadIssueHost, downloadLoop } from '@/engine/download/issue'
import { type DownloadRequest, Streams } from '@/engine/download/streams'
import { type DownloadWindow, downloadWindow } from '@/engine/download/window'
import type { DirectionEvent, DirectionStatus, Notice, Plateau } from '@/engine/messages'
import { graceFor, type ThroughputOptions } from '@/engine/phases/options'
import { Ramp } from '@/engine/phases/ramp'
import { Warmup, type WarmupEnd } from '@/engine/phases/warmup'
import { DurationRule, windowStable } from '@/engine/phases/window'
import { BucketSeries } from '@/engine/stats/buckets'
import { BUCKET_MS } from '@/engine/stats/units'
import type { Clock, DownloadChunk, Info, ResourceTiming, TimerId, Transport } from '@/engine/types'

// The download phase (measurement.md sections 5 and 6): streams issue sized requests through the
// transport (download/issue.ts), every chunk is counted into the client bucket of its arrival, and
// the phase reads its live series one closed bucket at a time for the ramp, the warm-up and the
// duration rule. It ends at an instant: requests in flight are aborted and the bytes they read are
// kept.

/** Consecutive failed requests that end the phase with an error. */
const MAX_FAILURES = 3

const TOO_MANY_REQUESTS = 429

export interface DownloadOptions extends ThroughputOptions {
  transport: Pick<Transport, 'download'>
  limits: Pick<Info['limits'], 'maxDownloadBytes' | 'maxStreamsPerClient'>
}

export interface DownloadOutcome {
  status: Exclude<DirectionStatus, 'skipped'>
  /** Bytes per bucket from the phase start; the last bucket ends at `endMs` and may be partial. */
  buckets: number[]
  /** The end instant, in ms from the phase start. */
  endMs: number
  warmup: WarmupEnd | null
  window: DownloadWindow | null
  streams: number
  plateau: Plateau | undefined
  /** Every byte read, warm-up and failed requests included. */
  bytes: number
  /** nextHopProtocol of the latest request with a timing entry, `unknown` when empty. */
  protocol: string | null
  notices: Notice[]
  events: DirectionEvent[]
  dataCapReached: boolean
}

type EndReason = 'duration' | 'data-cap' | 'failures' | 'stopped'

export class DownloadPhase {
  /** The live series: one value per closed bucket. */
  readonly series = new BucketSeries(0)

  private readonly options: DownloadOptions
  private readonly clock: Clock
  private readonly streams: Streams
  private readonly ramp: Ramp
  private readonly warmup: Warmup
  private readonly rule: DurationRule
  private readonly issue: DownloadIssueHost
  /** Bytes per bucket, the open bucket included. */
  private readonly bytes: number[] = []
  private readonly inFlight = new Map<DownloadRequest, AbortController>()
  private readonly events: DirectionEvent[] = []
  private start = 0
  private read = 0
  private failures = 0
  private protocol: string | null = null
  private compressed = false
  private streamLimit: number | null = null
  private tickTimer: TimerId | null = null
  private ended: EndReason | null = null
  private endMs = 0
  private done: ((outcome: DownloadOutcome) => void) | null = null

  constructor(options: DownloadOptions) {
    this.options = options
    this.clock = options.clock
    this.streams = new Streams(options.rttMs)
    this.ramp = new Ramp({
      mode: options.streams.mode,
      fixed: options.streams.fixed,
      max: options.streams.max,
      serverMax: options.limits.maxStreamsPerClient,
      ...(options.streamCap === undefined ? {} : { streamCap: options.streamCap }),
      rttMs: options.rttMs,
    })
    this.warmup = new Warmup({
      direction: 'download',
      maxMs: options.bounds.maxMs,
      fixedMs: options.warmup === 'auto' ? null : options.warmup,
    })
    this.rule = new DurationRule('download', options.bounds, options.preset)
    this.issue = {
      clock: this.clock,
      options,
      streams: this.streams,
      inFlight: this.inFlight,
      issues: (stream) => this.ended === null && stream < this.ramp.streams,
      protocol: () => this.protocol,
      read: () => this.read,
      capped: () => this.end('data-cap'),
      encoding: (contentEncoding) => {
        this.compressed ||= contentEncoding !== null
      },
      count: (request, chunk) => this.count(request, chunk),
      record: (timing) => this.record(timing),
      settled: (request, complete, status) => this.settled(request, complete, status),
    }
  }

  /** The end of warm-up, once known. */
  get warmupEnd(): WarmupEnd | null {
    return this.warmup.end
  }

  /** The stream count the ramp has reached, which each sample reports. */
  get streamCount(): number {
    return this.ramp.streams
  }

  /** The bytes read so far in this phase. */
  get dataUsed(): number {
    return this.read
  }

  /** The requests in flight now, which loaded latency records with each ping. */
  get inFlightCount(): number {
    return this.inFlight.size
  }

  /** Runs the phase to its end. */
  run(): Promise<DownloadOutcome> {
    return new Promise((resolve) => {
      this.done = resolve
      this.start = this.clock.now()
      this.schedule()
      this.grow()
    })
  }

  /**
   * Ends the phase as a user stop: in-flight requests are aborted and their bytes kept. `at`, an
   * earlier instant, ends the window there instead of now: the last on-time tick of a page the
   * browser paused (edge-cases.md section 5).
   */
  stop(at?: number): void {
    this.end('stopped', at)
  }

  private schedule(): void {
    const next = this.start + (this.series.end + 1) * BUCKET_MS
    this.tickTimer = this.clock.setTimer(Math.max(0, next - this.clock.now()), () => this.tick())
  }

  /** Closes every bucket that has ended, then decides on the series up to them. */
  private tick(): void {
    this.tickTimer = null
    // The timer was set for the end of the next bucket, so that one has ended even when the
    // difference of two fractional instants rounds just below it.
    const closed = Math.max(this.series.end + 1, Math.floor((this.clock.now() - this.start) / BUCKET_MS))
    while (this.series.end < closed) {
      this.series.append(this.bytes[this.series.end] ?? 0)
    }
    this.decide()
    if (this.ended === null) {
      this.schedule()
    }
  }

  private decide(): void {
    const at = this.series.end
    if (!this.ramp.settled) {
      this.ramp.update(this.series, null, this.streams.summedRate(this.ramp.streams))
      if (this.ramp.placing) {
        // On download the added streams take effect in the bucket of the add.
        this.ramp.stepStarted(at)
      }
    }
    this.streams.settled = this.ramp.settled
    if (this.warmup.end === null) {
      const end = this.warmup.update(this.series, this.ramp, this.streams.completedPerStream(this.ramp.streams))
      if (end !== null) {
        this.options.warmedUp?.(end)
      }
    }
    const elapsedMs = at * BUCKET_MS
    const extended = this.rule.extended
    const window = this.windowAt(elapsedMs)
    const stable = window !== null && windowStable(this.bytes.slice(window.fromMs / BUCKET_MS, window.toMs / BUCKET_MS))
    const verdict = this.rule.evaluate(elapsedMs, (window?.holds ?? false) && stable)
    if (!extended && this.rule.extended) {
      this.events.push({ code: 'extended', atMs: elapsedMs })
    }
    if (verdict === 'end') {
      this.end('duration')
      return
    }
    this.grow()
  }

  /** The steady window up to `endMs`, and whether it meets the window condition. */
  private windowAt(endMs: number): (DownloadWindow & { holds: boolean }) | null {
    const warmupEnd = this.warmup.end
    return warmupEnd === null ? null : downloadWindow(warmupEnd.bucket, endMs, this.bytes, (from, to) => this.streams.contributors(from, to))
  }

  /** Starts the streams the ramp asks for. */
  private grow(): void {
    while (this.ended === null && this.streams.started < this.ramp.streams) {
      void downloadLoop(this.issue, this.streams.add())
    }
  }

  /** A request's end, unless the phase ended first: a completion, or a failure. */
  private settled(request: DownloadRequest, complete: boolean, status: number): void {
    if (this.ended !== null) {
      return
    }
    if (complete) {
      this.failures = 0
      this.streams.complete(request)
    } else {
      this.streams.ended(request, this.clock.now())
      this.failed(status)
    }
  }

  /** Counts a chunk into the bucket of its arrival; bytes are kept even if the request fails. */
  private count(request: DownloadRequest, chunk: DownloadChunk): void {
    if (this.ended !== null) {
      return
    }
    // A bucket already read by a decision is never changed: a late chunk counts in the open one.
    const bucket = Math.max(Math.floor((chunk.at - this.start) / BUCKET_MS), this.series.end)
    this.bytes[bucket] = (this.bytes[bucket] ?? 0) + chunk.bytes
    this.read += chunk.bytes
    this.streams.chunk(request, chunk.bytes, chunk.at, bucket)
  }

  private record(timing: ResourceTiming | null): void {
    if (timing !== null) {
      this.protocol = timing.nextHopProtocol === '' ? 'unknown' : timing.nextHopProtocol
    }
  }

  private failed(status: number): void {
    if (status === TOO_MANY_REQUESTS) {
      this.ramp.lowerCap()
      this.streamLimit = this.ramp.cap
    }
    this.failures++
    if (this.failures >= MAX_FAILURES) {
      this.events.push({ code: 'error', atMs: this.clock.now() - this.start, notice: 'requests-failed' })
      this.end('failures')
    }
  }

  private end(reason: EndReason, at = this.clock.now()): void {
    if (this.ended !== null) {
      return
    }
    this.ended = reason
    // A duration end falls on the tick that closed the series: it ends at that bucket's end
    // exactly, not at a difference of two fractional instants.
    this.endMs = reason === 'duration' ? this.series.end * BUCKET_MS : Math.max(0, Math.min(at, this.clock.now()) - this.start)
    if (this.tickTimer !== null) {
      this.clock.clearTimer(this.tickTimer)
    }
    // The loaded-latency grace: d of the longest request in flight now, 2 s without a rate.
    this.options.ended?.(graceFor([...this.inFlight.keys()].map((request) => this.streams.expectedMs(request.stream, request.size))))
    for (const controller of this.inFlight.values()) {
      controller.abort()
    }
    this.done?.(this.outcome())
  }

  private outcome(): DownloadOutcome {
    const reason = this.ended
    const endMs = this.endMs
    const window = this.windowAt(endMs)
    const notices: Notice[] = []
    const events = [...this.events]
    let status: DownloadOutcome['status']
    if (reason === 'failures') {
      status = 'error'
    } else if (reason === 'stopped') {
      status = 'partial'
      events.push({ code: 'cancelled', atMs: endMs })
    } else {
      // The duration rule, or a data cap ending the phase as if its maximum had passed.
      const outcome = this.rule.outcome(window?.holds ?? false)
      status = outcome.status
      notices.push(...outcome.notices)
      const confidence = this.warmup.end?.confidence
      if (status === 'measured' && confidence?.level === 'low') {
        notices.push({ code: 'low-confidence', direction: 'download', reasons: confidence.reasons })
      }
    }
    if (reason === 'data-cap') {
      notices.push({ code: 'data-cap-reached', direction: 'download' })
      events.push({ code: 'data-cap', atMs: endMs })
    }
    if (this.streamLimit !== null) {
      notices.push({ code: 'stream-limit', direction: 'download', streams: this.streamLimit })
    }
    if (this.compressed) {
      notices.push({ code: 'response-compression-detected' })
    }
    return {
      status,
      buckets: Array.from({ length: Math.ceil(endMs / BUCKET_MS) }, (_, bucket) => this.bytes[bucket] ?? 0),
      endMs,
      warmup: this.warmup.end,
      window: window === null ? null : { fromMs: window.fromMs, toMs: window.toMs, bytes: window.bytes, requests: window.requests },
      streams: this.ramp.streams,
      plateau: this.ramp.plateau,
      bytes: this.read,
      protocol: this.protocol,
      notices,
      events,
      dataCapReached: reason === 'data-cap',
    }
  }
}
