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

// Decimal bytes and rates with three significant digits and a non-breaking space; latencies whole
// from 10 ms and with one decimal below.

import { describe, expect, it } from 'vitest'

import { formatAgo, formatBytes, formatDuration, formatLatency, formatPercent, formatRate, latencyAxisLabels, latencyNumber, rateAxisLabels, rateParts, spokenBytes, spokenLatency, spokenRate } from '@/lib/format'

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [999, '999 B'],
    [999_600, '1 MB'],
    [500_000_000, '500 MB'],
    [1_500_000_000, '1.5 GB'],
    [268_435_456, '268 MB'],
    [12_340_000_000_000, '12.3 TB'],
  ])('writes %d bytes as %s', (bytes, text) => {
    expect(formatBytes(bytes, 'en')).toBe(text.replace(' ', '\u00a0'))
  })

  it('follows the locale', () => {
    expect(formatBytes(1_500_000_000, 'de')).toBe('1,5\u00a0GB')
  })
})

describe('rateAxisLabels', () => {
  const nbsp = (labels: string[]) => labels.map((label) => label.replace(' ', '\u00a0'))

  it.each([
    // Every tick in the unit of the top one, never 250, 500, 750 under 1 Gbit/s.
    [1e9, 'bits', ['0', '0.25', '0.50', '0.75', '1.00 Gbit/s']],
    [8e8, 'bits', ['0', '200', '400', '600', '800 Mbit/s']],
    [1.5e7, 'bits', ['0', '3.8', '7.5', '11.3', '15.0 Mbit/s']],
    [8e5, 'bits', ['0', '200', '400', '600', '800 kbit/s']],
    [1.2e9, 'bits', ['0', '0.30', '0.60', '0.90', '1.20 Gbit/s']],
    [8e8, 'bytes', ['0', '25', '50', '75', '100 MB/s']],
    [8e3, 'bytes', ['0', '0.25', '0.50', '0.75', '1.00 kB/s']],
  ] as const)('labels a %d bit/s %s axis in one unit', (max, units, labels) => {
    expect(rateAxisLabels(max, units, 'en')).toEqual(nbsp([...labels]))
  })

  it('formats in the active locale', () => {
    expect(rateAxisLabels(1e9, 'bits', 'de')).toEqual(nbsp(['0', '0,25', '0,50', '0,75', '1,00 Gbit/s']))
  })
})

describe('latencyAxisLabels', () => {
  it('labels every tick with the top label\'s decimals, whole from 10 ms and one below', () => {
    expect(latencyAxisLabels(200, 'en')).toEqual(['0', '50', '100', '150', '200\u00a0ms'])
    expect(latencyAxisLabels(6, 'en')).toEqual(['0', '1.5', '3.0', '4.5', '6.0\u00a0ms'])
    // Every tick takes the top label's decimals: whole milliseconds from a 10 ms top.
    expect(latencyAxisLabels(12, 'en')).toEqual(['0', '3', '6', '9', '12\u00a0ms'])
    expect(latencyAxisLabels(10, 'en')).toEqual(['0', '3', '5', '8', '10\u00a0ms'])
  })
})

describe('formatRate', () => {
  it.each([
    [472_000, 'bits', '472 kbit/s'],
    [94_100_000, 'bits', '94.1 Mbit/s'],
    [2_380_000_000, 'bits', '2.38 Gbit/s'],
    [999_700, 'bits', '1.00 Mbit/s'],
    [5_000_000, 'bits', '5.00 Mbit/s'],
    [400, 'bits', '0.400 kbit/s'],
    [800_000_000, 'bytes', '100 MB/s'],
    [12_000, 'bytes', '1.50 kB/s'],
  ] as const)('writes %d bit/s in %s as %s', (bps, units, text) => {
    expect(formatRate(bps, units, 'en')).toBe(text.replace(' ', '\u00a0'))
  })

  it('trims the zeros of a round number, such as a scale\'s end', () => {
    expect(formatRate(1_000_000, 'bits', 'en', true)).toBe('1\u00a0Mbit/s')
    expect(formatRate(80_000, 'bytes', 'en', true)).toBe('10\u00a0kB/s')
  })

  it('gives the number and the unit apart, in the locale', () => {
    expect(rateParts(94_100_000, 'bits', 'de')).toEqual({ number: '94,1', unit: 'Mbit/s' })
  })
})

describe('latencyNumber', () => {
  it.each([
    [9.4, '9.4'],
    [9.0, '9.0'],
    [9.96, '10'],
    [51.4, '51'],
    [0.42, '0.4'],
  ])('writes %d ms as %s', (ms, text) => {
    expect(latencyNumber(ms, 'en')).toBe(text)
  })
})

describe('the formatting table of screens.md section 6', () => {
  const NB = '\u00a0'
  it.each([
    [formatRate(472_000, 'bits', 'en'), '472 kbit/s'],
    [formatRate(94_100_000, 'bits', 'en'), '94.1 Mbit/s'],
    [formatRate(2_380_000_000, 'bits', 'en'), '2.38 Gbit/s'],
    [formatLatency(9.4, 'en', 0.1), '9.4 ms'],
    [formatLatency(51.3, 'en', 0.1), '51 ms'],
    [formatLatency(0.6, 'en', 1), '< 1 ms'],
    [formatLatency(0.05, 'en', 0.1), '< 0.1 ms'],
    [formatLatency(4.4, 'en', 1), '4 ms'],
    [formatBytes(1_500_000_000, 'en'), '1.5 GB'],
    [formatDuration(12_345, 'en'), '12.3 s'],
    [formatPercent(2.5, 'en'), '2.5 %'],
  ])('writes %s as %s', (written, expected) => {
    expect(written).toBe(expected.replaceAll(' ', NB))
  })
})

describe('the spoken forms', () => {
  it('say a rate with the visual scale and digits, and the long unit names', () => {
    expect(spokenRate(9.41e7, 'bits', 'en')).toBe('94.1 megabits per second')
    expect(spokenRate(1e6, 'bits', 'en')).toBe('1.00 megabits per second')
    expect(spokenRate(472_000, 'bits', 'en')).toBe('472 kilobits per second')
    expect(spokenRate(999_600_000, 'bits', 'en')).toBe('1.00 gigabits per second')
    expect(spokenRate(8e8, 'bytes', 'en')).toBe('100 megabytes per second')
    expect(spokenRate(2.38e9, 'bits', 'de')).toBe('2,38 Gigabit pro Sekunde')
  })

  it('say a byte count and a latency the same way', () => {
    expect(spokenBytes(1_234_567_890, 'en')).toBe('1.23 gigabytes')
    expect(spokenBytes(1, 'en')).toBe('1 byte')
    expect(spokenLatency(51.4, 'en')).toEqual({ text: '51 milliseconds', below: false })
    expect(spokenLatency(1.94, 'en')).toEqual({ text: '1.9 milliseconds', below: false })
    expect(spokenLatency(0.5, 'en', 1)).toEqual({ text: '1 millisecond', below: true })
  })
})

describe('time ago', () => {
  const now = Date.parse('2026-10-08T12:00:00Z')
  it('reads the largest whole unit, and now under a minute', () => {
    expect(formatAgo(now - 30_000, now, 'en')).toBe('now')
    expect(formatAgo(now - 5 * 60_000, now, 'en')).toBe('5m ago')
    expect(formatAgo(now - 2.5 * 3_600_000, now, 'en')).toBe('2h ago')
    expect(formatAgo(now - 86_400_000, now, 'en')).toBe('yesterday')
    expect(formatAgo(now - 23 * 86_400_000, now, 'en')).toBe('23d ago')
    // A start after now, from a clock that moved back, reads now.
    expect(formatAgo(now + 60_000, now, 'en')).toBe('now')
  })
})
