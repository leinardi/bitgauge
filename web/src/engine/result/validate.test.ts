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

import type { Notice, Result, Scores } from '@/engine/messages'
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
  it('accepts a result without the optional fields', () => {
    expect(validateResult(VALID)).toEqual([])
  })

  it('rejects a field this schema version does not define, wherever it is', () => {
    expect(validateResult(changed((result) => Object.assign(result.settings, { liveTiers: 4 })))).toEqual(['result.settings.liveTiers: not a field of this schema version'])
    expect(validateResult(changed((result) => Object.assign(result.download ?? {}, { medianBitsPerSecond: 1 })))).toEqual([
      'result.download.medianBitsPerSecond: not a field of this schema version',
    ])
  })

  it('accepts the Continuous fields, and a result without them', () => {
    const continuous = changed((result) => {
      Object.assign(result.settings, { preset: 'continuous', continuousDirection: 'download', runLengthMs: 3_600_000, download: { minMs: null, maxMs: null }, upload: { minMs: null, maxMs: null } })
      Object.assign(result.download ?? {}, { minBitsPerSecond: 80_000_000, maxBitsPerSecond: 97_000_000 })
      Object.assign(result.download?.series ?? {}, { knownMs: [100, 0] })
      result.notices.push({ code: 'data-used', bytes: 1e9 })
    })
    expect(validateResult(continuous)).toEqual([])
    expect(validateResult(VALID)).toEqual([])
  })

  it('rejects Continuous fields outside their shape', () => {
    const halfBounded = changed((result) => Object.assign(result.settings, { download: { minMs: null, maxMs: 20_000 } }))
    expect(validateResult(halfBounded)).toEqual(['result.settings.download.maxMs: not one of null'])
    expect(validateResult(changed((result) => Object.assign(result.settings, { continuousDirection: 'both' })))).toEqual(['result.settings.continuousDirection: not one of download, upload'])
    expect(validateResult(changed((result) => result.notices.push({ code: 'data-used' } as Notice)))).toEqual(['result.notices[2].bytes: missing'])
  })

  it('accepts the loaded latency and bufferbloat, and a result without them', () => {
    const measured = {
      source: 'websocket',
      samples: 31,
      skippedTicks: 0,
      lost: 0,
      medianMs: 132,
      p90Ms: 151,
      increaseMs: 81,
      idleSource: 'websocket',
      series: [{ atMs: 1310, rttMs: 128.4 }],
    }
    const withLoaded = changed((result) => {
      Object.assign(result.download ?? {}, { loadedLatency: measured })
      Object.assign(result.upload ?? {}, { loadedLatency: { status: 'unavailable', reason: 'insufficient-samples', source: 'http-h2', samples: 4, skippedTicks: 0, lost: 0 } })
      result['bufferbloat'] = { grade: 'C', basis: 'download', increaseMs: 81 }
    })
    expect(validateResult(withLoaded)).toEqual([])
    expect(validateResult(VALID)).toEqual([])
  })

  it('accepts the responsiveness in each of its states, and a result without it', () => {
    const measured = { state: 'measured', protocol: 'h2', samples: 31, rpm: 1765, tm95Ms: 34, trimmed: 0, totalMedianMs: 36.5 }
    const withPathB = changed((result) => {
      Object.assign(result.download ?? {}, { responsiveness: measured })
      Object.assign(result.upload ?? {}, { responsiveness: { state: 'unavailable_h1', protocol: '', samples: 0 } })
    })
    expect(validateResult(withPathB)).toEqual([])
    const uncertain = changed((result) => Object.assign(result.download ?? {}, { responsiveness: { ...measured, state: 'uncertain', protocol: 'h3', samples: 7 } }))
    expect(validateResult(uncertain)).toEqual([])
    const insufficient = changed((result) => Object.assign(result.download ?? {}, { responsiveness: { state: 'unavailable_insufficient', protocol: 'h2', samples: 3 } }))
    expect(validateResult(insufficient)).toEqual([])
    expect(validateResult(VALID)).toEqual([])
  })

  it('rejects a responsiveness outside its shape', () => {
    const numbers = { rpm: 1765, tm95Ms: 34, trimmed: 0, totalMedianMs: 36.5 }
    const unavailableWithNumbers = changed((result) => Object.assign(result.download ?? {}, { responsiveness: { state: 'unavailable_h1', protocol: 'http/1.1', samples: 0, ...numbers } }))
    expect(validateResult(unavailableWithNumbers)).not.toEqual([])
    const measuredWithout = changed((result) => Object.assign(result.download ?? {}, { responsiveness: { state: 'measured', protocol: 'h2', samples: 12 } }))
    expect(validateResult(measuredWithout)).not.toEqual([])
    const unknownState = changed((result) => Object.assign(result.download ?? {}, { responsiveness: { state: 'unknown', protocol: 'h2', samples: 0 } }))
    expect(validateResult(unknownState)).not.toEqual([])
  })

  it('accepts the scores, scored or naming what they miss, and a result without them', () => {
    const scored = {
      basis: 'download+upload',
      packetLoss: 'not-measured',
      streaming: { points: 20, band: 'average' },
      gaming: { points: 0, band: 'bad' },
      rtc: { points: 10, band: 'poor' },
    }
    expect(validateResult(changed((result) => (result['scores'] = scored as Scores)))).toEqual([])
    const missing = { ...scored, basis: 'none', streaming: { missing: ['idle-latency', 'loaded-latency', 'download'] }, gaming: { missing: ['idle-latency', 'loaded-latency'] } }
    expect(validateResult(changed((result) => (result['scores'] = missing as Scores)))).toEqual([])
    expect(validateResult(VALID)).toEqual([])
  })

  it('rejects scores outside their shape', () => {
    const scored = { basis: 'download', packetLoss: 'not-measured', streaming: { points: 20, band: 'average' }, gaming: { points: 0, band: 'bad' }, rtc: { points: 10, band: 'poor' } }
    const withScores = (scores: object) => changed((result) => (result['scores'] = scores as Scores))
    expect(validateResult(withScores({ ...scored, packetLoss: 0 }))).toEqual(['result.scores.packetLoss: not one of not-measured'])
    expect(validateResult(withScores({ ...scored, basis: 'both' }))).toEqual(['result.scores.basis: not one of download+upload, download, upload, none'])
    expect(validateResult(withScores({ ...scored, rtc: { points: 10, band: 'poor', missing: ['jitter'] } }))).not.toEqual([])
    expect(validateResult(withScores({ ...scored, gaming: { points: -5, band: 'bad' } }))).not.toEqual([])
    expect(validateResult(withScores({ ...scored, gaming: { missing: ['packet-loss'] } }))).not.toEqual([])
    const { rtc: _rtc, ...withoutRtc } = scored
    expect(validateResult(withScores(withoutRtc))).toEqual(['result.scores.rtc: missing'])
  })

  it('accepts the duration bounds in the settings, and a result without them', () => {
    const withBounds = changed((result) => Object.assign(result.settings, { download: { minMs: 10_000, maxMs: 20_000 }, upload: { minMs: 15_000, maxMs: 25_000 } }))
    expect(validateResult(withBounds)).toEqual([])
    expect(validateResult(changed((result) => Object.assign(result.settings, { download: { minMs: 10_000 } })))).toEqual(['result.settings.download.maxMs: missing'])
  })

  it('accepts the note the history writes, and a result without it', () => {
    expect(validateResult(changed((result) => (result.note = 'after the router swap')))).toEqual([])
    expect(validateResult(changed((result) => (result.note = '')))).toEqual([])
    expect(validateResult(changed((result) => (result['note'] = 3 as unknown as string)))).toEqual(['result.note: not a string'])
  })

  it('rejects a loaded latency or bufferbloat outside their shapes', () => {
    expect(validateResult(changed((result) => Object.assign(result.download ?? {}, { loadedLatency: { status: 'unavailable', reason: 'slow', samples: 0, skippedTicks: 0, lost: 0 } })))).toEqual([
      'result.download.loadedLatency.reason: not one of no-steady-window, insufficient-samples, reservation-broken, no-probe-path',
    ])
    expect(validateResult(changed((result) => (result['bufferbloat'] = { grade: 'E' as 'A', basis: 'download', increaseMs: 1 })))).toEqual([
      'result.bufferbloat.grade: not one of A+, A, B, C, D, F',
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
    expect(validateResult(changed((result) => result.notices.push({ code: 'latency-spike' } as never)))).toEqual(['result.notices[2].code: unknown'])
    expect(validateResult(changed((result) => result.notices.push({ code: 'stream-limit', direction: 'upload' } as never)))).toEqual([
      'result.notices[2].streams: missing',
    ])
    expect(validateResult(changed((result) => result.download?.events.push({ code: 'error', atMs: 1, notice: 'oops' } as never)))).toHaveLength(1)
  })

  it('accepts a rate limit: its notice, and the error events three failures end on', () => {
    const limited = changed((result) => {
      result.notices.push({ code: 'rate-limited', direction: 'download', reason: 'table-full', retried: false })
      result.download?.events.push({ code: 'error', atMs: 2300, notice: 'server-busy' }, { code: 'error', atMs: 2400, notice: 'rate-limited' })
    })
    expect(validateResult(limited)).toEqual([])
  })

  it('rejects a rate-limit notice outside its shape', () => {
    expect(validateResult(changed((result) => result.notices.push({ code: 'rate-limited', direction: 'download', reason: 'other', retried: true } as never)))).toEqual([
      'result.notices[2].reason: not one of rate, table-full',
    ])
    expect(validateResult(changed((result) => result.notices.push({ code: 'rate-limited', direction: 'upload', reason: 'rate' } as never)))).toEqual([
      'result.notices[2].retried: missing',
    ])
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
