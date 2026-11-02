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

// The Result detail's test parameters (ui/screens.md section 2), in the rows of the kit's
// ResultDetail.jsx: the streams on one row, each direction's duration with its configured bounds,
// and the data cap with the data used.

import { describe, expect, it } from 'vitest'

import { parameterGroups } from '@/components/result/parameters'
import type { Result } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { continuousResult } from '@/test/continuous'
import { resultFixture } from '@/test/fixtures'

const t = createAppI18n('', ['en']).global.t as unknown as Parameters<typeof parameterGroups>[2]['t']
const wording = { t, locale: 'en' }

const BOUNDS = { download: { minMs: 10_000, maxMs: 20_000 }, upload: { minMs: 15_000, maxMs: 25_000 } }

function rows(result: Result): Record<string, string> {
  return Object.fromEntries(parameterGroups(result, 'bits', wording).flatMap((group) => group.rows.map((row) => [row.label, row.value])))
}

function withStreams(download: number, upload: number, plateau: 'cap' | 'no-gain' = 'cap'): Result {
  const base = resultFixture()
  return { ...base, download: base.download && { ...base.download, streams: download, plateau }, upload: base.upload && { ...base.upload, streams: upload, plateau } }
}

describe('parameterGroups', () => {
  it('gives the streams one row: the mode, then the count and plateau shared by both directions', () => {
    expect(rows(withStreams(6, 6))['Streams']).toBe('Auto · 6 · plateau: cap')
  })

  it('names each direction on the streams row when their counts or plateaus differ', () => {
    expect(rows(withStreams(6, 4, 'no-gain'))['Streams']).toBe('Auto · download 6 · plateau: no-gain; upload 4 · plateau: no-gain')
  })

  it('reads an unrecognized browser as a dash', () => {
    const base = resultFixture()
    expect(rows({ ...base, client: { ...base.client, browser: { name: 'unknown', major: 0, os: 'Linux' } } })['Browser']).toBe('—')
  })

  it('leaves a direction the run never reached off the streams row', () => {
    const base = withStreams(6, 0)
    const skipped = { ...base, upload: base.upload && { ...base.upload, status: 'skipped' as const, plateau: undefined } }
    expect(rows(skipped)['Streams']).toBe('Auto · 6 · plateau: cap')
  })

  it('gives each direction its duration with its configured bounds, and the data cap with the data used', () => {
    const base = resultFixture()
    const shown = rows({ ...base, settings: { ...base.settings, ...BOUNDS } })
    expect(shown['Download']).toBe('10.0\u00a0s · min 10 · max 20')
    expect(shown['Upload']).toBe('15.6\u00a0s · min 15 · max 25')
    expect(shown['Data cap']).toBe('Off · 1.3\u00a0GB used')
    expect(Object.keys(shown)).not.toContain('Duration')
    expect(Object.keys(shown)).not.toContain('Data used')
  })

  it('gives a direction without a series the instant an error or the cap ended it, or its maximum', () => {
    const base = resultFixture()
    const bare = (direction: 'download' | 'upload') => {
      const { series: _series, windowMs: _window, confidence: _confidence, ...rest } = base[direction]!
      return rest
    }
    const failed = rows({ ...base, settings: { ...base.settings, ...BOUNDS }, download: { ...bare('download'), status: 'error', events: [{ code: 'error', atMs: 6500, notice: 'requests-failed' }] } as Result['download'] })
    expect(failed['Download']).toBe('6.5 s · min 10 · max 20')
    const capped = rows({ ...base, settings: { ...base.settings, ...BOUNDS }, download: { ...bare('download'), status: 'insufficient-data', events: [{ code: 'data-cap', atMs: 73 }] } as Result['download'] })
    expect(capped['Download']).toBe('0.1 s · min 10 · max 20')
    const short = rows({ ...base, settings: { ...base.settings, ...BOUNDS }, upload: { ...bare('upload'), status: 'insufficient-data', events: [{ code: 'extended', atMs: 15_000 }] } as Result['upload'] })
    expect(short['Upload']).toBe('25.0 s · min 15 · max 25')
  })

  it('says the user stopped a direction, and when, for one stopped in warm-up', () => {
    const base = resultFixture()
    const upload = base.upload
    if (upload === undefined) {
      throw new Error('the fixture has an upload')
    }
    const { series: _series, windowMs: _window, ...warming } = upload
    const shown = rows({ ...base, settings: { ...base.settings, ...BOUNDS }, upload: { ...warming, status: 'partial', events: [{ code: 'cancelled', atMs: 3_100 }] } })
    expect(shown['Upload']).toBe('3.1\u00a0s · stopped by you · min 15 · max 25')
    expect(shown['Warm-up']).toBe('Auto · ended at 6.5\u00a0s (download); upload stopped in warm-up')
  })

  it('reads a direction stopped after its window by its stop instant, not its window end', () => {
    const base = resultFixture()
    const upload = base.upload
    if (upload?.series === undefined) {
      throw new Error('the fixture has an upload series')
    }
    const late = rows({ ...base, settings: { ...base.settings, ...BOUNDS }, upload: { ...upload, status: 'partial', series: { ...upload.series, endMs: 13_000 }, events: [{ code: 'cancelled', atMs: 14_000 }] } })
    expect(late['Upload']).toBe('14.0\u00a0s · stopped by you · min 15 · max 25')
  })

  it('reads a protocol the browser did not report as not reported', () => {
    const base = resultFixture()
    expect(rows({ ...base, client: { ...base.client, protocol: '' } })['Protocol']).toBe('not reported')
  })

  it('gives the duration alone for a result that records no bounds', () => {
    expect(rows(resultFixture())['Download']).toBe('10.0\u00a0s')
  })
})

describe('a Continuous result', () => {
  const HOUR = 3_600_000

  it('lists its one direction and its run length: none and how long it ran, or the length it reached', () => {
    const none = continuousResult({ endMs: 26 * HOUR + 60_000, bucketMs: 600_000 })
    expect(rows(none)).toMatchObject({ 'Phases and order': 'Idle latency → Download (continuous)', 'Run length': 'None · ran 1\u00a0d 2\u00a0h 1\u00a0min' })
    expect(rows(continuousResult({ endMs: 2 * HOUR, bucketMs: 60_000, runLengthMs: 2 * HOUR }))['Run length']).toBe('2\u00a0h')
    // Stopped before its run length: the length, and how long it ran.
    expect(rows(continuousResult({ endMs: 90 * 60_000, bucketMs: 60_000, runLengthMs: 2 * HOUR }))['Run length']).toBe('2\u00a0h · ran 1\u00a0h 30\u00a0min')
    expect(rows(continuousResult({ direction: 'upload', endMs: 45_000, bucketMs: 100 }))).toMatchObject({ 'Phases and order': 'Idle latency → Upload (continuous)', 'Run length': 'None · ran 45\u00a0s' })
    expect(Object.keys(rows(none))).not.toContain('Download')
  })
})
