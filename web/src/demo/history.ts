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

import type { Bufferbloat, DirectionResult, LoadedLatency, Notice, Result, ResultStatus, UploadResult } from '@/engine/messages'

// The demo's history (frontend.md section 9): the design export's History variants (ui_kits/app/
// History.jsx) the demo panel can put in the page's history, so the demo shows the populated, single,
// empty, unavailable and loading History screens. The populated one holds the kit's eight results over a VPN, newest
// first: label, rates, idle latency and jitter, grade, protocol and status as the kit's rows give
// them, with a steady window of stored cells and loaded-latency samples per measured direction for
// the Result detail, whose increases make the row's grade. The page writes them into its history
// (composables/useHistory.ts), which this module never touches. The single one is a fresh install's
// first result, the kit's 2 Oct office row taken today at 09:14.

/** The panel's History variant: '' leaves the browser's history as it is. */
export type DemoHistory = '' | 'populated' | 'single' | 'empty' | 'unavailable' | 'loading'

export const DEMO_HISTORY_VARIANTS: readonly DemoHistory[] = ['', 'populated', 'single', 'empty', 'unavailable', 'loading']

export function isDemoHistory(value: unknown): value is DemoHistory {
  return DEMO_HISTORY_VARIANTS.includes(value as DemoHistory)
}

interface KitRow {
  /** Local date and time, as the kit shows it. */
  at: [number, number, number, number, number]
  label: string
  down: number | null
  up: number | null
  latencyMs: number
  jitterMs: number
  grade: Bufferbloat['grade'] | null
  /** The increase the grade reads, in milliseconds. */
  increaseMs: number
  lowConfidence: boolean
  protocol: 'HTTP/2' | 'HTTP/1.1'
  status: ResultStatus
}

const ROWS: readonly KitRow[] = [
  { at: [2026, 10, 8, 8, 41], label: 'VPN via 5G', down: 640e3, up: 210e3, latencyMs: 48, jitterMs: 9.4, grade: 'D', increaseMs: 262, lowConfidence: true, protocol: 'HTTP/2', status: 'complete' },
  { at: [2026, 10, 7, 19, 12], label: 'VPN · hotel Wi-Fi', down: 38.4e6, up: 12.1e6, latencyMs: 61, jitterMs: 4.2, grade: 'C', increaseMs: 120, lowConfidence: false, protocol: 'HTTP/1.1', status: 'complete' },
  { at: [2026, 10, 5, 12, 30], label: 'VPN via 5G', down: 84.2e6, up: 21.7e6, latencyMs: 39, jitterMs: 6.8, grade: 'C', increaseMs: 95, lowConfidence: false, protocol: 'HTTP/2', status: 'complete' },
  { at: [2026, 10, 2, 9, 5], label: 'VPN · office', down: 241e6, up: 198e6, latencyMs: 14, jitterMs: 1.9, grade: 'B', increaseMs: 43, lowConfidence: false, protocol: 'HTTP/1.1', status: 'complete' },
  { at: [2026, 9, 29, 22, 47], label: 'VPN via 5G', down: 52.9e6, up: null, latencyMs: 44, jitterMs: 7.1, grade: 'D', increaseMs: 210, lowConfidence: false, protocol: 'HTTP/2', status: 'partial' },
  { at: [2026, 9, 26, 18, 20], label: 'VPN · office', down: 233e6, up: 187e6, latencyMs: 15, jitterMs: 2.2, grade: 'B', increaseMs: 57, lowConfidence: false, protocol: 'HTTP/2', status: 'complete' },
  { at: [2026, 9, 21, 7, 58], label: 'VPN via 5G', down: null, up: null, latencyMs: 41, jitterMs: 5.9, grade: null, increaseMs: 0, lowConfidence: false, protocol: 'HTTP/2', status: 'error' },
  { at: [2026, 9, 17, 13, 14], label: 'VPN · café', down: 19.6e6, up: 4.1e6, latencyMs: 72, jitterMs: 11.3, grade: 'F', increaseMs: 480, lowConfidence: false, protocol: 'HTTP/2', status: 'complete' },
]

/** Seconds a direction ran for; its bytes follow from its rate. */
const DIRECTION_S = 15
/** The steady window: warm-up ends at 9 s, the window runs to the direction's end in 100 ms cells. */
const WARMUP_END_MS = 9000
const CELL_MS = 100
const CELLS = (DIRECTION_S * 1000 - WARMUP_END_MS) / CELL_MS
/** A loaded-latency ping every 250 ms of the window. */
const PING_MS = 250

/** The loaded latency of a direction with this increase over idle: samples around idle plus it. */
function loaded(idleMs: number, jitterMs: number, increaseMs: number, seed: number): LoadedLatency {
  const series = Array.from({ length: (DIRECTION_S * 1000 - WARMUP_END_MS) / PING_MS }, (_, index) => ({
    atMs: WARMUP_END_MS + index * PING_MS,
    rttMs: Math.round((idleMs + increaseMs + jitterMs * Math.sin(seed + index * 0.9)) * 10) / 10,
  }))
  const sorted = series.map((ping) => ping.rttMs).sort((a, b) => a - b)
  const middle = sorted.length / 2
  const medianMs = Math.round((((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2) * 10) / 10
  const p90Ms = sorted[Math.ceil(sorted.length * 0.9) - 1] ?? medianMs
  return { source: 'websocket', samples: series.length, skippedTicks: 0, lost: 0, medianMs, p90Ms, increaseMs: Math.round((medianMs - idleMs) * 10) / 10, series }
}

function direction(bitsPerSecond: number | null, lowConfidence: boolean, latency: LoadedLatency): DirectionResult {
  if (bitsPerSecond === null) {
    return { status: 'error', streams: 1, bytes: 0, events: [{ code: 'error', atMs: 1200, notice: 'requests-failed' }], loadedLatency: { status: 'unavailable', reason: 'no-steady-window', source: 'websocket', samples: 0, skippedTicks: 0, lost: 0 } }
  }
  const perCell = bitsPerSecond / 8 / (1000 / CELL_MS)
  const values = Array.from({ length: CELLS }, (_, index) => Math.round(perCell * (1 + 0.04 * Math.sin(index * 0.7) + 0.02 * Math.cos(index * 2.3))))
  return {
    status: 'measured',
    bitsPerSecond,
    peakBitsPerSecond: Math.round(bitsPerSecond * 1.04),
    uncompensatedBitsPerSecond: bitsPerSecond,
    windowMs: DIRECTION_S * 1000 - WARMUP_END_MS,
    streams: 4,
    plateau: 'no-gain',
    confidence: lowConfidence ? { level: 'low', reasons: ['unstable'] } : { level: 'normal', reasons: [] },
    bytes: Math.round((bitsPerSecond / 8) * DIRECTION_S),
    series: { bucketMs: CELL_MS, firstCellMs: WARMUP_END_MS, warmupEndMs: WARMUP_END_MS, endMs: DIRECTION_S * 1000, values },
    events: [],
    loadedLatency: latency,
  }
}

function notices(row: KitRow): Notice[] {
  if (row.status === 'partial') {
    return [{ code: 'stopped-early', direction: 'upload', coveredMs: 3100 }]
  }
  return row.lowConfidence ? (['download', 'upload'] as const).map((direction) => ({ code: 'low-confidence', direction, reasons: ['unstable'] })) : []
}

function result(row: KitRow, index: number): Result {
  const [year, month, day, hour, minute] = row.at
  // The worse direction's increase is the row's; the other has half of it.
  const both = row.status === 'complete'
  const download = direction(row.down, row.lowConfidence, loaded(row.latencyMs, row.jitterMs, both ? row.increaseMs / 2 : row.increaseMs, index))
  // The partial run was stopped 3.1 s into upload, before its warm-up ended.
  const upload: UploadResult =
    row.status === 'partial'
      ? { status: 'partial', streams: 2, bytes: 2_400_000, events: [{ code: 'cancelled', atMs: 3100 }], confirmedRequests: 2, loadedLatency: { status: 'unavailable', reason: 'no-steady-window', source: 'websocket', samples: 0, skippedTicks: 0, lost: 0 } }
      : { ...direction(row.up, row.lowConfidence, loaded(row.latencyMs, row.jitterMs, row.increaseMs, index + 3)), confirmedRequests: row.up === null ? 0 : 24 }
  const increases = [download, upload].flatMap((part) => (part.loadedLatency !== undefined && 'increaseMs' in part.loadedLatency && part.loadedLatency.increaseMs !== undefined ? [part.loadedLatency.increaseMs] : []))
  return {
    schema: 'bitgauge.result',
    schemaVersion: 1,
    id: `d0000000-0000-4000-8000-00000000000${index + 1}`,
    startedAt: new Date(year, month - 1, day, hour, minute).toISOString(),
    durationMs: row.status === 'complete' ? 34_000 : 12_000,
    status: row.status,
    label: row.label,
    server: { name: 'Basement NAS', version: '1.4.0', epoch: '2026-09-30T08:12:44.000Z' },
    client: { ip: '100.101.4.17', contextLabel: 'VPN', protocol: row.protocol, browser: { name: 'Chrome', major: 130, os: 'Linux' }, timerResolutionMs: 0.1, crossOriginIsolated: true },
    settings: { preset: 'standard', phases: ['idle', 'download', 'upload'], streams: { mode: 'auto', max: 6 }, dataCapBytes: null, overheadCompensationPercent: 0, warmup: 'auto', pingCount: 20 },
    idle: { path: 'websocket', lossPercent: 0, minMs: row.latencyMs - 1, medianMs: row.latencyMs, p90Ms: row.latencyMs + row.jitterMs, jitterMs: row.jitterMs, samples: [row.latencyMs] },
    download,
    upload,
    ...(row.grade === null ? {} : { bufferbloat: { grade: row.grade, basis: upload.bitsPerSecond === undefined ? 'download' : 'download+upload', increaseMs: Math.max(...increases) } }),
    dataUsedBytes: download.bytes + upload.bytes,
    notices: notices(row),
  }
}

/** The kit's row the single variant holds (History.jsx R[3]), and when today it was taken. */
const SINGLE_ROW = 3
const SINGLE_AT = [9, 14] as const

/** The results a variant puts in the history: the kit's eight, the single one at `now`'s day, or none. */
export function demoHistoryResults(variant: 'populated' | 'single' | 'empty', now = new Date()): Result[] {
  if (variant === 'single') {
    const row = ROWS[SINGLE_ROW]
    if (row === undefined) {
      return []
    }
    // Today at 09:14, or now when the day is younger than that.
    const at = new Date(Math.min(now.getTime(), new Date(now.getFullYear(), now.getMonth(), now.getDate(), ...SINGLE_AT).getTime()))
    return [{ ...result(row, SINGLE_ROW), startedAt: at.toISOString() }]
  }
  return variant === 'populated' ? ROWS.map(result) : []
}
