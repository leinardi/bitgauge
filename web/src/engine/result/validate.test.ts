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

// The structural check of the result object: what passes, and each way a value fails.

import { describe, expect, it } from 'vitest'

import type { Result } from '@/engine/messages'
import { validateResult } from '@/engine/result/validate'

const VALID: Result = {
  schema: 'bitgauge.result',
  schemaVersion: 1,
  id: '0b6f2c1e-8a4d-4f3b-9c2a-1d2e3f4a5b6c',
  startedAt: '2026-10-08T21:04:05.123Z',
  durationMs: 41_250,
  status: 'complete',
  label: 'VPN',
  server: { name: 'home', version: '0.1.0', epoch: 'e' },
  client: {
    ip: '10.8.0.2',
    contextLabel: 'VPN',
    protocol: 'h2',
    browser: { name: 'Firefox', major: 131, os: 'Linux' },
    timerResolutionMs: 0.1,
    crossOriginIsolated: false,
  },
  settings: {
    preset: 'standard',
    phases: ['idle', 'download', 'upload'],
    streams: { mode: 'auto', max: 6 },
    dataCapBytes: null,
    overheadCompensationPercent: 0,
    warmup: 'auto',
    pingCount: 20,
  },
  idle: { path: 'websocket', lossPercent: 0, minMs: 48.2, medianMs: 51, p90Ms: 55.4, jitterMs: 1.9, samples: [51, 49.8] },
  download: {
    status: 'measured',
    bitsPerSecond: 94_100_000,
    peakBitsPerSecond: 96_800_000,
    uncompensatedBitsPerSecond: 94_100_000,
    windowMs: 5600,
    streams: 2,
    plateau: 'no-gain',
    confidence: { level: 'normal', reasons: [] },
    bytes: 118_000_000,
    series: { bucketMs: 100, firstCellMs: 4300, warmupEndMs: 4300, endMs: 9900, values: [1000, null] },
    events: [{ code: 'extended', atMs: 10_000 }],
  },
  upload: {
    status: 'skipped',
    streams: 0,
    bytes: 0,
    events: [],
    confirmedRequests: 0,
  },
  dataUsedBytes: 118_000_000,
  notices: [{ code: 'low-confidence', direction: 'download', reasons: ['unstable'] }, { code: 'page-hidden' }],
}

/** A copy of the valid result with `change` applied. */
function changed(change: (result: Record<string, unknown> & Result) => void): unknown {
  const copy = structuredClone(VALID) as Record<string, unknown> & Result
  change(copy)
  return copy
}

describe('the result validator', () => {
  it('accepts a v0.1 result', () => {
    expect(validateResult(VALID)).toEqual([])
  })

  it('rejects a field of a later version, wherever it is', () => {
    expect(validateResult(changed((result) => (result['bufferbloat'] = { grade: 'C' })))).toEqual(['result.bufferbloat: not a field of this schema version'])
    expect(validateResult(changed((result) => Object.assign(result.download ?? {}, { loadedLatency: {} })))).toEqual([
      'result.download.loadedLatency: not a field of this schema version',
    ])
  })

  it('names a missing field and a wrong type by their path', () => {
    expect(validateResult(changed((result) => delete (result as Partial<Result>).dataUsedBytes))).toEqual(['result.dataUsedBytes: missing'])
    expect(validateResult(changed((result) => (result.client.crossOriginIsolated = 'yes' as unknown as boolean)))).toEqual([
      'result.client.crossOriginIsolated: not a boolean',
    ])
    expect(validateResult(changed((result) => (result.startedAt = 'yesterday')))).toEqual(['result.startedAt: not an ISO 8601 instant'])
    expect(validateResult(changed((result) => (result.schemaVersion = 2 as 1)))).toEqual(['result.schemaVersion: not one of 1'])
  })

  it('rejects an unknown notice or event, and a notice without its values', () => {
    expect(validateResult(changed((result) => result.notices.push({ code: 'data-used' } as never)))).toEqual(['result.notices[2].code: unknown'])
    expect(validateResult(changed((result) => result.notices.push({ code: 'stream-limit', direction: 'upload' } as never)))).toEqual([
      'result.notices[2].streams: missing',
    ])
    expect(validateResult(changed((result) => result.download?.events.push({ code: 'error', atMs: 1, notice: 'oops' } as never)))).toHaveLength(1)
  })

  it('rejects a series of more than 2000 points, and a negative or non-finite number', () => {
    const long = changed((result) => {
      if (result.download?.series !== undefined) {
        result.download.series.values = Array.from({ length: 2001 }, () => 1)
      }
    })
    expect(validateResult(long)).toEqual(['result.download.series.values: more than 2000 entries'])
    expect(validateResult(changed((result) => (result.dataUsedBytes = -1)))).toHaveLength(1)
    expect(validateResult(changed((result) => (result.durationMs = Number.NaN)))).toHaveLength(1)
  })

  it('rejects what is not an object at all', () => {
    expect(validateResult(null)).toEqual(['result: not an object'])
    expect(validateResult([])).toEqual(['result: not an object'])
  })
})
