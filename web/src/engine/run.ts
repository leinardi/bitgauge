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
import type { IdleLatency, IdleOutcome } from '@/engine/latency/idle'
import type { WarmupEnd } from '@/engine/phases/warmup'
import type { Direction, DirectionResult, EngineEvent, IdleResult, MeasuringPhase, Notice, PhaseName, PhaseState } from '@/engine/messages'
import { buildResult } from '@/engine/result'
import { directionNotices, downloadResult, resultNotices, uploadResult } from '@/engine/result/direction'
import type { Connection } from '@/engine/run/connection'
import { phaseEvent } from '@/engine/run/events'
import { type Interrupt, Interruption } from '@/engine/run/interrupt'
import { LoadedProbes } from '@/engine/run/latency'
import { PageState } from '@/engine/run/page'
import { discardedDownload, discardedUpload, type RunErrorCode, type RunReport, runNotices, urlNotices } from '@/engine/run/report'
import { capabilityOf, ResponsivenessProbes } from '@/engine/run/responsiveness'
import { SampleFeed } from '@/engine/run/samples'
import { idlePhase, infoPhase, type StartContext } from '@/engine/run/start'
import { Housekeeping } from '@/engine/run/tick'
import type { RunSettings } from '@/engine/settings'
import { BusyTrack } from '@/engine/stats/busy'
import type { Clock, Transport } from '@/engine/types'
import type { UploadOutcome } from '@/engine/upload/outcome'
import { UploadPhase } from '@/engine/upload/phase'

// A run from `start` to its last phase (measurement.md section 1, architecture.md section 4): the
// info phase, then the configured measuring phases in order, loaded latency and path B alongside
// each direction (run/latency.ts, run/responsiveness.ts), with every interruption: a user
// stop, a page the browser paused while hidden, a network change, a server restart, an
// unreachable server and the WebSocket-close sequence (edge-cases.md sections 2, 5, 6, 11, 15).

const MEASURING: readonly MeasuringPhase[] = ['idle', 'download', 'upload']

export interface RunOptions {
  clock: Clock
  transport: Transport
  settings: RunSettings
  /** Whether the page is visible when the run starts. */
  visible: boolean
  emit: (event: EngineEvent) => void
  /** The wall clock the result's start time reads, in epoch milliseconds; Date.now by default. */
  wallClock?: () => number
}

/** What a running phase offers the run: a stop, at an earlier instant for a paused page. */
interface Stoppable {
  stop(at?: number): void
}

export class Run {
  private readonly options: RunOptions
  private readonly clock: Clock
  private readonly interruption = new Interruption()
  private current: Stoppable | null = null
  private phase: PhaseName = 'info'
  private enteredAt = 0
  private connection: Connection | null = null
  private readonly page: PageState
  private readonly loaded: LoadedProbes
  private readonly responsiveness: ResponsivenessProbes
  private restartIdle = false
  private readonly housekeeping: Housekeeping
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
  /** The notices the directions that ended have earned, which every later phase event carries. */
  private measured: Notice[] = []
  /** Set once the phases are over: commands, and the verdict of a closed echo, are ignored from then on. */
  private finished = false

  constructor(options: RunOptions) {
    this.options = options
    this.clock = options.clock
    this.page = new PageState(options.visible)
    this.loaded = new LoadedProbes({ clock: this.clock, path: () => this.connection?.loaded ?? null, fallbackAt: () => this.connection?.fallbackAt ?? null })
    this.responsiveness = new ResponsivenessProbes(this.clock, options.transport)
    this.housekeeping = new Housekeeping({ clock: this.clock, busy: this.busy, late: (last) => this.late(last), tick: (now) => this.sample(now) })
  }

  /** The run's interruption, or null while it runs uninterrupted. */
  private get interrupt(): Interrupt | null {
    return this.interruption.value
  }

  /** Runs every phase and emits the result object; resolves with the report, or null when no phase has a result to keep, which emits no result. */
  async start(): Promise<RunReport | null> {
    const startedAt = new Date(this.options.wallClock?.() ?? Date.now())
    const startAt = this.clock.now()
    this.housekeeping.start()
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
      this.housekeeping.stop()
      this.loaded.drain()
      this.responsiveness.drain()
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
    const start = await infoPhase(this.startContext())
    if (start === null) {
      if (this.interrupt?.kind === 'error') {
        this.event('info', 'failed')
      }
      // A stop or an error before the first measuring phase: every one of them is skipped.
      ;[...skipped, ...settings.phases].forEach((phase) => this.event(phase, 'skipped'))
      return null
    }
    this.event('info', 'finished')
    this.loaded.infoProtocol = this.protocol
    skipped.forEach((phase) => this.event(phase, 'skipped'))
    const directions = { overheadCompensationPercent: settings.overheadCompensationPercent, busy: this.fraction }
    const report: RunReport = { ...start, status: 'complete', protocol: null, settings, idle: null, download: null, upload: null, loaded: { download: null, upload: null }, responsiveness: { download: null, upload: null }, skipped, notices: [], dataUsedBytes: 0, error: null }
    for (const phase of settings.phases) {
      if (this.interrupt !== null || report.download?.dataCapReached === true || report.upload?.dataCapReached === true) {
        report.skipped.push(phase)
        this.event(phase, 'skipped')
      } else if (phase === 'idle') {
        report.idle = await this.idlePhase()
      } else if (phase === 'download') {
        const download = new DownloadPhase(this.phaseOptions('download', start))
        report.download = this.settle('download', await this.throughput(download, () => download.inFlightCount), discardedDownload, (outcome) => downloadResult(outcome, this.downloadStartAt ?? 0, directions))
      } else {
        const upload = new UploadPhase({ ...this.phaseOptions('upload', start), epoch: start.info.server.epoch })
        report.upload = this.settle('upload', await this.throughput(upload, () => upload.inFlightCount), discardedUpload, (outcome) => uploadResult(outcome, directions))
      }
    }
    if (!this.kept) {
      return null
    }
    // The phases are over: a stop, a network change or a closed echo from here on changes nothing
    // while the last direction's pings get their grace before the result.
    this.finished = true
    const interrupt = this.interrupt
    report.loaded = await this.loaded.results()
    return {
      ...report,
      responsiveness: this.responsiveness.results(),
      status: interrupt === null ? 'complete' : interrupt.kind === 'stop' ? 'partial' : 'error',
      protocol: this.protocol,
      dataUsedBytes: this.dataUsed,
      error: interrupt?.kind === 'error' ? interrupt.code : null,
      notices: runNotices(report, { url: urlNotices(this.options.settings), connection: this.connection?.notices ?? [], latency: this.loaded.notices, hidden: this.page.hidden, throttled: this.page.throttled }),
    }
  }

  /** The run as the info and idle phases see it. */
  private startContext(): StartContext {
    const { clock, transport, settings } = this.options
    return {
      clock,
      transport,
      settings,
      emit: (event) => this.options.emit(event),
      guard: (promise) => this.interruption.guard(promise),
      interrupted: () => this.interrupt?.kind ?? null,
      fail: (code) => this.fail(code),
      record: (protocol) => this.record(protocol),
      capability: (probe) => {
        this.responsiveness.protocol = capabilityOf(probe)
      },
      opened: (connection) => {
        this.connection = connection
      },
      medianMs: () => this.idleMedian ?? this.idle?.medianMs ?? null,
      reconnected: () => this.reconnected(),
      running: (idle) => {
        this.current = idle
        this.idle = idle
        if (idle !== null) {
          this.restartIdle = false
        }
      },
      restarting: () => this.restartIdle,
      enteredAt: () => this.enteredAt,
      idleEvent: (state, idle) => this.event('idle', state, idle === undefined ? {} : { idle }),
    }
  }

  private async idlePhase(): Promise<IdleOutcome | null> {
    this.enter('idle')
    this.page.idleStarted()
    const outcome = await idlePhase(this.startContext(), this.connection)
    if (outcome === null) {
      return null
    }
    this.idleMedian = outcome.result.medianMs ?? null
    this.kept = true
    this.event('idle', 'finished', { idle: outcome.result })
    return outcome
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
      ...this.loaded.reserve(direction),
      ended: (graceMs: number) => {
        this.loaded.end(direction, graceMs)
        this.responsiveness.end(direction)
      },
      warmedUp: (end: WarmupEnd) => this.responsiveness.warmedUp(direction, end),
    }
  }

  /** Runs a direction with loaded latency alongside; `inFlight` counts its throughput requests. */
  private async throughput(phase: DownloadPhase, inFlight: () => number): Promise<DownloadOutcome>
  private async throughput(phase: UploadPhase, inFlight: () => number): Promise<UploadOutcome>
  private async throughput(phase: DownloadPhase | UploadPhase, inFlight: () => number): Promise<DownloadOutcome | UploadOutcome> {
    const direction = phase instanceof DownloadPhase ? 'download' : 'upload'
    this.enter(direction)
    this.current = phase
    this.sampling = { phase, feed: new SampleFeed(() => this.loaded.answered()), before: this.dataUsed }
    if (phase instanceof DownloadPhase) {
      this.downloadStartAt = this.clock.now()
    }
    this.loaded.start(direction, this.clock.now(), inFlight)
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
  private settle<T extends DownloadOutcome | UploadOutcome>(direction: Direction, outcome: T, discard: (outcome: T, code: RunErrorCode) => T, tile: (outcome: T) => DirectionResult): T {
    const interrupt = this.interrupt
    // A network change or a restart leaves the current phase with an error and nothing measured.
    const settled = interrupt?.kind === 'error' ? discard(outcome, interrupt.code) : outcome
    if (interrupt === null && settled.status === 'error') {
      this.fail(settled.notices.some((notice) => notice.code === 'server-restarted') ? 'server-restarted' : 'requests-failed')
    }
    this.kept ||= settled.status !== 'error'
    const tiled = tile(settled)
    const block = { ...tiled, responsiveness: this.responsiveness.settle(direction, tiled, this.clock.resolutionMs) }
    this.measured.push(...directionNotices(settled.notices, block))
    this.event(direction, settled.status === 'error' ? 'failed' : 'finished', { streams: settled.streams, result: block })
    return settled
  }

  private reconnected(): void {
    if (this.phase === 'idle') {
      // The pings of the closed echo were lost: idle latency starts over on the new path.
      this.restartIdle = true
      this.current?.stop()
    }
  }

  /** A late tick: the Worker was throttled, or paused with the page hidden. */
  private late(last: number): void {
    // A hidden page the browser paused stops a throughput phase as a user stop at the last on-time
    // tick; in the info phase nothing is timed, and idle latency restarts once the page is visible.
    if (this.page.paused(last) && (this.phase === 'download' || this.phase === 'upload')) {
      this.halt({ kind: 'stop', at: last })
    }
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
      this.options.emit({ ...event, phaseMs: now - this.enteredAt })
    }
  }

  private fail(code: RunErrorCode): void {
    if (this.finished) {
      return
    }
    if (this.interrupt === null) {
      this.options.emit({ type: 'error', code, messageKey: `errors.${code}`, phase: this.phase, partial: this.kept })
    }
    this.halt({ kind: 'error', code })
  }

  private halt(interrupt: Interrupt): void {
    if (this.finished || !this.interruption.record(interrupt)) {
      return
    }
    this.current?.stop(interrupt.kind === 'stop' ? interrupt.at : undefined)
    this.interruption.release()
  }

  private record(protocol: string | null | undefined): void {
    if (protocol !== undefined && protocol !== null) {
      this.protocol = protocol === '' ? 'unknown' : protocol
    }
  }

  private enter(phase: PhaseName): void {
    this.phase = phase
    this.enteredAt = this.clock.now()
    this.event(phase, 'started')
  }

  private event(phase: PhaseName, state: PhaseState, { streams, result, idle }: { streams?: number; result?: DirectionResult; idle?: IdleResult } = {}): void {
    // The notices so far (architecture.md section 4), in the order the result will list them.
    const notices = resultNotices([this.measured, urlNotices(this.options.settings), this.connection?.notices ?? [], this.loaded.notices], 0)
    const ranMs = state === 'failed' ? this.clock.now() - this.enteredAt : undefined
    this.options.emit(phaseEvent(phase, state, notices, { protocol: this.protocol, streams, result, idle, ranMs }))
  }
}
