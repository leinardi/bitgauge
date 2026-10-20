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

import { resultSummary } from '@/components/a11y/announce'
import type { Wording } from '@/components/test/wording'
import { createAppI18n } from '@/i18n'
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
        'Download 76.5 megabytes per second, low confidence: unstable and few samples. ' +
        'Upload 54.8 megabytes per second, partial, stopped early, limited by this device\'s CPU. ' +
        'Idle latency unavailable. Data used 512 bytes. ' +
        'Notices: Partial — stopped early · upload based on a 4.0\u00a0s steady window and Server stream limit — 1 stream.',
    )
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
      'over a protocol not reported: download unavailable, protocol not reported, treated as HTTP/1.1; upload unavailable, protocol not reported, treated as HTTP/1.1.',
    )
    // A partial result's summary leaves them out, as its Test screen state does.
    expect(resultSummary({ ...over('http/1.1'), status: 'partial' }, 'bits', wording)).not.toContain('responsiveness')
  })
})
