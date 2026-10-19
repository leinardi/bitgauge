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

import type { Bufferbloat, Confidence, Direction, DirectionStatus, IdleResult, LoadedSource, Result } from '@/engine/messages'

// What a share carries (ui/flows.md section 8, security.md section 7): download, upload, idle
// latency, jitter, the loaded-latency increase, the grade, the date and time and the server's
// display name, each number with the qualifiers it has: a direction status other than measured, a
// confidence other than normal, a non-zero overhead compensation, a loaded-latency source other
// than the WebSocket and an increase over idle latency measured on the other path; the label only
// when the user includes it. Picked field by field from the
// result, so the client IP, the note, the browser and the server's URL can never reach the image or
// the text.

export interface ShareRate {
  status: DirectionStatus
  /** The headline, absent without a number. */
  bitsPerSecond: number | null
  /** The confidence other than normal, with its reasons, or null. */
  confidence: { level: Exclude<Confidence['level'], 'normal'>; reasons: Confidence['reasons'] } | null
}

export interface ShareContent {
  /** The result's label when the user includes it and it has one; null otherwise. */
  label: string | null
  startedAt: string
  server: string
  /** A direction the run included, or null when it did not run. */
  download: ShareRate | null
  upload: ShareRate | null
  overheadPercent: number
  idleMs: number | null
  jitterMs: number | null
  resolutionMs: number
  /**
   * The increase the grade reads, with the direction it comes from, that direction's source and the
   * idle path when idle latency ran on the other one.
   */
  loaded: { increaseMs: number; direction: Direction; source: LoadedSource; idleSource: IdleResult['path'] | null } | null
  grade: Bufferbloat['grade'] | null
  /** The one direction the grade reads, or null when it reads both. */
  basis: Direction | null
}

function rate(result: Result, direction: Direction): ShareRate | null {
  const part = result[direction]
  if (part === undefined || !result.settings.phases.includes(direction)) {
    return null
  }
  const confidence = part.confidence
  return {
    status: part.status,
    bitsPerSecond: part.bitsPerSecond ?? null,
    confidence: confidence === undefined || confidence.level === 'normal' ? null : { level: confidence.level, reasons: confidence.reasons },
  }
}

/** The direction whose increase the grade reads: the basis's one, or the worse of both. */
function graded(result: Result, bufferbloat: Bufferbloat): ShareContent['loaded'] {
  const directions: Direction[] = bufferbloat.basis === 'download+upload' ? ['download', 'upload'] : [bufferbloat.basis]
  const measured = directions.flatMap((direction) => {
    const loaded = result[direction]?.loadedLatency
    return loaded === undefined || 'status' in loaded || loaded.increaseMs === undefined
      ? []
      : [{ direction, increaseMs: loaded.increaseMs, source: loaded.source, idleSource: loaded.idleSource ?? null }]
  })
  const worse = measured.reduce<(typeof measured)[number] | null>((found, next) => (found === null || next.increaseMs > found.increaseMs ? next : found), null)
  return worse === null ? null : { increaseMs: bufferbloat.increaseMs, direction: worse.direction, source: worse.source, idleSource: worse.idleSource }
}

export function shareContent(result: Result, includeLabel: boolean): ShareContent {
  const idle = result.idle
  return {
    label: includeLabel && result.label !== '' ? result.label : null,
    startedAt: result.startedAt,
    server: result.server.name,
    download: rate(result, 'download'),
    upload: rate(result, 'upload'),
    overheadPercent: result.settings.overheadCompensationPercent,
    idleMs: idle?.medianMs ?? null,
    jitterMs: idle?.jitterMs ?? null,
    resolutionMs: result.client.timerResolutionMs,
    loaded: result.bufferbloat === undefined ? null : graded(result, result.bufferbloat),
    grade: result.bufferbloat?.grade ?? null,
    basis: result.bufferbloat === undefined || result.bufferbloat.basis === 'download+upload' ? null : result.bufferbloat.basis,
  }
}
