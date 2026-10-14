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

import type { DirectionResult, IdleResult, Notice, Result } from '@/engine/messages'
import { downloadResult, resultNotices, skippedDirection, uploadResult } from '@/engine/result/direction'
import type { RunReport } from '@/engine/run/report'
import type { Clock } from '@/engine/types'

// The versioned result object of measurement.md section 17, v0.1 field set: what a run reports,
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

/** A latency no finer than the clock can tell (edge-cases.md section 9); unchanged without a resolution. */
function quantized(ms: number, resolutionMs: number): number {
  if (!(Number.isFinite(resolutionMs) && resolutionMs > 0)) {
    return ms
  }
  const steps = Math.round(ms / resolutionMs) * resolutionMs
  // Rounded again at the nanosecond, so that 0.1 steps do not print as 50.300000000000004.
  return Math.round(steps * 1e6) / 1e6
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

/**
 * The low-confidence notice follows the direction's final confidence: dropped when the level is
 * normal (the steady window dropped `unstable`, section 8.3) or cpu-bound (that level takes
 * precedence, section 16), and carrying the remaining reasons otherwise.
 */
function directionNotices(notices: readonly Notice[] | undefined, block: DirectionResult): readonly Notice[] {
  const confidence = block.confidence
  return (notices ?? []).flatMap((notice): Notice[] => {
    if (notice.code !== 'low-confidence') {
      return [notice]
    }
    return confidence?.level === 'low' ? [{ ...notice, reasons: confidence.reasons }] : []
  })
}

export function buildResult(context: ResultContext): Result {
  const { report, clock } = context
  const { settings, info } = report
  const percent = settings.overheadCompensationPercent
  const directions = { overheadCompensationPercent: percent, busy: context.busy }
  const download = report.download === null || context.downloadStartAt === null ? skippedDirection() : downloadResult(report.download, context.downloadStartAt, directions)
  const upload = report.upload === null ? { ...skippedDirection(), confirmedRequests: 0 } : uploadResult(report.upload, directions)
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
    dataUsedBytes: report.dataUsedBytes,
    notices: resultNotices([directionNotices(report.download?.notices, download), directionNotices(report.upload?.notices, upload), report.notices], percent),
  }
}
