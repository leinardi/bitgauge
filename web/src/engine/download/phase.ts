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

import { type DownloadRequest, Streams } from '@/engine/download/streams'
import type { DirectionEvent, DirectionStatus, DurationBounds, Notice, Plateau, Preset, TestSettings } from '@/engine/messages'
import { Ramp } from '@/engine/phases/ramp'
import { Warmup, type WarmupEnd } from '@/engine/phases/warmup'
import { DurationRule, windowConditionHolds } from '@/engine/phases/window'
import { BucketSeries } from '@/engine/stats/buckets'
import { BUCKET_MS } from '@/engine/stats/units'
import type { Clock, DownloadChunk, Info, ResourceTiming, TimerId, Transport } from '@/engine/types'

// The download phase (measurement.md sections 5 and 6): streams issue sized requests through the
// transport, every chunk is counted into the client bucket of its arrival, and the phase reads its
// live series one closed bucket at a time for the ramp, the warm-up and the duration rule. It ends
// at an instant: requests in flight are aborted and the bytes they read are kept.

/** A request still running after this long is aborted and counts as failed. */
const TIMEOUT_MS = 30_000

/** Consecutive failed requests that end the phase with an error. */
const MAX_FAILURES = 3

const TOO_MANY_REQUESTS = 429

export interface DownloadOptions {
  clock: Clock
  transport: Pick<Transport, 'download'>
  preset: Preset
  streams: TestSettings['streams']
  bounds: DurationBounds
  warmup: TestSettings['warmup']
  dataCapBytes: number | null
  /** The data the test used before this phase, which counts against the data cap. */
  dataUsedBefore: number
  limits: Pick<Info['limits'], 'maxDownloadBytes' | 'maxStreamsPerClient'>
  /** The idle-latency median, or null when idle latency was skipped. */
  rttMs: number | null
}

/** The steady window: from the end of warm-up to the end instant, in ms from the phase start. */
export interface DownloadWindow {
  fromMs: number
  toMs: number
  bytes: number
  /** The different requests that contributed bytes to it. */
  requests: number
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
  private readonly streams = new Streams()
  private readonly ramp: Ramp
  private readonly warmup: Warmup
  private readonly rule: DurationRule
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
    this.ramp = new Ramp({
      mode: options.streams.mode,
      fixed: options.streams.fixed,
      max: options.streams.max,
      serverMax: options.limits.maxStreamsPerClient,
      rttMs: options.rttMs,
    })
    this.warmup = new Warmup({
      direction: 'download',
      maxMs: options.bounds.maxMs,
      fixedMs: options.warmup === 'auto' ? null : options.warmup,
    })
    this.rule = new DurationRule('download', options.bounds, options.preset)
  }

  /** The bytes read so far in this phase. */
  get dataUsed(): number {
    return this.read
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

  /** Ends the phase now, as a user stop: in-flight requests are aborted and their bytes kept. */
  stop(): void {
    this.end('stopped')
  }

  private schedule(): void {
    const next = this.start + (this.series.end + 1) * BUCKET_MS
    this.tickTimer = this.clock.setTimer(Math.max(0, next - this.clock.now()), () => this.tick())
  }

  /** Closes every bucket that has ended, then decides on the series up to them. */
  private tick(): void {
    this.tickTimer = null
    const closed = Math.floor((this.clock.now() - this.start) / BUCKET_MS)
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
      this.ramp.update(this.series)
      if (this.ramp.placing) {
        // On download the added streams take effect in the bucket of the add.
        this.ramp.stepStarted(at)
      }
    }
    if (this.warmup.end === null) {
      this.warmup.update(this.series, this.ramp, this.streams.completedPerStream(this.ramp.streams))
    }
    const elapsedMs = at * BUCKET_MS
    const extended = this.rule.extended
    const verdict = this.rule.evaluate(elapsedMs, this.windowAt(elapsedMs)?.holds ?? false)
    if (!extended && this.rule.extended) {
      this.events.push({ code: 'extended', atMs: elapsedMs })
    }
    if (verdict === 'end') {
      this.end('duration')
      return
    }
    this.grow()
  }

  /** The steady window up to `toMs`, and whether it meets the window condition. */
  private windowAt(toMs: number): (DownloadWindow & { holds: boolean }) | null {
    const warmupEnd = this.warmup.end
    if (warmupEnd === null) {
      return null
    }
    const from = warmupEnd.bucket
    const to = Math.ceil(toMs / BUCKET_MS)
    const fromMs = from * BUCKET_MS
    const requests = this.streams.contributors(from, to)
    let bytes = 0
    for (let bucket = from; bucket < to; bucket++) {
      bytes += this.bytes[bucket] ?? 0
    }
    return { fromMs, toMs, bytes, requests, holds: windowConditionHolds('download', toMs - fromMs, requests) }
  }

  /** Starts the streams the ramp asks for. */
  private grow(): void {
    while (this.ended === null && this.streams.started < this.ramp.streams) {
      void this.loop(this.streams.add())
    }
  }

  /** One stream: requests back to back while the phase runs and the stream is within the count. */
  private async loop(stream: number): Promise<void> {
    while (this.ended === null && stream < this.ramp.streams) {
      const size = this.streams.nextSize(stream, this.options.limits.maxDownloadBytes, this.budget())
      if (size === null) {
        this.end('data-cap')
        return
      }
      await this.request(stream, size)
    }
  }

  /** What the data cap still allows after data used and the bytes still to come in flight. */
  private budget(): number | null {
    const cap = this.options.dataCapBytes
    if (cap === null) {
      return null
    }
    let pending = 0
    for (const request of this.inFlight.keys()) {
      pending += request.size - request.read
    }
    return cap - this.options.dataUsedBefore - this.read - pending
  }

  private async request(stream: number, size: number): Promise<void> {
    const request = this.streams.issue(stream, size)
    const controller = new AbortController()
    this.inFlight.set(request, controller)
    const timeout = this.clock.setTimer(TIMEOUT_MS, () => controller.abort())
    let status = 0
    let complete = false
    try {
      const response = await this.options.transport.download(size, controller.signal)
      status = response.status
      if (status === 200) {
        this.compressed ||= response.contentEncoding !== null
        for await (const chunk of response.chunks) {
          this.count(request, chunk)
        }
        this.record(response.timing())
        // A body shorter or longer than asked for, without an abort, is a failed request.
        complete = request.read === size
      }
    } catch {
      // Aborted at the end of the phase, timed out, or a network error.
    } finally {
      this.clock.clearTimer(timeout)
      this.inFlight.delete(request)
      if (!complete) {
        // Releases the connection of an answer whose body was not read, such as a 429's.
        controller.abort()
      }
    }
    if (this.ended !== null) {
      return
    }
    if (complete) {
      this.failures = 0
      this.streams.complete(request)
    } else {
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

  private end(reason: EndReason): void {
    if (this.ended !== null) {
      return
    }
    this.ended = reason
    this.endMs = this.clock.now() - this.start
    if (this.tickTimer !== null) {
      this.clock.clearTimer(this.tickTimer)
    }
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
