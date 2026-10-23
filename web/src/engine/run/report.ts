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

import type { LoadedSeconds } from '@/engine/continuous/loaded'
import type { DownloadOutcome } from '@/engine/download/phase'
import type { IdleOutcome } from '@/engine/latency/idle'
import type { LoadedOutcome } from '@/engine/latency/loaded'
import type { DirectionEvent, EngineErrorCode, MeasuringPhase, Notice, NoticeCode, Responsiveness, ResultStatus } from '@/engine/messages'
import type { RunSettings } from '@/engine/settings'
import type { BrowserIdentity, Info } from '@/engine/types'
import type { UploadOutcome } from '@/engine/upload/outcome'

// What a run hands to the result object (measurement.md section 17): every phase's outcome and the
// notices that belong to the run rather than to one direction.

/** A direction's loaded-latency pinger as it ended (measurement.md section 11). */
export interface LoadedDirection {
  outcome: LoadedOutcome
  /** The direction ran under the HTTP/1.1 probe reservation. */
  reserved: boolean
  /** The phase start on the client clock, which the pings' instants count from. */
  startAt: number
  /** Continuous only: the per-second medians the pings folded into, the outcome keeping none. */
  seconds: LoadedSeconds | null
}

export interface RunReport {
  status: ResultStatus
  /** GET /api/v1/info at the start of the run, and the browser the wiring identified. */
  info: Info
  browser: BrowserIdentity
  /** nextHopProtocol of the latest throughput request, or of the info phase's request. */
  protocol: string | null
  settings: RunSettings
  /** Null for a phase that did not run or has no result. */
  idle: IdleOutcome | null
  download: DownloadOutcome | null
  upload: UploadOutcome | null
  /** Each direction's loaded latency; null for a direction the pinger did not run for. */
  loaded: Record<'download' | 'upload', LoadedDirection | null>
  /** Each direction's HTTP loaded responsiveness, settled as it finished; null for one that did not run. */
  responsiveness: Record<'download' | 'upload', Responsiveness | null>
  /** The measuring phases that did not run: left out by the settings, or after a stop, an error or the data cap. */
  skipped: MeasuringPhase[]
  notices: Notice[]
  /** Throughput bytes in both directions; latency probes are not counted (measurement.md section 5). */
  dataUsedBytes: number
  error: EngineErrorCode | null
}

/** What the run saw that no single phase reports. */
export interface RunConditions {
  /** The URL parameters the page ignored, from the run's settings. */
  url: readonly Notice[]
  connection: readonly Notice[]
  /** The probe reservation's notice, once, from the first direction that ran reserved. */
  latency: readonly Notice[]
  /** The page was hidden at some point of the run. */
  hidden: boolean
  /** A housekeeping tick arrived more than 1 s late while the page was visible. */
  throttled: boolean
}

/** One `url-parameter-ignored` notice per URL parameter the page ignored, from the start of the run. */
export function urlNotices(settings: Pick<RunSettings, 'ignoredParameters'>): Notice[] {
  return (settings.ignoredParameters ?? []).map(({ parameter, value }) => ({ code: 'url-parameter-ignored', parameter, value }))
}

/** Whether a bounded direction was stopped: its outcome carries the stop's `cancelled` event. */
function boundedStop(outcome: DownloadOutcome | UploadOutcome): boolean {
  return outcome.retention === null && outcome.events.some((event) => event.code === 'cancelled')
}

/** The run-level notices of measurement.md section 16, in the order the result lists them. */
export function runNotices(report: Pick<RunReport, 'download' | 'upload'>, conditions: RunConditions): Notice[] {
  const notices: Notice[] = [...conditions.url, ...conditions.connection, ...conditions.latency]
  const { download, upload } = report
  // Every stopped bounded direction, with a number or without (section 7.6); a Continuous one
  // carries its own from its outcome (section 15).
  if (download !== null && boundedStop(download)) {
    const window = download.window
    notices.push({ code: 'stopped-early', direction: 'download', coveredMs: window === null ? 0 : window.toMs - window.fromMs })
  }
  if (upload !== null && boundedStop(upload)) {
    notices.push({ code: 'stopped-early', direction: 'upload', coveredMs: upload.window?.windowMs ?? 0 })
  }
  if (conditions.hidden) {
    notices.push({ code: 'page-hidden' })
  }
  if (conditions.throttled) {
    notices.push({ code: 'timer-throttling-detected' })
  }
  return notices
}

/** The errors a run ends with; invalid settings never start one. */
export type RunErrorCode = Exclude<EngineErrorCode, 'invalid-settings'>

/** The notices a measurement earns; a phase that reports nothing has none of them. */
const MEASURED: readonly NoticeCode[] = ['low-confidence', 'insufficient-data', 'slow-link-extended', 'stopped-early']

function erred(outcome: { notices: readonly Notice[]; events: readonly DirectionEvent[] }, code: RunErrorCode): { notices: Notice[]; events: DirectionEvent[] } {
  const notices = outcome.notices.filter((notice) => !MEASURED.includes(notice.code) && notice.code !== code)
  return {
    notices: code === 'server-restarted' ? [...notices, { code }] : notices,
    events: outcome.events.map((event) => (event.code === 'cancelled' ? { code: 'error', atMs: event.atMs, notice: code } : event)),
  }
}

/**
 * The current direction when the run ends with an error of its own, a network change or a restart
 * seen by the WebSocket-close sequence: it reports nothing measured and does not merge
 * measurements across the change (edge-cases.md sections 6 and 11), as an upload answer's new
 * epoch already gives. The bytes moved still count as data used.
 */
export function discardedDownload(outcome: DownloadOutcome, code: RunErrorCode): DownloadOutcome {
  return { ...outcome, ...erred(outcome, code), status: 'error', buckets: [], warmup: null, window: null }
}

export function discardedUpload(outcome: UploadOutcome, code: RunErrorCode): UploadOutcome {
  return {
    ...outcome,
    ...erred(outcome, code),
    status: 'error',
    warmup: null,
    window: null,
    phaseStartMs: null,
    warmupEndMs: null,
    windowEndMs: null,
    series: null,
  }
}

/**
 * The result status: `error` after an error; for Continuous, `complete` when its direction was
 * measured, however it ended, and `partial` otherwise (measurement.md section 15); for a bounded
 * preset, `partial` after a stop.
 */
export function runStatus(interrupt: { kind: 'stop' | 'error' } | null, report: Pick<RunReport, 'settings' | 'download' | 'upload'>): ResultStatus {
  if (interrupt?.kind === 'error') {
    return 'error'
  }
  const { settings } = report
  if (settings.preset === 'continuous') {
    return report[settings.continuousDirection ?? 'download']?.status === 'measured' ? 'complete' : 'partial'
  }
  return interrupt === null ? 'complete' : 'partial'
}
