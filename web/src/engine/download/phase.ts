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

import { DataUsedNotices } from '@/engine/continuous/dataUsed'
import { Retention } from '@/engine/continuous/retention'
import { type DownloadIssueHost, downloadLoop } from '@/engine/download/issue'
import { type DownloadOutcome, downloadOutcome, type EndReason } from '@/engine/download/outcome'
import { type DownloadRequest, Streams } from '@/engine/download/streams'
import { type DownloadWindow, downloadWindow } from '@/engine/download/window'
import type { DirectionEvent } from '@/engine/messages'
import { graceFor, type ThroughputOptions } from '@/engine/phases/options'
import { Ramp } from '@/engine/phases/ramp'
import { Warmup, type WarmupEnd } from '@/engine/phases/warmup'
import { DurationRule, windowStable } from '@/engine/phases/window'
import { BucketSeries } from '@/engine/stats/buckets'
import { BUCKET_MS } from '@/engine/stats/units'
import type { Clock, DownloadChunk, Info, ResourceTiming, TimerId, Transport } from '@/engine/types'

export type { DownloadOutcome } from '@/engine/download/outcome'

// The download phase (measurement.md sections 5, 6 and 15): streams issue sized requests through
// the transport (download/issue.ts), every chunk is counted into the client bucket of its arrival,
// and the phase reads its live series one closed bucket at a time for the ramp, the warm-up and
// the duration rule. It ends at an instant: requests in flight are aborted and the bytes they read
// are kept. A Continuous download hands every bucket from its steady start to its retention and
// keeps only the open ones, and the live series only while the ramp still reads it.

/** Consecutive failed requests that end the phase with an error. */
const MAX_FAILURES = 3

const TOO_MANY_REQUESTS = 429
/** A tick this late may follow a paused hidden page, which the run stops first (edge-cases.md section 5). */
const LATE_MS = 1000

export interface DownloadOptions extends ThroughputOptions {
  transport: Pick<Transport, 'download'>
  limits: Pick<Info['limits'], 'maxDownloadBytes' | 'maxStreamsPerClient'>
}

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
  /** Bytes per bucket, the open bucket included; Continuous drops each one it handed to the retention. */
  private readonly bytes = new Map<number, number>()
  /** The buckets closed so far: the series' end while it keeps them all. */
  private closed = 0
  /** Continuous only: where the buckets go from the steady start, and the data-used notices. */
  readonly retention: Retention | null
  readonly usedNotices: DataUsedNotices | null
  private runTimer: TimerId | null = null
  private readonly inFlight = new Map<DownloadRequest, AbortController>()
  private readonly events: DirectionEvent[] = []
  private start = 0
  private read = 0
  private failures = 0
  private protocol: string | null = null
  private compressed = false
  private streamLimit: number | null = null
  private tickTimer: TimerId | null = null
  /** When the next tick is due, and whether a late one already waited a turn. */
  private dueAt = 0
  private waited = false
  private ended: EndReason | null = null
  private endMs = 0
  private done: ((outcome: DownloadOutcome) => void) | null = null

  constructor(options: DownloadOptions) {
    this.options = options
    this.clock = options.clock
    this.streams = new Streams(options.rttMs)
    const { mode, fixed, max } = options.streams
    this.ramp = new Ramp({ mode, fixed, max, serverMax: options.limits.maxStreamsPerClient, ...(options.streamCap === undefined ? {} : { streamCap: options.streamCap }), rttMs: options.rttMs })
    this.warmup = new Warmup({ direction: 'download', maxMs: options.bounds?.maxMs ?? null, fixedMs: options.warmup === 'auto' ? null : options.warmup })
    this.rule = new DurationRule('download', options.bounds, options.preset)
    this.retention = options.continuous === undefined ? null : new Retention()
    this.usedNotices = options.continuous === undefined ? null : new DataUsedNotices()
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

  /** The buckets closed so far, which the live samples carry up to. */
  get closedBuckets(): number {
    return this.closed
  }

  /** The length of each structure the phase grows, which the footprint test reads. */
  footprint(): Record<string, number> {
    return {
      downloadRequests: this.streams.footprint(),
      downloadSeries: this.series.end - this.series.first,
      downloadBytes: this.bytes.size,
      ...this.retention?.footprint(),
    }
  }

  /** Runs the phase to its end. */
  run(): Promise<DownloadOutcome> {
    return new Promise((resolve) => {
      this.done = resolve
      this.start = this.clock.now()
      const runLengthMs = this.options.continuous?.runLengthMs ?? null
      if (runLengthMs !== null) {
        // The run length ends the download at its instant, as a bounded maximum would (section 15).
        this.runTimer = this.clock.setTimer(runLengthMs, () => this.end('run-length', this.start + runLengthMs))
      }
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
    this.dueAt = this.start + (this.closed + 1) * BUCKET_MS
    this.tickTimer = this.clock.setTimer(Math.max(0, this.dueAt - this.clock.now()), () => this.tick())
  }

  /** Closes every bucket that has ended, then decides on the series up to them. */
  private tick(): void {
    this.tickTimer = null
    // In Continuous a late tick waits a turn, so that buckets after a paused page's last on-time
    // tick never reach the retention: the run stops the phase there first.
    if (this.retention !== null && !this.waited && this.clock.now() - this.dueAt > LATE_MS) {
      this.waited = true
      this.tickTimer = this.clock.setTimer(0, () => this.tick())
      return
    }
    this.waited = false
    // The timer was set for the end of the next bucket, so that one has ended even when the
    // difference of two fractional instants rounds just below it.
    const closed = Math.max(this.closed + 1, Math.floor((this.clock.now() - this.start) / BUCKET_MS))
    while (this.closed < closed) {
      this.close(this.closed)
      this.closed++
    }
    this.decide()
    if (this.ended === null) {
      this.schedule()
    }
  }

  private decide(): void {
    const at = this.closed
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
        this.steady(end.bucket)
        this.options.warmedUp?.(end)
      }
    }
    if (this.retention !== null) {
      // Continuous: no end condition and no extension; only a stop, the run length or the data cap end it.
      this.grow()
      return
    }
    const elapsedMs = at * BUCKET_MS
    const extended = this.rule.extended
    const window = this.windowAt(elapsedMs)
    const stable = window !== null && windowStable(this.buckets(window.fromMs / BUCKET_MS, window.toMs / BUCKET_MS))
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
    if (warmupEnd === null || this.retention !== null) {
      return null
    }
    return downloadWindow(warmupEnd.bucket, endMs, (bucket) => this.bytes.get(bucket) ?? 0, (from, to) => this.streams.contributors(from, to))
  }

  /** The bytes of the buckets from `from` to `to` (exclusive). */
  private buckets(from: number, to: number): number[] {
    return Array.from({ length: Math.max(0, to - from) }, (_, offset) => this.bytes.get(from + offset) ?? 0)
  }

  /** Bucket `bucket` closed: to the live series, and in Continuous from the steady start to the retention, which keeps it. */
  private close(bucket: number): void {
    const bytes = this.bytes.get(bucket) ?? 0
    const retention = this.retention
    if (retention === null || retention.first === null) {
      this.series.append(bytes)
      return
    }
    retention.append(bytes)
    this.bytes.delete(bucket)
    // The ramp reads the live series until it settles.
    if (!this.ramp.settled) {
      this.series.append(bytes)
    }
  }

  /**
   * Warm-up ended at `bucket`. No window reads a request that ended before it, and in Continuous
   * none reads any that ended: the retention begins there, with the buckets closed since.
   */
  private steady(bucket: number): void {
    const retention = this.retention
    if (retention === null) {
      this.streams.window(bucket)
      return
    }
    this.streams.window(Number.POSITIVE_INFINITY)
    retention.begin(bucket)
    for (let closed = bucket; closed < this.closed; closed++) {
      retention.append(this.bytes.get(closed) ?? 0)
    }
    for (const kept of this.bytes.keys()) {
      if (kept < this.closed) {
        this.bytes.delete(kept)
      }
    }
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
    const bucket = Math.max(Math.floor((chunk.at - this.start) / BUCKET_MS), this.closed)
    this.bytes.set(bucket, (this.bytes.get(bucket) ?? 0) + chunk.bytes)
    this.read += chunk.bytes
    this.usedNotices?.update(this.options.dataUsedBefore + this.read)
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
    this.endMs = reason === 'duration' ? this.closed * BUCKET_MS : Math.max(0, Math.min(at, this.clock.now()) - this.start)
    for (const timer of [this.tickTimer, this.runTimer]) {
      if (timer !== null) {
        this.clock.clearTimer(timer)
      }
    }
    // The loaded-latency grace: d of the longest request in flight now, 2 s without a rate.
    this.options.ended?.(graceFor([...this.inFlight.keys()].map((request) => this.streams.expectedMs(request.stream, request.size))))
    for (const controller of this.inFlight.values()) {
      controller.abort()
    }
    // In Continuous the full buckets up to the end instant reach the retention, as a window's would.
    while (this.retention !== null && this.closed < Math.floor(this.endMs / BUCKET_MS)) {
      this.close(this.closed++)
    }
    this.done?.(this.outcome())
  }

  private outcome(): DownloadOutcome {
    const endMs = this.endMs
    // A Continuous download keeps no bucket of its own: its retention holds the run.
    const buckets = this.retention === null ? this.buckets(0, Math.ceil(endMs / BUCKET_MS)) : []
    return downloadOutcome({
      reason: this.ended,
      endMs,
      window: this.windowAt(endMs),
      rule: this.rule,
      warmup: this.warmup.end,
      events: this.events,
      buckets,
      retention: this.retention,
      dataUsed: this.usedNotices?.raised ?? [],
      streams: this.ramp.streams,
      plateau: this.ramp.plateau,
      bytes: this.read,
      protocol: this.protocol,
      streamLimit: this.streamLimit,
      compressed: this.compressed,
    })
  }
}
