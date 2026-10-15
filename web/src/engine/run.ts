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

import { type DownloadOutcome, DownloadPhase } from '@/engine/download/phase'
import { IdleLatency, type IdleOutcome } from '@/engine/latency/idle'
import type { Direction, EngineEvent, MeasuringPhase, Notice, PhaseName, PhaseState } from '@/engine/messages'
import { buildResult } from '@/engine/result'
import { downloadResult, uploadResult } from '@/engine/result/direction'
import { Connection } from '@/engine/run/connection'
import { PageState } from '@/engine/run/page'
import { discardedDownload, discardedUpload, type RunErrorCode, type RunReport, runNotices } from '@/engine/run/report'
import { SampleFeed } from '@/engine/run/samples'
import type { RunSettings } from '@/engine/settings'
import { BusyTrack } from '@/engine/stats/busy'
import type { Clock, InfoResult, TimerId, Transport } from '@/engine/types'
import type { UploadOutcome } from '@/engine/upload/outcome'
import { UploadPhase } from '@/engine/upload/phase'

// A run from `start` to its last phase (measurement.md section 1, architecture.md section 4): the
// info phase, then the configured measuring phases in order, with every v0.1 interruption: a user
// stop, a page the browser paused while hidden, a network change, a server restart, an
// unreachable server and the WebSocket-close sequence (edge-cases.md sections 2, 5, 6, 11, 15).

/** The housekeeping tick; one more than 1 s late means the Worker was throttled or paused. */
const TICK_MS = 100
const LATE_MS = 1000
/** The info phase's one idle request, which records the protocol (path B is v0.3). */
const SMALL_PATH = '/api/v1/small'
const MEASURING: readonly MeasuringPhase[] = ['idle', 'download', 'upload']

export interface RunOptions {
  clock: Clock
  transport: Transport
  settings: RunSettings
  /** Whether the page is visible when the run starts. */
  visible: boolean
  emit: (event: EngineEvent) => void
}

type Interrupt = { kind: 'stop'; at?: number } | { kind: 'error'; code: RunErrorCode }

/** What a running phase offers the run: a stop, at an earlier instant for a paused page. */
interface Stoppable {
  stop(at?: number): void
}

export class Run {
  private readonly options: RunOptions
  private readonly clock: Clock
  private interrupt: Interrupt | null = null
  private wake: () => void = () => undefined
  private readonly interrupted: Promise<null>
  private current: Stoppable | null = null
  private phase: PhaseName = 'info'
  private connection: Connection | null = null
  private readonly page: PageState
  private restartIdle = false
  private lastTick: number | null = null
  private tickTimer: TimerId | null = null
  private sampling: { phase: DownloadPhase | UploadPhase; feed: SampleFeed; before: number } | null = null
  private idle: IdleLatency | null = null
  private idleMedian: number | null = null
  private protocol: string | null = null
  private dataUsed = 0
  private readonly busy = new BusyTrack()
  private readonly fraction = (from: number, to: number): number | null => this.busy.fraction(from, to)
  private downloadStartAt: number | null = null
  /** Whether any phase has a result to keep. */
  private kept = false
  /** Commands after the run has ended are ignored. */
  private finished = false

  constructor(options: RunOptions) {
    this.options = options
    this.clock = options.clock
    this.page = new PageState(options.visible)
    this.interrupted = new Promise((resolve) => {
      this.wake = () => resolve(null)
    })
  }

  /**
   * Runs every phase and emits the result object; resolves with the report, or null when no
   * phase has a result to keep, which emits no result.
   */
  async start(): Promise<RunReport | null> {
    const startedAt = new Date()
    const startAt = this.clock.now()
    this.tick()
    try {
      const report = await this.sequence()
      if (report !== null) {
        const now = this.clock.now()
        this.busy.record(now, this.clock.busyMs())
        const result = buildResult({ report, startedAt, durationMs: now - startAt, clock: this.clock, downloadStartAt: this.downloadStartAt, busy: this.fraction })
        this.options.emit({ type: 'result', result })
      }
      return report
    } finally {
      this.finished = true
      if (this.tickTimer !== null) {
        this.clock.clearTimer(this.tickTimer)
      }
      this.connection?.dispose()
    }
  }

  /** A user stop: in-flight requests aborted, completed phases kept, the rest skipped. */
  stop(): void {
    if (!this.finished) {
      this.halt({ kind: 'stop' })
    }
  }

  /** The page's visibility, forwarded by the UI. */
  visibility(visible: boolean): void {
    if (this.finished) {
      return
    }
    if (this.page.change(visible, this.clock.now(), this.phase)) {
      // Idle latency, being short, starts over once the page is visible again.
      this.restartIdle = true
      this.current?.stop()
    }
  }

  /** An `offline` event or a connection type change: the measured path changed. */
  network(): void {
    if (!this.finished) {
      this.fail('network-changed')
    }
  }

  private async sequence(): Promise<RunReport | null> {
    const { settings } = this.options
    const skipped = MEASURING.filter((name) => !settings.phases.includes(name))
    this.enter('info')
    const start = await this.infoPhase()
    if (start === null) {
      if (this.interrupt?.kind === 'error') {
        this.event('info', 'failed')
      }
      // A stop or an error before the first measuring phase: every one of them is skipped.
      ;[...skipped, ...settings.phases].forEach((phase) => this.event(phase, 'skipped'))
      return null
    }
    skipped.forEach((phase) => this.event(phase, 'skipped'))
    const directions = { overheadCompensationPercent: settings.overheadCompensationPercent, busy: this.fraction }
    const report: RunReport = { ...start, status: 'complete', protocol: null, settings, idle: null, download: null, upload: null, skipped, notices: [], dataUsedBytes: 0, error: null }
    for (const phase of settings.phases) {
      if (this.interrupt !== null || report.download?.dataCapReached === true || report.upload?.dataCapReached === true) {
        report.skipped.push(phase)
        this.event(phase, 'skipped')
      } else if (phase === 'idle') {
        report.idle = await this.idlePhase()
      } else if (phase === 'download') {
        report.download = this.settle('download', await this.throughput(new DownloadPhase(this.phaseOptions('download', start))), discardedDownload, (outcome) => downloadResult(outcome, this.downloadStartAt ?? 0, directions).bitsPerSecond)
      } else {
        const options = { ...this.phaseOptions('upload', start), epoch: start.info.server.epoch }
        report.upload = this.settle('upload', await this.throughput(new UploadPhase(options)), discardedUpload, (outcome) => uploadResult(outcome, directions).bitsPerSecond)
      }
    }
    if (!this.kept) {
      return null
    }
    const interrupt = this.interrupt
    return {
      ...report,
      status: interrupt === null ? 'complete' : interrupt.kind === 'stop' ? 'partial' : 'error',
      protocol: this.protocol,
      dataUsedBytes: this.dataUsed,
      error: interrupt?.kind === 'error' ? interrupt.code : null,
      notices: runNotices(report, { url: this.urlNotices(), connection: this.connection?.notices ?? [], hidden: this.page.hidden, throttled: this.page.throttled }),
    }
  }

  /** GET /info for the epoch and limits, the WebSocket or its fallback, and one idle request. */
  private async infoPhase(): Promise<Pick<RunReport, 'info' | 'browser'> | null> {
    let start: InfoResult | null
    try {
      start = await this.guard(this.options.transport.info())
    } catch {
      this.fail('server-unreachable')
      return null
    }
    if (start === null) {
      return null
    }
    const { epoch } = start.info.server
    this.connection = new Connection({
      clock: this.clock,
      transport: this.options.transport,
      epoch,
      medianMs: () => this.idleMedian ?? this.idle?.medianMs ?? null,
      decided: (verdict) => (verdict.kind === 'error' ? this.fail(verdict.code) : this.reconnected()),
    })
    await this.guard(this.connection.open())
    try {
      const probe = await this.guard(this.options.transport.probe(SMALL_PATH))
      this.record(probe?.timing?.nextHopProtocol)
    } catch {
      // The idle request only records the protocol; a failure here is the phases' to meet.
    }
    if (this.interrupt !== null) {
      return null
    }
    this.event('info', 'finished')
    return { info: start.info, browser: start.browser }
  }

  private async idlePhase(): Promise<IdleOutcome | null> {
    this.enter('idle')
    this.page.idleStarted()
    for (;;) {
      const idle = new IdleLatency(this.clock, this.connection?.pinger ?? unreachable(), this.options.settings.pingCount, (progress) => this.options.emit({ type: 'idle', ...progress }))
      this.current = idle
      this.idle = idle
      this.restartIdle = false
      const outcome = await idle.run()
      this.current = null
      this.idle = null
      if (this.interrupt !== null) {
        if (this.interrupt.kind === 'error') {
          this.event('idle', 'failed')
        }
        return null
      }
      if (outcome === null) {
        if (this.restartIdle) {
          continue
        }
        return null
      }
      if (outcome.unreachable) {
        this.event('idle', 'failed')
        this.fail('server-unreachable')
        return null
      }
      this.idleMedian = outcome.result.medianMs ?? null
      this.kept = true
      this.event('idle', 'finished')
      return outcome
    }
  }

  private phaseOptions(direction: Direction, start: Pick<RunReport, 'info'>) {
    const { settings } = this.options
    return {
      clock: this.clock,
      transport: this.options.transport,
      preset: settings.preset,
      streams: settings.streams,
      bounds: settings[direction],
      warmup: settings.warmup,
      dataCapBytes: settings.dataCapBytes,
      dataUsedBefore: this.dataUsed,
      limits: start.info.limits,
      rttMs: this.idleMedian,
    }
  }

  private async throughput(phase: DownloadPhase): Promise<DownloadOutcome>
  private async throughput(phase: UploadPhase): Promise<UploadOutcome>
  private async throughput(phase: DownloadPhase | UploadPhase): Promise<DownloadOutcome | UploadOutcome> {
    this.enter(phase instanceof DownloadPhase ? 'download' : 'upload')
    this.current = phase
    this.sampling = { phase, feed: new SampleFeed(), before: this.dataUsed }
    if (phase instanceof DownloadPhase) {
      this.downloadStartAt = this.clock.now()
    }
    const outcome = await phase.run()
    this.busy.record(this.clock.now(), this.clock.busyMs())
    this.sample(this.clock.now())
    this.current = null
    this.sampling = null
    this.dataUsed += outcome.bytes
    this.record(outcome.protocol)
    return outcome
  }

  /** The direction's outcome under the run's interruption, and the errors it raises itself. */
  private settle<T extends DownloadOutcome | UploadOutcome>(direction: Direction, outcome: T, discard: (outcome: T, code: RunErrorCode) => T, headline: (outcome: T) => number | undefined): T {
    const interrupt = this.interrupt
    // A network change or a restart leaves the current phase with an error and nothing measured.
    const settled = interrupt?.kind === 'error' ? discard(outcome, interrupt.code) : outcome
    if (interrupt === null && settled.status === 'error') {
      this.fail(settled.notices.some((notice) => notice.code === 'server-restarted') ? 'server-restarted' : 'requests-failed')
    }
    this.kept ||= settled.status !== 'error'
    this.event(direction, settled.status === 'error' ? 'failed' : 'finished', { streams: settled.streams, headline: settled.status === 'error' ? undefined : headline(settled), bytes: settled.bytes })
    return settled
  }

  private reconnected(): void {
    if (this.phase === 'idle') {
      // The pings of the closed echo were lost: idle latency starts over on the new path.
      this.restartIdle = true
      this.current?.stop()
    }
  }

  private tick(): void {
    const now = this.clock.now()
    const last = this.lastTick
    // A hidden page the browser paused stops a throughput phase as a user stop at the last on-time
    // tick; in the info phase nothing is timed, and idle latency restarts once the page is visible.
    if (last !== null && now - last - TICK_MS > LATE_MS && this.page.paused(last) && (this.phase === 'download' || this.phase === 'upload')) {
      this.halt({ kind: 'stop', at: last })
    }
    this.lastTick = now
    this.busy.record(now, this.clock.busyMs())
    this.sample(now)
    this.tickTimer = this.clock.setTimer(TICK_MS, () => this.tick())
  }

  private sample(now: number): void {
    const sampling = this.sampling
    if (sampling === null) {
      return
    }
    // Typed here so that the dead-code analysis sees the feed's members in use.
    const feed: SampleFeed = sampling.feed
    const { phase, before } = sampling
    const event = phase instanceof DownloadPhase ? feed.download(phase, before) : feed.upload(phase, before, now)
    if (event !== null) {
      this.options.emit(event)
    }
  }

  private fail(code: RunErrorCode): void {
    if (this.interrupt === null) {
      this.options.emit({ type: 'error', code, messageKey: `errors.${code}`, phase: this.phase, partial: this.kept })
    }
    this.halt({ kind: 'error', code })
  }

  private halt(interrupt: Interrupt): void {
    if (this.interrupt !== null) {
      return
    }
    this.interrupt = interrupt
    this.current?.stop(interrupt.kind === 'stop' ? interrupt.at : undefined)
    this.wake()
  }

  /** Settles with `promise`, or with null once the run is interrupted. */
  private guard<T>(promise: Promise<T>): Promise<T | null> {
    return Promise.race([promise, this.interrupted])
  }

  private record(protocol: string | null | undefined): void {
    if (protocol !== undefined && protocol !== null) {
      this.protocol = protocol === '' ? 'unknown' : protocol
    }
  }

  private enter(phase: PhaseName): void {
    this.phase = phase
    this.event(phase, 'started')
  }

  /** One `url-parameter-ignored` notice per URL parameter the page ignored, from the start of the run. */
  private urlNotices(): Notice[] {
    return (this.options.settings.ignoredParameters ?? []).map((parameter) => ({ code: 'url-parameter-ignored', parameter }))
  }

  private event(phase: PhaseName, state: PhaseState, { streams, headline, bytes }: { streams?: number; headline?: number | undefined; bytes?: number } = {}): void {
    const notices: Notice[] = [...this.urlNotices(), ...(this.connection?.notices ?? [])]
    this.options.emit({
      type: 'phase',
      phase,
      state,
      notices,
      ...(this.protocol === null ? {} : { protocol: this.protocol }),
      ...(streams === undefined ? {} : { streams }),
      ...(headline === undefined ? {} : { headlineBitsPerSecond: headline }),
      ...(bytes === undefined ? {} : { bytes }),
    })
  }
}

function unreachable(): never {
  throw new Error('idle latency runs after the info phase opened its connection')
}
