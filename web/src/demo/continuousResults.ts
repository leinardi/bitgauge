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

import type { DemoResponsiveness } from '@/demo/responsiveness'
import type { DirectionResult, LoadedLatency, Notice, Responsiveness, Result } from '@/engine/messages'
import { bufferbloat } from '@/engine/latency/grade'
import { scores } from '@/engine/result/scores'

// The demo's Continuous results (frontend.md section 9): the kit's Result detail of a Continuous
// run (ResultDetail.jsx), which the panel's Kind and Continuous length open. They are fixtures, not
// played runs, since 9 days cannot be played: a 2 h overnight run with a 2 h run length, saved in
// 1 min cells, and a 9-day run without one, longer than the 7-day long ring, so only its last 7
// days were saved, in 10 min cells. Each is a valid result (measurement.md sections 15 and 17),
// graded and scored by the engine's own rules, with path B as the panel's Responsiveness chooses.

export type ContinuousLength = '2h' | '9d'

export const CONTINUOUS_LENGTHS: readonly ContinuousLength[] = ['2h', '9d']

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
/** The kit's warm-up end and its download's run-wide numbers, on the 921 Mbit/s LAN. */
const WARMUP_END_MS = 6500
const RATE = { average: 921e6, peak: 936e6, min: 702e6, max: 941e6 }
const IDLE_MS = 3.1
/** The 7-day long ring: past it only the last 7 days are saved (measurement.md section 15). */
const LONG_RING_MS = 7 * DAY_MS
/** The kit's path B, one round trip per 43.5 ms under load, over the run's 23 950 probes. */
const TM95_MS = 43.5
const PROBES = 23_950

const FIXTURES: Record<ContinuousLength, { id: string; label: string; note: string; endMs: number; cellMs: number; runLengthMs?: number }> = {
  '2h': { id: 'd0000000-0000-4000-8000-0000000000c2', label: 'Overnight check', note: 'Checking whether the evening dip comes back after midnight.', endMs: 2 * HOUR_MS, cellMs: MINUTE_MS, runLengthMs: 2 * HOUR_MS },
  '9d': { id: 'd0000000-0000-4000-8000-0000000000c9', label: 'Week-long soak', note: 'Left running while away, to catch any drop over the week.', endMs: 9 * DAY_MS + 4 * HOUR_MS + 12 * MINUTE_MS, cellMs: 10 * MINUTE_MS },
}

/** The id of the fixture `length` opens. */
export function continuousFixtureId(length: ContinuousLength): string {
  return FIXTURES[length].id
}

/** The download's path B for the panel's Responsiveness; few-samples starves the upload, which Continuous does not run. */
function pathB(option: DemoResponsiveness): Responsiveness {
  switch (option) {
    case 'needs-h2':
      return { state: 'unavailable_h1', protocol: 'http/1.1', samples: 0 }
    case 'not-reported':
      return { state: 'unavailable_h1', protocol: '', samples: 0 }
    default:
      return { state: option === 'uncertain' ? 'uncertain' : 'measured', protocol: 'h2', samples: PROBES, rpm: Math.round(MINUTE_MS / TM95_MS), tm95Ms: TM95_MS, trimmed: Math.floor(0.05 * 13), totalMedianMs: 47 }
  }
}

/** The last hour's loaded latency: a sample a minute around the kit's 18 ms median. */
function loadedLatency(endMs: number): LoadedLatency {
  const series = Array.from({ length: 60 }, (_, index) => ({ atMs: endMs - HOUR_MS + index * MINUTE_MS + MINUTE_MS / 2, rttMs: Math.round((18 + 3 * Math.sin(index * 0.7)) * 10) / 10 }))
  return { source: 'websocket', samples: 36_000, skippedTicks: 0, lost: 0, medianMs: 18, p90Ms: 24, increaseMs: Math.round((18 - IDLE_MS) * 10) / 10, series }
}

/** The fixture `length`: its run, its saved cells, and the panel's path B case. */
export function continuousFixture(length: ContinuousLength, responsiveness: DemoResponsiveness = 'ok'): Result {
  const { id, label, note, endMs, cellMs, runLengthMs } = FIXTURES[length]
  // As the engine saves it: from the warm-up end, unless the long ring dropped its first closed cells.
  const dropped = Math.max(0, Math.floor((endMs - WARMUP_END_MS) / cellMs) - Math.floor(LONG_RING_MS / cellMs))
  const firstCellMs = WARMUP_END_MS + dropped * cellMs
  const values: number[] = []
  const knownMs: number[] = []
  for (let from = firstCellMs, index = 0; from < endMs; from += cellMs, index += 1) {
    const known = Math.min(cellMs, endMs - from)
    knownMs.push(known)
    values.push(Math.round(((RATE.average * (1 + 0.012 * Math.sin(index * 0.37))) / 8) * (known / 1000)))
  }
  const bytes = Math.round((RATE.average / 8) * ((endMs - WARMUP_END_MS) / 1000))
  const notices: Notice[] = []
  for (let threshold = 1e9; threshold <= bytes; threshold *= 10) {
    notices.push({ code: 'data-used', bytes: threshold })
  }
  const download: DirectionResult = {
    status: 'measured',
    bitsPerSecond: RATE.average,
    peakBitsPerSecond: RATE.peak,
    uncompensatedBitsPerSecond: RATE.average,
    minBitsPerSecond: RATE.min,
    maxBitsPerSecond: RATE.max,
    windowMs: endMs - WARMUP_END_MS,
    streams: 6,
    plateau: 'cap',
    confidence: { level: 'normal', reasons: [] },
    bytes,
    series: { bucketMs: cellMs, firstCellMs, warmupEndMs: WARMUP_END_MS, endMs, values, knownMs },
    // Without a run length, the run ended when it was stopped.
    events: runLengthMs === undefined ? [{ code: 'cancelled', atMs: endMs }] : [],
    loadedLatency: loadedLatency(endMs),
    responsiveness: pathB(responsiveness),
  }
  const idle = { path: 'websocket' as const, lossPercent: 0, minMs: 2.8, medianMs: IDLE_MS, p90Ms: 3.6, jitterMs: 0.3, samples: [3.1, 2.9, 3.4, 3.1, 2.8, 3.2, 3.6, 3.0, 3.1, 3.3, 2.9, 3.1, 3.5, 3.0, 3.2, 3.1, 2.9, 3.4, 3.0, 3.1] }
  const grade = bufferbloat(download.loadedLatency, undefined, true)
  return {
    schema: 'bitgauge.result',
    schemaVersion: 1,
    id,
    startedAt: '2026-10-07T23:00:04.000Z',
    durationMs: endMs + 2400,
    status: 'complete',
    label,
    note,
    server: { name: 'Basement NAS', version: '1.4.0', epoch: '2026-09-30T08:12:44.000Z' },
    client: { ip: '192.168.1.42', contextLabel: 'LAN', protocol: 'HTTP/2', browser: { name: 'Firefox', major: 131, os: 'Linux' }, timerResolutionMs: 0.1, crossOriginIsolated: true },
    settings: {
      preset: 'continuous',
      phases: ['idle', 'download', 'upload'],
      streams: { mode: 'auto', max: 6 },
      download: { minMs: null, maxMs: null },
      upload: { minMs: null, maxMs: null },
      continuousDirection: 'download',
      ...(runLengthMs === undefined ? {} : { runLengthMs }),
      dataCapBytes: null,
      overheadCompensationPercent: 0,
      warmup: 'auto',
      pingCount: 20,
    },
    idle,
    download,
    upload: { status: 'skipped', streams: 0, bytes: 0, events: [], confirmedRequests: 0 },
    ...(grade === undefined ? {} : { bufferbloat: grade }),
    scores: scores({ idle, bufferbloat: grade, download }),
    dataUsedBytes: bytes,
    notices,
  }
}
