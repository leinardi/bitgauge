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

// The stop notice per stop (ui/flows.md section 4): the export's four cancelled states, worded from
// the result, and a run whose order puts upload first.

import { describe, expect, it } from 'vitest'

import { latencyStopView } from '@/components/test/notices'
import { stopWording } from '@/components/test/stop'
import type { Wording } from '@/components/test/wording'
import type { Direction, Result } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { continuousResultSettings } from '@/test/continuous'
import { resultFixture } from '@/test/fixtures'

const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }
const base = resultFixture()
const download = base.download!
const upload = base.upload!
const SKIPPED = { status: 'skipped' as const, streams: 0, bytes: 0, events: [] }

function words(direction: Direction, coveredMs: number, result: Partial<Result>): { title: string; body: string } {
  const shown = stopWording({ code: 'stopped-early', direction, coveredMs }, { ...wording, result: { ...base, status: 'partial', ...result } })
  return { title: shown.title.replace(/\u00a0/gu, ' '), body: shown.body.replace(/\u00a0/gu, ' ') }
}

describe('the stop notice', () => {
  it('words an upload stopped in warm-up, with no number', () => {
    const { bitsPerSecond: _b, peakBitsPerSecond: _p, windowMs: _w, series: _s, ...cut } = upload
    expect(words('upload', 0, { upload: { ...cut, status: 'partial', events: [{ code: 'cancelled', atMs: 3100 }] } })).toEqual({
      title: 'Test cancelled during upload',
      body: 'Latency and download completed. Upload stopped at 3.1 s, before a 3 s confirmed steady window (still in warm-up), so it has no value.',
    })
  })

  it('says why an upload stopped without a probe path has no loaded latency', () => {
    const { bitsPerSecond: _b, peakBitsPerSecond: _p, windowMs: _w, series: _s, ...cut } = upload
    const loadedLatency = { status: 'unavailable' as const, reason: 'no-probe-path' as const, samples: 0, skippedTicks: 0, lost: 0 }
    expect(words('upload', 0, { upload: { ...cut, status: 'partial', loadedLatency, events: [{ code: 'cancelled', atMs: 800 }] } }).body).toBe(
      'Latency and download completed. The WebSocket closed and its reopening was never answered, so no latency probe could be sent during the upload. Upload stopped at 0.8 s, before a 3 s confirmed steady window (still in warm-up), so it has no value.',
    )
  })

  it('words an upload stopped late enough for a number: its window, its confirmed requests and their end', () => {
    const series = { bucketMs: 100, firstCellMs: 9500, warmupEndMs: 9500, endMs: 13_100, values: [1] }
    expect(words('upload', 3600, { upload: { ...upload, status: 'partial', windowMs: 3600, confirmedRequests: 21, series, events: [{ code: 'cancelled', atMs: 14_000 }] } })).toEqual({
      title: 'Partial — stopped early · upload based on a 3.6 s steady window',
      body: 'Latency and download completed. Upload stopped at 14.0 s; in-flight requests were aborted, and the 21 requests confirmed by 13.1 s give the partial value.',
    })
  })

  it('words a download stopped with and without a number, and the upload that did not run', () => {
    const { bitsPerSecond: _b, peakBitsPerSecond: _p, ...cut } = download
    expect(words('download', 1200, { download: { ...cut, status: 'partial', events: [{ code: 'cancelled', atMs: 5200 }] }, upload: { ...SKIPPED, confirmedRequests: 0 } })).toEqual({
      title: 'Test cancelled during download',
      body: 'Latency completed. Download stopped before a 3 s steady window, so it has no value. Upload did not run.',
    })
    expect(words('download', 3500, { download: { ...download, status: 'partial', events: [{ code: 'cancelled', atMs: 8000 }] }, upload: { ...SKIPPED, confirmedRequests: 0 } }).body).toBe(
      'Latency completed. Download has a 3.5 s steady window, enough for a partial value. Upload did not run.',
    )
  })

  it('names the phases in the run order, leaving out those that never ran', () => {
    const { bitsPerSecond: _b, peakBitsPerSecond: _p, windowMs: _w, series: _s, ...cut } = upload
    const { idle: _i, ...withoutIdle } = base
    const shown = stopWording(
      { code: 'stopped-early', direction: 'upload', coveredMs: 0 },
      { ...wording, result: { ...withoutIdle, status: 'partial', settings: { ...base.settings, phases: ['upload', 'download'] }, upload: { ...cut, status: 'partial', windowMs: 1000, events: [{ code: 'cancelled', atMs: 4200 }] }, download: SKIPPED } },
    )
    expect(shown.body.replace(/\u00a0/gu, ' ')).toBe('Upload stopped at 4.2 s, before a 3 s confirmed steady window, so it has no value. Download did not run.')
  })

  it('names no other direction as not run for a Continuous run, which runs one', () => {
    const shown = words('download', 0, {
      settings: continuousResultSettings('download'),
      download: { status: 'insufficient-data', streams: 4, bytes: 6e6, events: [{ code: 'cancelled', atMs: 5000 }] },
      upload: { ...SKIPPED, confirmedRequests: 0 },
    })
    expect(shown.body).toBe('Latency completed. Download stopped before a 3 s steady window, so it has no value.')
  })

  it('words a Continuous upload stopped in warm-up the same before its result arrives and after', () => {
    const settings = continuousResultSettings('upload')
    const stopped = { status: 'insufficient-data' as const, streams: 2, bytes: 4e5, events: [{ code: 'cancelled' as const, atMs: 1500 }], confirmedRequests: 0 }
    const notice = { code: 'stopped-early' as const, direction: 'upload' as const, coveredMs: 0 }
    const expected = 'Latency completed. Upload stopped at 1.5 s, before a 3 s confirmed steady window (still in warm-up), so it has no value.'
    // Live: the upload's finished event, the finished idle latency and the run's settings.
    const live = stopWording(notice, { ...wording, settings, directions: { upload: stopped }, finishedIdle: base.idle ?? null })
    expect(live.body.replace(/\u00a0/gu, ' ')).toBe(expected)
    const ended = stopWording(notice, { ...wording, result: { ...base, status: 'partial', settings, download: SKIPPED, upload: stopped } })
    expect(ended).toEqual(live)
  })

  it('gives no stop instant when the stopped direction has no cancelled event yet', () => {
    const settings = continuousResultSettings('upload')
    const shown = stopWording({ code: 'stopped-early', direction: 'upload', coveredMs: 0 }, { ...wording, settings })
    expect(shown.body).toBe('Upload stopped before a 3 s confirmed steady window (still in warm-up), so it has no value.')
    expect(shown.body).not.toContain('0.0')
  })

  it('words a stop during idle latency from the pings sent, with no stopped-early notice in the result', () => {
    const result = { ...base, status: 'partial' as const, download: SKIPPED, upload: { ...SKIPPED, confirmedRequests: 0 }, notices: [] }
    expect(latencyStopView(result, { pings: 12, count: 20 }, wording)).toMatchObject({
      tone: 'neutral',
      title: 'Test cancelled during latency',
      body: 'Stopped after 12 of 20 pings. The first is a warm-up sample, so idle latency and jitter come from the other 11; download and upload did not run.',
    })
  })

  it('shows no latency stop notice for a direction stopped early, nor for a complete run', () => {
    expect(latencyStopView({ ...base, status: 'partial', notices: [{ code: 'stopped-early', direction: 'upload', coveredMs: 0 }] }, { pings: 20, count: 20 }, wording)).toBeNull()
    expect(latencyStopView(base, { pings: 20, count: 20 }, wording)).toBeNull()
  })
})
