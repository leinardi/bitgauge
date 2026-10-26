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

// @vitest-environment jsdom

// The result summary of ui/i18n-a11y.md section 2.7 for fixture results: the order, the qualifiers,
// the directions the run left out and the notices by title.

import { describe, expect, it } from 'vitest'

import { phaseAnnouncements, resultSummary } from '@/components/a11y/announce'
import type { Wording } from '@/components/test/wording'
import { createAppI18n } from '@/i18n'
import { continuousResultSettings } from '@/test/continuous'
import { resultFixture } from '@/test/fixtures'

const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }

describe('the result summary', () => {
  it('reads a partial run with its qualifiers and notices, in the order of section 2.7', () => {
    const base = resultFixture()
    const result = resultFixture({
      status: 'partial',
      download: { ...base.download!, confidence: { level: 'low', reasons: ['unstable', 'insufficient-samples'] } },
      upload: { ...base.upload!, status: 'partial', confidence: { level: 'cpu-bound', reasons: [] } },
      idle: { path: 'http', lossPercent: 0, samples: [] },
      dataUsedBytes: 512,
      notices: [
        { code: 'stopped-early', direction: 'upload', coveredMs: 4000 },
        { code: 'stream-limit', direction: 'download', streams: 1 },
      ],
    })
    expect(resultSummary(result, 'bytes', wording)).toBe(
      'Partial result: the test was stopped early. ' +
        'Download 76.5 megabytes per second, low confidence: unstable and insufficient samples. ' +
        'Upload 54.8 megabytes per second, partial, stopped early, limited by this device\'s CPU. ' +
        'Idle latency unavailable. Data used 512 bytes. ' +
        'Notices: Partial — stopped early · upload based on a 4.0\u00a0s steady window and Server stream limit — 1 stream.',
    )
  })

  it('says what the tiles show for a run stopped in idle latency: its stop notice, and no data used', () => {
    const result = resultFixture({
      status: 'partial',
      idle: { path: 'http', lossPercent: 0, samples: [] },
      download: undefined,
      upload: undefined,
      dataUsedBytes: 0,
      notices: [],
    })
    const summary = resultSummary(result, 'bits', wording, { pings: 4, count: 20 })
    expect(summary).toContain('Notice: Test cancelled during latency.')
    expect(summary).not.toContain('Data used')
    // With data used, the line is read; without the pings, no stop notice is known.
    const used = resultSummary({ ...result, dataUsedBytes: 512 }, 'bits', wording)
    expect(used).toContain('Data used 512 bytes.')
    expect(used).not.toContain('Test cancelled')
  })

  it('leaves out what the run left out, and says what had no number', () => {
    const base = resultFixture()
    const result = resultFixture({
      status: 'error',
      settings: { ...base.settings, phases: ['download'] },
      idle: undefined,
      download: { status: 'insufficient-data', streams: 1, bytes: 10, events: [] },
      notices: [{ code: 'network-changed' }],
    })
    expect(resultSummary(result, 'bits', wording)).toBe('Test failed. The phases that finished before the error are kept. Download: insufficient data. Data used 1.3 gigabytes. Notice: Network changed.')
  })

  it('says the grade in letter and words with the increase it rests on, after idle latency', () => {
    const result = resultFixture({ bufferbloat: { grade: 'C', basis: 'download+upload', increaseMs: 81.2 } })
    expect(resultSummary(result, 'bits', wording)).toBe(
      'Test complete. Download 612 megabits per second. Upload 438 megabits per second. Idle latency 3.1 milliseconds, jitter 0.4 milliseconds. ' +
        'Bufferbloat grade C, moderate bufferbloat, plus 81 milliseconds under load. Data used 1.3 gigabytes.',
    )
  })

  it('says less than the timer resolution for a latency below it', () => {
    const base = resultFixture()
    const result = resultFixture({ client: { ...base.client, timerResolutionMs: 1 }, idle: { ...base.idle!, medianMs: 0.5, jitterMs: 0 } })
    expect(resultSummary(result, 'bits', wording)).toContain('Idle latency less than 1 millisecond, jitter less than 1 millisecond.')
  })

  it('reads the HTTP loaded responsiveness and the quality scores after the grade, before data used', () => {
    const base = resultFixture()
    const result = resultFixture({
      download: { ...base.download!, responsiveness: { state: 'measured', protocol: 'h2', samples: 40, rpm: 412, tm95Ms: 145.6, trimmed: 2, totalMedianMs: 150 } },
      upload: { ...base.upload!, responsiveness: { state: 'unavailable_insufficient', protocol: 'h2', samples: 3 } },
      bufferbloat: { grade: 'C', basis: 'download', increaseMs: 81.2 },
      scores: { basis: 'download', packetLoss: 'not-measured', streaming: { points: 50, band: 'average' }, gaming: { points: 5, band: 'bad' }, rtc: { missing: ['loaded-latency'] } },
    })
    expect(resultSummary(result, 'bits', wording)).toBe(
      'Test complete. Download 612 megabits per second. Upload 438 megabits per second. Idle latency 3.1 milliseconds, jitter 0.4 milliseconds. ' +
        'Bufferbloat grade C, moderate bufferbloat, plus 81 milliseconds under load. ' +
        'HTTP loaded responsiveness, connection sharing not verifiable, over HTTP/2: download 412 round trips per minute, measured; upload unavailable, not enough samples. ' +
        'Quality scores, download only, an upper bound since packet loss is not measured: streaming average, gaming bad, video calls needs loaded latency. ' +
        'Data used 1.3 gigabytes.',
    )
  })

  it('reads an unavailable responsiveness in words, without a number', () => {
    const base = resultFixture()
    const h1 = (protocol: string) => ({ state: 'unavailable_h1' as const, protocol, samples: 0 })
    const over = (protocol: string) => resultFixture({ download: { ...base.download!, responsiveness: h1(protocol) }, upload: { ...base.upload!, responsiveness: h1(protocol) } })
    expect(resultSummary(over('http/1.1'), 'bits', wording)).toContain(
      'HTTP loaded responsiveness, connection sharing not verifiable, over HTTP/1.1: download unavailable, needs HTTP/2 or HTTP/3 at the reverse proxy; upload unavailable, needs HTTP/2 or HTTP/3 at the reverse proxy.',
    )
    expect(resultSummary(over(''), 'bits', wording)).toContain(
      'over a protocol not reported: download unavailable, protocol not reported — treated as HTTP/1.1; upload unavailable, protocol not reported — treated as HTTP/1.1.',
    )
    // A stopped run's summary reads them too, as its Test screen state shows them.
    expect(resultSummary({ ...over('http/1.1'), status: 'partial' }, 'bits', wording)).toContain('HTTP loaded responsiveness, connection sharing not verifiable, over HTTP/1.1')
  })
})

describe('a Continuous run', () => {
  const pending = { state: 'pending' } as const
  const phases = (download: 'pending' | 'started') => ({ info: { state: 'finished' as const }, idle: { state: 'finished' as const }, download: download === 'pending' ? pending : { state: 'started' as const }, upload: pending })

  it('announces its direction as running', () => {
    expect(phaseAnnouncements(phases('pending'), phases('started'), 'bits', wording, true)).toEqual(['Continuous download running.'])
    expect(phaseAnnouncements(phases('pending'), phases('started'), 'bits', wording)).toEqual(['Measuring download'])
  })

  it('reads its one direction with the run-wide minimum, maximum and p90 of the last hour, and the other as not run', () => {
    const base = resultFixture()
    const result = resultFixture({
      settings: continuousResultSettings('download'),
      download: { ...base.download!, bitsPerSecond: 921e6, minBitsPerSecond: 702e6, maxBitsPerSecond: 941e6, peakBitsPerSecond: 936e6, confidence: { level: 'normal', reasons: [] } },
      upload: { status: 'skipped', streams: 0, bytes: 0, events: [], confirmedRequests: 0 },
    })
    expect(resultSummary(result, 'bits', wording)).toContain(
      'Download average 921 megabits per second, run-wide minimum 702 megabits per second, maximum 941 megabits per second, peak 936 megabits per second p90, last hour. Upload not run. Idle latency',
    )
    // Without a p90 of the last hour, and on upload with its qualifiers.
    const upload = resultFixture({
      settings: continuousResultSettings('upload'),
      upload: { ...base.upload!, bitsPerSecond: 412e6, minBitsPerSecond: 318e6, maxBitsPerSecond: 437e6, peakBitsPerSecond: undefined, confidence: { level: 'low', reasons: ['unstable'] } },
    })
    expect(resultSummary(upload, 'bits', wording)).toContain(
      'Download not run. Upload average 412 megabits per second, run-wide minimum 318 megabits per second, maximum 437 megabits per second, low confidence: unstable. Idle',
    )
  })
})
