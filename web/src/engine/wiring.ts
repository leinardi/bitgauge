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

import type { BrowserIdentity, Info, ResourceTiming } from '@/engine/types'

// The pure parts of the browser wiring (clock.ts, transport.ts, worker.ts): what they compute
// from what the browser hands them, without touching a browser global, so tests run them on
// plain values.

const MIB = 1024 * 1024

/** The random buffer the upload body repeats (measurement.md section 7.2). */
export const SEED_BYTES = MIB
/** crypto.getRandomValues fills at most 64 KiB per call. */
export const RANDOM_CALL_BYTES = 64 * 1024

/**
 * The upload body: one master Blob grown by doubling from a 1 MiB random buffer, filled once,
 * sent as `slice(0, N)`, so memory stays at about the largest request size.
 */
export class UploadBody {
  private master: Blob | null = null
  private readonly fill: (chunk: Uint8Array) => void

  /** `fill` writes random bytes into a buffer of at most 64 KiB. */
  constructor(fill: (chunk: Uint8Array) => void) {
    this.fill = fill
  }

  get size(): number {
    return this.master?.size ?? 0
  }

  slice(bytes: number): Blob {
    let master = this.master ?? new Blob([this.seed()])
    while (master.size < bytes) {
      master = new Blob([master, master])
    }
    this.master = master
    return master.slice(0, bytes)
  }

  private seed(): Uint8Array<ArrayBuffer> {
    const seed = new Uint8Array(SEED_BYTES)
    for (let offset = 0; offset < SEED_BYTES; offset += RANDOM_CALL_BYTES) {
      this.fill(seed.subarray(offset, offset + RANDOM_CALL_BYTES))
    }
    return seed
  }
}

/** The fields of a Resource Timing entry the engine reads. */
export interface TimingEntry extends ResourceTiming {
  name: string
  startTime: number
}

/**
 * The entry of the request sent at `sentAt` to `url`: the earliest one with that name that
 * started at or after the send, since requests to one URL repeat. Null when there is none.
 */
export function timingFor(entries: readonly TimingEntry[], url: string, sentAt: number): ResourceTiming | null {
  let found: TimingEntry | null = null
  for (const entry of entries) {
    if (entry.name === url && entry.startTime >= sentAt && (found === null || entry.startTime < found.startTime)) {
      found = entry
    }
  }
  if (found === null) {
    return null
  }
  // A browser that does not report the protocol leaves it empty, which the engine reads as not
  // reported (edge-cases.md section 17); one without the field at all is read the same way.
  const protocol: unknown = found.nextHopProtocol
  return {
    nextHopProtocol: typeof protocol === 'string' ? protocol : '',
    requestStart: found.requestStart,
    responseStart: found.responseStart,
    responseEnd: found.responseEnd,
    ...optionalTiming(found),
  }
}

/** The entry's fetch and connect fields that the browser exposes; a missing one stays absent. */
function optionalTiming(entry: TimingEntry): Pick<ResourceTiming, 'fetchStart' | 'connectStart' | 'connectEnd'> {
  const fields: Pick<ResourceTiming, 'fetchStart' | 'connectStart' | 'connectEnd'> = {}
  for (const name of ['fetchStart', 'connectStart', 'connectEnd'] as const) {
    const value: unknown = entry[name]
    if (typeof value === 'number') {
      fields[name] = value
    }
  }
  return fields
}

/** How long a request that has ended waits for its timing entry: the browser may add it later. */
export const TIMING_WAIT_MS = 50

/**
 * Finds a request's timing entry once the request has ended. The browser adds the entry on its
 * own schedule, possibly after the response; `added(ms)` resolves true when any entry is added
 * within `ms`, false when none is. A browser that missed the bound once is not waited for again
 * until an entry is found at once, so one that never reports timing costs a single wait.
 */
export class TimingWaiter {
  private patient = true

  async find(lookup: () => ResourceTiming | null, added: (ms: number) => Promise<boolean>, now: () => number): Promise<ResourceTiming | null> {
    const deadline = now() + (this.patient ? TIMING_WAIT_MS : 0)
    for (;;) {
      const found = lookup()
      const left = deadline - now()
      if (found !== null || left <= 0 || !(await added(left))) {
        const entry = found ?? lookup()
        this.patient = entry !== null
        return entry
      }
    }
  }
}

/** A pong frame of wire-protocol.md section 6, or null for anything else. */
export function pong(data: unknown): { seq: number; t: number } | null {
  if (typeof data !== 'string') {
    return null
  }
  let frame: unknown
  try {
    frame = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof frame !== 'object' || frame === null) {
    return null
  }
  const { type, seq, t } = frame as Record<string, unknown>
  return type === 'pong' && typeof seq === 'number' && Number.isSafeInteger(seq) && typeof t === 'number' && Number.isFinite(t) ? { seq, t } : null
}

/**
 * The resolution of a clock from consecutive differences of its readings: their median, since a
 * coarsened clock may add jitter to each step; 0 without a difference.
 */
export function resolutionOf(deltas: readonly number[]): number {
  const steps = deltas.filter((delta) => delta > 0).sort((a, b) => a - b)
  if (steps.length === 0) {
    return 0
  }
  const middle = steps[Math.floor(steps.length / 2)] ?? 0
  // Rounded at the nanosecond: the differences of fractional readings carry float noise.
  return Math.round(middle * 1e6) / 1e6
}

const BROWSERS: readonly [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/\b(?:OPR|Opera)\/(\d+)/, 'Opera'],
  [/\bSamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/\bFxiOS\/(\d+)/, 'Firefox'],
  [/\bFirefox\/(\d+)/, 'Firefox'],
  [/\bCriOS\/(\d+)/, 'Chrome'],
  [/\bChrom(?:e|ium)\/(\d+)/, 'Chrome'],
  [/\bVersion\/(\d+)(?:\.\d+)*(?: Mobile\/\w+)? Safari\//, 'Safari'],
]

const SYSTEMS: readonly [RegExp, string][] = [
  [/\b(?:iPhone|iPad|iPod)\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
]

/**
 * The browser's family, major version and operating system (measurement.md section 17); only
 * these leave the function, never the user-agent string. Unknown parts are `unknown` and 0.
 */
export function browserIdentity(userAgent: string): BrowserIdentity {
  let name = 'unknown'
  let major = 0
  for (const [pattern, family] of BROWSERS) {
    const match = pattern.exec(userAgent)
    if (match !== null) {
      name = family
      major = Number(match[1])
      break
    }
  }
  const os = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'unknown'
  return { name, major, os }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/**
 * The GET /info answer the run relies on: the epoch and the limits are checked, since every phase
 * reads them; anything else malformed throws, as an unreachable server does.
 */
export function checkedInfo(value: unknown): Info {
  const server = record(record(value)?.['server'])
  const limits = record(record(value)?.['limits'])
  const client = record(record(value)?.['client'])
  const numbers = ['maxDownloadBytes', 'maxUploadBytes', 'maxStreamsPerClient', 'uploadLifetimeMs', 'bucketMs']
  if (
    typeof server?.['epoch'] !== 'string' ||
    typeof server['name'] !== 'string' ||
    typeof server['version'] !== 'string' ||
    typeof client?.['ip'] !== 'string' ||
    limits === null ||
    !numbers.every((key) => typeof limits[key] === 'number' && Number.isFinite(limits[key]))
  ) {
    throw new TypeError('GET /api/v1/info answered without the epoch, the client or the limits')
  }
  return value as Info
}

/** An absolute URL under the base path: `/`, `/speed` and `/speed/` all end in one slash. */
export function apiUrl(origin: string, basePath: string, path: string): string {
  const base = `/${basePath.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')
  return new URL(`${base}${path}`, origin).href
}

/** The WebSocket URL of an http or https URL. */
export function webSocketUrl(url: string): string {
  return url.replace(/^http/, 'ws')
}
