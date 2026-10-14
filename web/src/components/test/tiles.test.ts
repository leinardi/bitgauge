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
// latency, data, duration and packet-loss tiles (ui/screens.md section 6, tiles.md).

import { describe, expect, it } from 'vitest'

import { dataTile, directionTile, durationTile, idleTile, jitterTile, packetLossTile, type TileView } from '@/components/test/tiles'
import type { Wording } from '@/components/test/wording'
import type { DirectionResult, IdleResult } from '@/engine/messages'
import { createAppI18n } from '@/i18n'

const context: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }
const NB = '\u00a0'
const text = (tile: TileView) => tile.lines.map((line) => line.text.replaceAll(NB, ' '))

function result(overrides: Partial<DirectionResult>): DirectionResult {
  return { status: 'measured', bitsPerSecond: 94_100_000, peakBitsPerSecond: 98_000_000, streams: 4, plateau: 'no-gain', confidence: { level: 'normal', reasons: [] }, bytes: 1, events: [], ...overrides }
}

const series = { bucketMs: 100, firstCellMs: 0, warmupEndMs: 2000, endMs: 7000, values: [] }

describe('a direction tile', () => {
  it('is empty before its direction runs', () => {
    const tile = directionTile({ direction: 'download', units: 'bits' }, context)
    expect(tile).toMatchObject({ label: 'Download', number: null, lines: [], live: false })
  })

  it('says warming up, with no number, until warm-up ends, then shows the average and peak so far', () => {
    expect(directionTile({ direction: 'upload', units: 'bits', live: { steady: null } }, context)).toMatchObject({ label: 'Upload', number: null, live: true, lines: [{ text: 'warming up' }] })
    const live = directionTile({ direction: 'download', units: 'bits', live: { steady: { avgBitsPerSecond: 9.41e7, peakBitsPerSecond: 9.8e7 } } }, context)
    expect(live).toMatchObject({ number: '94.1', unit: 'Mbit/s', live: true })
    expect(text(live)).toEqual(['avg so far 94.1 Mbit/s · peak 98.0 Mbit/s'])
  })

  it('shows a measured headline with its peak, streams and plateau', () => {
    const tile = directionTile({ direction: 'download', units: 'bits', result: result({}) }, context)
    expect(tile).toMatchObject({ number: '94.1', unit: 'Mbit/s', live: false })
    expect(text(tile)).toEqual(['peak 98.0 Mbit/s', '4 streams · no further gain'])
  })

  it('names low confidence with its reasons, and a CPU-bound direction', () => {
    const low = directionTile({ direction: 'download', units: 'bits', result: result({ confidence: { level: 'low', reasons: ['ramp-unsettled', 'unstable'] } }) }, context)
    expect(low.lines).toContainEqual({ text: 'low confidence · ramp unsettled and unstable', tone: 'warn' })
    const cpu = directionTile({ direction: 'download', units: 'bits', result: result({ confidence: { level: 'cpu-bound', reasons: ['unstable'] } }) }, context)
    expect(cpu.lines).toContainEqual({ text: "limited by this device's CPU", tone: 'warn' })
    expect(text(cpu).some((line) => line.startsWith('low confidence'))).toBe(false)
  })

  it('shows a partial number with partial, and none when its window was too short', () => {
    const partial = directionTile({ direction: 'upload', units: 'bits', result: result({ status: 'partial', plateau: 'cap', streams: 1 }) }, context)
    expect(partial.number).toBe('94.1')
    expect(text(partial)).toEqual(['partial — stopped early', 'peak 98.0 Mbit/s', '1 stream · stream cap'])
    const { bitsPerSecond: _rate, peakBitsPerSecond: _peak, ...short } = result({ status: 'partial', series })
    expect(directionTile({ direction: 'upload', units: 'bits', result: short }, context)).toMatchObject({ number: null, lines: [{ text: 'partial — stopped early' }, { text: 'insufficient data' }] })
  })

  it('says what the number of a stopped direction covers: the first seconds of its phase (measurement.md section 7.8)', () => {
    const upload = directionTile({ direction: 'upload', units: 'bits', result: result({ status: 'partial', series }) }, context)
    expect(text(upload).slice(0, 2)).toEqual(['partial — stopped early', 'upload based on the first 7.0 s'])
    const download = directionTile({ direction: 'download', units: 'bits', result: result({ status: 'partial', series: { ...series, endMs: 4200 } }) }, context)
    expect(text(download)[1]).toBe('download based on the first 4.2 s')
    // A measured direction says nothing of the kind.
    expect(text(directionTile({ direction: 'upload', units: 'bits', result: result({ series }) }, context)).some((line) => line.includes('first'))).toBe(false)
  })

  it('names what ended a direction with an error', () => {
    const tile = directionTile({ direction: 'upload', units: 'bits', result: result({ status: 'error', events: [{ code: 'error', atMs: 6400, notice: 'network-changed' }] }) }, context)
    expect(tile).toMatchObject({ number: null, lines: [{ text: 'error · network changed', tone: 'danger' }] })
  })

  it.each([
    ['insufficient-data', 'insufficient data', undefined],
    ['skipped', 'skipped', undefined],
    ['error', 'error', 'danger'],
  ] as const)('shows no number for %s, even with a value', (status, line, tone) => {
    const tile = directionTile({ direction: 'download', units: 'bits', result: result({ status }) }, context)
    expect(tile.number).toBeNull()
    expect(tile.lines).toEqual([tone === undefined ? { text: line } : { text: line, tone }])
  })

  it('names the overhead compensation next to the number it changed, and reads bytes', () => {
    const tile = directionTile({ direction: 'download', units: 'bytes', result: result({ plateau: 'floor-limited' }), overheadPercent: 2.5 }, context)
    expect(tile).toMatchObject({ number: '11.8', unit: 'MB/s' })
    expect(text(tile)).toEqual(['peak 12.3 MB/s', '4 streams · floor-limited', 'includes +2.5 % overhead compensation'])
  })
})

describe('the latency tiles', () => {
  const idle: IdleResult = { path: 'websocket', lossPercent: 0, minMs: 2.4, medianMs: 3.1, p90Ms: 4.1, jitterMs: 0.8, samples: [] }

  it('shows the median with min, p90, the path and the probe timeouts', () => {
    const tile = idleTile(idle, 0.1, context)
    expect(tile).toMatchObject({ label: 'Idle latency', number: '3.1', unit: 'ms' })
    expect(text(tile)).toEqual(['min 2.4 ms · p90 4.1 ms', 'WebSocket · 0.0 % probe timeouts'])
    expect(text(idleTile({ ...idle, path: 'http', lossPercent: 5 }, 0.1, context))[1]).toBe('HTTP · 5.0 % probe timeouts')
  })

  it('reads below the timer resolution as less than it', () => {
    const tile = idleTile({ ...idle, minMs: 0.4, medianMs: 0.6, p90Ms: 1.2 }, 1, context)
    expect(tile.number).toBe(`<${NB}1`)
    expect(text(tile)[0]).toBe('min < 1 ms · p90 1 ms')
  })

  it('is unavailable without a median, and empty before idle latency', () => {
    const { minMs: _min, medianMs: _median, p90Ms: _p90, jitterMs: _jitter, ...lost } = idle
    expect(idleTile({ ...lost, lossPercent: 100 }, 0.1, context)).toMatchObject({ number: null })
    expect(text(idleTile({ ...lost, lossPercent: 100 }, 0.1, context))).toEqual(['unavailable', 'WebSocket · 100.0 % probe timeouts'])
    expect(idleTile(null, 0.1, context).number).toBeNull()
    expect(jitterTile({ ...lost, lossPercent: 100 }, 0.1, context).number).toBeNull()
  })

  it('shows jitter as the mean of consecutive differences', () => {
    expect(jitterTile(idle, 0.1, context)).toMatchObject({ label: 'Jitter', number: '0.8', unit: 'ms', lines: [{ text: 'mean of consecutive differences' }] })
  })
})

describe('the other tiles', () => {
  it('shows data used in decimal bytes and the duration in seconds', () => {
    expect(dataTile(4_000_000, context)).toMatchObject({ label: 'Data used', number: '4', unit: 'MB' })
    expect(dataTile(null, context).number).toBeNull()
    expect(durationTile(12_345, context)).toMatchObject({ label: 'Duration', number: '12.3', unit: 's' })
  })

  it('keeps the packet-loss slot without a number', () => {
    expect(packetLossTile(context)).toMatchObject({ label: 'Packet loss', number: null, lines: [{ text: 'Not measured' }] })
  })
})
