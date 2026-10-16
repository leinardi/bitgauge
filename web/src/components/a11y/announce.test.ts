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

  it('says less than the timer resolution for a latency below it', () => {
    const base = resultFixture()
    const result = resultFixture({ client: { ...base.client, timerResolutionMs: 1 }, idle: { ...base.idle!, medianMs: 0.5, jitterMs: 0 } })
    expect(resultSummary(result, 'bits', wording)).toContain('Idle latency less than 1 millisecond, jitter less than 1 millisecond.')
  })
})
