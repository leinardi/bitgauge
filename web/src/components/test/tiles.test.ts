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

// The tiles' contents for every direction status and confidence level, live and done, and the
// latency, data and duration tiles and the browser row (ui/screens.md section 6, tiles.md).

import { describe, expect, it } from 'vitest'

import { browserRow, confidenceReasons, dataTile, directionTile, durationTile, type IdleInput, idleErrorTile, idleTile, jitterTile, type TileView } from '@/components/test/tiles'
import type { Wording } from '@/components/test/wording'
import type { DirectionResult, IdleResult, UploadResult } from '@/engine/messages'
import { createAppI18n } from '@/i18n'

const context: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }
const NB = '\u00a0'
const text = (tile: TileView) => tile.lines.map((line) => line.text.replaceAll(NB, ' '))

function result(overrides: Partial<DirectionResult>): DirectionResult {
  return { status: 'measured', bitsPerSecond: 94_100_000, peakBitsPerSecond: 98_000_000, streams: 4, plateau: 'no-gain', confidence: { level: 'normal', reasons: [] }, bytes: 1, events: [], ...overrides }
}

describe('the confidence reasons', () => {
  it('word each reason as the share image and the copied summary do', () => {
    expect(confidenceReasons(['ramp-unsettled'], context)).toBe(context.t('share.qualifiers.reasons.rampUnsettled'))
    expect(confidenceReasons(['insufficient-samples'], context)).toBe(context.t('share.qualifiers.reasons.insufficientSamples'))
    expect(confidenceReasons(['unstable'], context)).toBe(context.t('share.qualifiers.reasons.unstable'))
  })
})

describe('a direction tile', () => {
  it('is empty before its direction runs, and says up next while the one before it runs', () => {
    expect(directionTile({ direction: 'download', units: 'bits' }, context)).toMatchObject({ label: 'Download', number: null, lines: [], pill: null })
    expect(text(directionTile({ direction: 'upload', units: 'bits', upNext: true }, context))).toEqual(['up next'])
  })

  it('says warming up in the number’s place until warm-up ends, then shows the average and the peak so far', () => {
    const warming = directionTile({ direction: 'upload', units: 'bits', live: { steady: null, confirmed: false } }, context)
    expect(warming).toMatchObject({ label: 'Upload', number: null, word: 'warming up', pill: { text: 'Live', tone: 'info' } })
    expect(text(warming)).toEqual(['no confirmed request yet'])
    expect(text(directionTile({ direction: 'upload', units: 'bits', live: { steady: null, confirmed: true } }, context))).toEqual([])
    const live = directionTile({ direction: 'download', units: 'bits', live: { steady: { avgBitsPerSecond: 9.41e7, peakBitsPerSecond: 9.8e7 }, confirmed: true } }, context)
    expect(live).toMatchObject({ number: '94.1', unit: 'Mbit/s', pill: { text: 'Live' } })
    expect(text(live)).toEqual(['peak 98.0'])
  })

  it('shows a measured headline with its peak, streams and plateau on one line, the peak’s unit only when it differs', () => {
    const tile = directionTile({ direction: 'download', units: 'bits', result: result({}) }, context)
    expect(tile).toMatchObject({ number: '94.1', unit: 'Mbit/s', pill: null })
    expect(text(tile)).toEqual(['peak 98.0 · 4 streams · plateau: no-gain'])
    expect(text(directionTile({ direction: 'download', units: 'bits', result: result({ bitsPerSecond: 990_000, peakBitsPerSecond: 1_020_000, plateau: 'cap' }) }, context))).toEqual(['peak 1.02 Mbit/s · 4 streams · plateau: cap'])
  })

  it('names low confidence with its pill and reasons, and a CPU-bound direction', () => {
    const low = directionTile({ direction: 'download', units: 'bits', result: result({ confidence: { level: 'low', reasons: ['ramp-unsettled', 'unstable'] } }) }, context)
    expect(low.pill).toEqual({ text: 'Low confidence', tone: 'warn' })
    expect(low.lines).toContainEqual({ text: 'low confidence · ramp unsettled and unstable', tone: 'warn' })
    const cpu = directionTile({ direction: 'download', units: 'bits', result: result({ confidence: { level: 'cpu-bound', reasons: ['unstable'] } }) }, context)
    expect(cpu.lines).toContainEqual({ text: "limited by this device's CPU", tone: 'warn' })
    expect(text(cpu).some((line) => line.startsWith('low confidence'))).toBe(false)
  })

  it('says what the number of a stopped direction covers: its steady window, and on upload its requests', () => {
    const upload = directionTile({ direction: 'upload', units: 'bits', result: { ...result({ status: 'partial', windowMs: 3600 }), confirmedRequests: 21 } as UploadResult }, context)
    expect(upload).toMatchObject({ number: '94.1', pill: { text: 'Partial — stopped early', tone: 'warn' } })
    expect(text(upload)).toEqual(['based on a 3.6 s steady window · 21 requests'])
    expect(text(directionTile({ direction: 'download', units: 'bits', result: result({ status: 'partial', windowMs: 3500 }) }, context))).toEqual(['based on a 3.5 s steady window'])
  })

  it('shows no number and the reason with the bytes used for insufficient data, stopped or at its maximum', () => {
    const none = (overrides: Partial<DirectionResult>): DirectionResult => {
      const { bitsPerSecond: _rate, peakBitsPerSecond: _peak, windowMs: _window, ...rest } = result({ bytes: 142_000_000, ...overrides })
      return overrides.windowMs === undefined ? rest : { ...rest, windowMs: overrides.windowMs }
    }
    const reason = (direction: 'download' | 'upload', value: DirectionResult, maxMs?: number, continuous?: boolean) =>
      directionTile({ direction, units: 'bits', result: value, ...(maxMs === undefined ? {} : { maxMs }), ...(continuous === undefined ? {} : { continuous }) }, context)
    // A stopped direction below the minimum window is insufficient data, worded by its stop.
    const stop = { status: 'insufficient-data' as const, events: [{ code: 'cancelled' as const, atMs: 3100 }] }
    expect(reason('upload', none(stop))).toMatchObject({ number: null, pill: { text: 'Insufficient data', tone: 'warn' } })
    expect(text(reason('upload', none(stop)))).toEqual(['Insufficient data — confirmed steady window shorter than 3 s (stopped in warm-up)', '142 MB used'])
    expect(text(reason('upload', none({ ...stop, windowMs: 2000 })))[0]).toBe('Insufficient data — confirmed steady window shorter than 3 s')
    expect(text(reason('download', none(stop), 20_000))[0]).toBe('Insufficient data — stopped during warm-up')
    expect(text(reason('download', none({ ...stop, windowMs: 2000 })))[0]).toBe('Insufficient data — steady window shorter than 3 s')
    // The data cap ended it before its maximum.
    expect(text(reason('download', none({ status: 'insufficient-data', events: [{ code: 'data-cap', atMs: 73 }] }), 20_000))[0]).toBe('Insufficient data — data cap reached before a steady window')
    // A Continuous stop is no reason of its own (measurement.md section 15).
    expect(text(reason('download', none(stop), undefined, true))[0]).toBe('Insufficient data — no steady window')
    expect(text(reason('download', none({ status: 'insufficient-data' }), 20_000))[0]).toBe('Insufficient data — no steady window within the 20 s max')
    expect(text(reason('download', none({ status: 'insufficient-data' })))[0]).toBe('Insufficient data — no steady window')
  })

  it('names what ended a direction with an error, with its pill', () => {
    const tile = directionTile({ direction: 'upload', units: 'bits', result: result({ status: 'error', events: [{ code: 'error', atMs: 6400, notice: 'requests-failed' }] }) }, context)
    expect(tile).toMatchObject({ number: null, pill: { text: 'Error', tone: 'danger' }, lines: [{ text: 'error · 3 requests in a row failed', tone: 'danger' }] })
    const limited = (notice: 'rate-limited' | 'server-busy') => directionTile({ direction: 'download', units: 'bits', result: result({ status: 'error', events: [{ code: 'error', atMs: 2300, notice }] }) }, context).lines
    expect(limited('rate-limited')).toEqual([{ text: 'error · rate-limited', tone: 'danger' }])
    expect(limited('server-busy')).toEqual([{ text: 'error · server busy', tone: 'danger' }])
  })

  it('says how far an upload ended by a failed request over HTTP/1.1 counts', () => {
    const tile = directionTile({ direction: 'upload', units: 'bits', result: result({ events: [{ code: 'error', atMs: 8200, notice: 'upload-interrupted' }] }) }, context)
    expect(text(tile)).toEqual(['window up to the failed request at 8.2 s'])
  })

  it('shows no number when skipped, even with a value', () => {
    const tile = directionTile({ direction: 'download', units: 'bits', result: result({ status: 'skipped' }) }, context)
    expect(tile).toMatchObject({ number: null, lines: [{ text: 'skipped' }], pill: null })
  })

  it('names the overhead compensation next to the number it changed, and reads bytes', () => {
    const tile = directionTile({ direction: 'download', units: 'bytes', result: result({ plateau: 'floor-limited' }), overheadPercent: 2.5 }, context)
    expect(tile).toMatchObject({ number: '11.8', unit: 'MB/s' })
    expect(text(tile)).toEqual(['peak 12.3 · 4 streams · plateau: floor-limited', 'includes +2.5 % overhead compensation'])
  })
})

describe('the latency tiles', () => {
  const idle: IdleResult = { path: 'websocket', lossPercent: 0, minMs: 2.4, medianMs: 3.1, p90Ms: 4.1, jitterMs: 0.8, samples: [] }
  const input = (overrides: Partial<IdleInput> = {}): IdleInput => ({ idle, resolutionMs: 0.1, protocol: 'h2', live: false, ...overrides })

  it('shows the median with min, p90, the path and the probe timeouts on one line', () => {
    const tile = idleTile(input(), context)
    expect(tile).toMatchObject({ label: 'Idle latency', number: '3.1', unit: 'ms', pill: null })
    expect(text(tile)).toEqual(['min 2.4 · p90 4.1 ms · WebSocket · 0.0 % probe timeouts'])
    expect(text(idleTile(input({ idle: { ...idle, path: 'http', lossPercent: 5 } }), context))).toEqual(['min 2.4 · p90 4.1 ms · HTTP/2 probe · 5.0 % probe timeouts'])
    expect(text(idleTile(input({ idle: { ...idle, path: 'http' }, protocol: null }), context))[0]).toContain('HTTP probe')
  })

  it('is live while idle latency runs, both tiles, and partial after a stop that kept it', () => {
    expect(idleTile(input({ live: true }), context).pill).toEqual({ text: 'Live', tone: 'info' })
    expect(jitterTile(input({ live: true }), context).pill).toEqual({ text: 'Live', tone: 'info' })
    const stopped = idleTile(input({ stopped: { samples: 11, pings: 12 } }), context)
    expect(stopped.pill).toEqual({ text: 'Partial — stopped early', tone: 'warn' })
    expect(text(stopped)).toEqual(['median of 11 pings · first of 12 discarded · WebSocket'])
    expect(jitterTile(input({ stopped: { samples: 11, pings: 12 } }), context).pill?.text).toBe('Partial — stopped early')
  })

  it('says how far it came when an error ended it', () => {
    expect(idleErrorTile({ pings: 12, count: 20 }, context)).toMatchObject({ number: null, pill: { text: 'Error' }, lines: [{ text: 'error · 12 of 20 pings before the error', tone: 'danger' }] })
  })

  it('reads below the timer resolution as less than it', () => {
    const tile = idleTile(input({ idle: { ...idle, minMs: 0.4, medianMs: 0.6, p90Ms: 1.2 }, resolutionMs: 1 }), context)
    expect(tile.number).toBe(`<${NB}1`)
    expect(text(tile)[0]).toBe('min < 1 · p90 1 ms · WebSocket · 0.0 % probe timeouts')
  })

  it('is unavailable without a median, and empty before idle latency', () => {
    const { minMs: _min, medianMs: _median, p90Ms: _p90, jitterMs: _jitter, ...lost } = idle
    expect(idleTile(input({ idle: { ...lost, lossPercent: 100 } }), context)).toMatchObject({ number: null })
    expect(text(idleTile(input({ idle: { ...lost, lossPercent: 100 } }), context))).toEqual(['unavailable', 'WebSocket · 100.0 % probe timeouts'])
    expect(idleTile(null, context).number).toBeNull()
    expect(jitterTile(input({ idle: { ...lost, lossPercent: 100 } }), context).number).toBeNull()
  })

  it('shows jitter as the mean of consecutive differences', () => {
    expect(jitterTile(input(), context)).toMatchObject({ label: 'Jitter', number: '0.8', unit: 'ms', lines: [{ text: 'mean of consecutive differences' }] })
  })
})

describe('the other tiles', () => {
  it('shows data used in decimal bytes and the duration in seconds', () => {
    expect(dataTile(4_000_000, context)).toMatchObject({ label: 'Data used', number: '4', unit: 'MB' })
    expect(dataTile(null, context).number).toBeNull()
    expect(durationTile(12_345, context)).toMatchObject({ label: 'Duration', number: '12.3', unit: 's' })
  })

  it('names the browser by family, major version and operating system', () => {
    expect(browserRow({ name: 'Safari', major: 18, os: 'macOS' }, context)).toMatchObject({ key: 'browser', label: 'Browser', value: 'Safari 18 · macOS' })
    expect(browserRow({ name: 'unknown', major: 0, os: 'Linux' }, context).value).toBeNull()
  })
})
