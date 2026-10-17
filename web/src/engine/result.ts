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

import type { IdleResult, Notice, Result, UploadResult } from '@/engine/messages'
import { directionNotices, downloadResult, resultNotices, skippedDirection, uploadResult } from '@/engine/result/direction'
import { quantized, withLoaded } from '@/engine/result/loaded'
import type { RunReport } from '@/engine/run/report'
import type { BrowserIdentity, Clock } from '@/engine/types'
import type { UploadOutcome } from '@/engine/upload/outcome'
import { IDLE_SHARE } from '@/engine/upload/streams'

// The versioned result object of measurement.md section 17, v0.2 field set: what a run reports,
// with the client's timer resolution and cross-origin isolation (edge-cases.md section 9). The
// fields of later versions are absent, never null-filled.

export interface ResultContext {
  report: RunReport
  /** The wall-clock start, and the run's duration on the monotonic clock. */
  startedAt: Date
  durationMs: number
  clock: Pick<Clock, 'resolutionMs' | 'crossOriginIsolated'>
  /** The download phase start on the client clock, null when it did not run. */
  downloadStartAt: number | null
  /** The Worker's busy fraction between two client instants. */
  busy: (from: number, to: number) => number | null
}

/** A random version 4 UUID; `crypto.randomUUID` needs a secure context, a plain-HTTP LAN is not one. */
function resultId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function idleResult(idle: IdleResult, resolutionMs: number): IdleResult {
  const at = (ms: number) => quantized(ms, resolutionMs)
  const { minMs, medianMs, p90Ms, jitterMs } = idle
  return {
    path: idle.path,
    lossPercent: idle.lossPercent,
    ...(minMs === undefined ? {} : { minMs: at(minMs) }),
    ...(medianMs === undefined ? {} : { medianMs: at(medianMs) }),
    ...(p90Ms === undefined ? {} : { p90Ms: at(p90Ms) }),
    ...(jitterMs === undefined ? {} : { jitterMs: at(jitterMs) }),
    samples: idle.samples.map(at),
  }
}

/** The floor of the Firefox name rule of measurement.md section 16: a phone prepares near 1 Gbit/s or slower. */
const FIREFOX_LIMIT_BITS = 100e6

/**
 * The browser-upload-limit notice (measurement.md section 16): the upload's largest idle share
 * exceeded 20 % in any browser, or the browser is Firefox and the headline is at least 100 Mbit/s.
 */
function browserUploadLimit(browser: BrowserIdentity, outcome: UploadOutcome | null, upload: UploadResult): Notice[] {
  const seen = (outcome?.idleShare ?? 0) > IDLE_SHARE
  const firefox = browser.name === 'Firefox' && (upload.bitsPerSecond ?? 0) >= FIREFOX_LIMIT_BITS
  return seen || firefox ? [{ code: 'browser-upload-limit', browser: browser.name }] : []
}

export function buildResult(context: ResultContext): Result {
  const { report, clock } = context
  const { settings, info } = report
  const percent = settings.overheadCompensationPercent
  const directions = { overheadCompensationPercent: percent, busy: context.busy }
  const measured = report.download === null || context.downloadStartAt === null ? skippedDirection() : downloadResult(report.download, context.downloadStartAt, directions)
  const sent = report.upload === null ? { ...skippedDirection(), confirmedRequests: 0 } : uploadResult(report.upload, directions)
  const { download, upload, bufferbloat } = withLoaded(report, measured, sent, clock.resolutionMs)
  const idle = report.idle?.result
  return {
    schema: 'bitgauge.result',
    schemaVersion: 1,
    id: resultId(),
    startedAt: context.startedAt.toISOString(),
    durationMs: context.durationMs,
    status: report.status,
    label: settings.label ?? '',
    server: { name: info.server.name, version: info.server.version, epoch: info.server.epoch },
    client: {
      ip: info.client.ip,
      // The start override's context label, else the one the server suggests for the address.
      contextLabel: settings.contextLabel ?? info.client.suggestedLabel ?? '',
      protocol: report.protocol ?? 'unknown',
      browser: { ...report.browser },
      timerResolutionMs: clock.resolutionMs,
      crossOriginIsolated: clock.crossOriginIsolated,
    },
    settings: {
      preset: settings.preset,
      phases: [...settings.phases],
      streams: { mode: settings.streams.mode, max: settings.streams.max },
      dataCapBytes: settings.dataCapBytes,
      overheadCompensationPercent: percent,
      warmup: settings.warmup,
      pingCount: settings.pingCount,
    },
    ...(idle === undefined ? {} : { idle: idleResult(idle, clock.resolutionMs) }),
    download,
    upload,
    ...(bufferbloat === undefined ? {} : { bufferbloat }),
    dataUsedBytes: report.dataUsedBytes,
    notices: resultNotices([directionNotices(report.download?.notices, download), directionNotices(report.upload?.notices, upload), report.notices, browserUploadLimit(report.browser, report.upload, upload)], percent),
  }
}
