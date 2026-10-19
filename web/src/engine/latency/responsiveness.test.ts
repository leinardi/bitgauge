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

// Path B's calculation (measurement.md sections 12.4 to 12.6): the states and their precedence,
// TM95 and its trimming count, the 4 s formula window, the RPM and the result block.

import { describe, expect, it } from 'vitest'

import { connectionOf, type PathBInput, type PathBSample, pathBRuns, responsiveness, tm95 } from '@/engine/latency/responsiveness'

/** `count` reused h2 probes 300 ms apart, ending at 10 000 ms, each `httpMs` long. */
function probes(count: number, httpMs = 40): PathBSample[] {
  return Array.from({ length: count }, (_, index) => ({
    fetchStart: 10_000 - (count - index) * 300,
    httpMs,
    totalMs: httpMs + 2,
    protocol: 'h2',
    connection: 'reused' as const,
  }))
}

function input(overrides: Partial<PathBInput> = {}): PathBInput {
  return { protocol: 'h2', samples: probes(13), endAt: 10_000, window: true, cappedWarmup: false, resolutionMs: 0.1, ...overrides }
}

describe('the capability', () => {
  it('lets path B run on h2 and h3 only', () => {
    expect(pathBRuns('h2')).toBe(true)
    expect(pathBRuns('h3')).toBe(true)
    for (const protocol of ['http/1.1', 'http/1.0', 'h3-29', '']) {
      expect(pathBRuns(protocol)).toBe(false)
    }
  })
})

describe('the connection evidence', () => {
  it('reads equal connect fields as reused, different ones as new, and absent or zero ones as unknown', () => {
    expect(connectionOf(120, 120)).toBe('reused')
    expect(connectionOf(120, 170)).toBe('new')
    expect(connectionOf(undefined, undefined)).toBe('unknown')
    expect(connectionOf(120, undefined)).toBe('unknown')
    expect(connectionOf(0, 0)).toBe('unknown')
  })
})

describe('TM95', () => {
  it('at 19 samples trims nothing: the plain mean', () => {
    const values = [...Array.from({ length: 18 }, () => 10), 200]
    expect(tm95(values)).toEqual({ meanMs: (18 * 10 + 200) / 19, trimmed: 0 })
  })

  it('at 20 samples drops the slowest one', () => {
    const values = [200, ...Array.from({ length: 19 }, () => 10)]
    expect(tm95(values)).toEqual({ meanMs: 10, trimmed: 1 })
  })

  it('drops floor(5 % × n) from the slow end', () => {
    const values = Array.from({ length: 41 }, (_, index) => index + 1)
    // floor(2.05) = 2: 40 and 41 go.
    expect(tm95(values)).toEqual({ meanMs: 20, trimmed: 2 })
  })

  it('has no value without samples', () => {
    expect(tm95([])).toBeNull()
  })
})

describe('the state', () => {
  it('is measured on h2 with at least 10 samples, every connection reused and an uncapped warm-up', () => {
    expect(responsiveness(input())).toEqual({ state: 'measured', protocol: 'h2', samples: 13, rpm: 1500, tm95Ms: 40, trimmed: 0, totalMedianMs: 42 })
  })

  it('is measured on h3 the same way', () => {
    const samples = probes(13).map((sample) => ({ ...sample, protocol: 'h3' }))
    expect(responsiveness(input({ protocol: 'h3', samples }))).toMatchObject({ state: 'measured', protocol: 'h3' })
  })

  it('is unavailable_h1 on HTTP/1.1, an empty protocol or any other value, with no numbers', () => {
    for (const protocol of ['http/1.1', '', 'h3-29']) {
      expect(responsiveness(input({ protocol, samples: [] }))).toEqual({ state: 'unavailable_h1', protocol, samples: 0 })
    }
  })

  it('is uncertain with fewer than 10 samples', () => {
    expect(responsiveness(input({ samples: probes(9) }))).toEqual({ state: 'uncertain', protocol: 'h2', samples: 9, rpm: 1500, tm95Ms: 40, trimmed: 0, totalMedianMs: 42 })
  })

  it('is uncertain when a probe opened a new connection or does not say', () => {
    for (const connection of ['new', 'unknown'] as const) {
      const samples = probes(13).map((sample, index) => (index === 5 ? { ...sample, connection } : sample))
      expect(responsiveness(input({ samples }))).toMatchObject({ state: 'uncertain', rpm: 1500 })
    }
  })

  it('is uncertain when the protocol changed mid-phase', () => {
    const samples = probes(13).map((sample, index) => (index === 12 ? { ...sample, protocol: 'h3' } : sample))
    expect(responsiveness(input({ samples }))).toMatchObject({ state: 'uncertain' })
  })

  it('is uncertain after a capped warm-up', () => {
    expect(responsiveness(input({ cappedWarmup: true }))).toMatchObject({ state: 'uncertain', samples: 13 })
  })

  it('is unavailable_insufficient with fewer than 4 samples in the last 4 s, however many before', () => {
    // 20 samples, only 3 of them sent in the last 4 s.
    const early = probes(17).map((sample) => ({ ...sample, fetchStart: sample.fetchStart - 6000 }))
    const samples = [...early, ...probes(3)]
    expect(responsiveness(input({ samples }))).toEqual({ state: 'unavailable_insufficient', protocol: 'h2', samples: 20 })
  })

  it('is unavailable_insufficient without a steady window, ahead of uncertain', () => {
    expect(responsiveness(input({ window: false, samples: probes(3), cappedWarmup: true }))).toEqual({ state: 'unavailable_insufficient', protocol: 'h2', samples: 3 })
  })

  it('is unavailable_insufficient when no prober ran', () => {
    expect(responsiveness(input({ samples: [], endAt: null, window: false }))).toEqual({ state: 'unavailable_insufficient', protocol: 'h2', samples: 0 })
  })

  it('is unavailable_insufficient when TM95 quantizes to 0', () => {
    expect(responsiveness(input({ samples: probes(13, 0.004), resolutionMs: 0.1 }))).toMatchObject({ state: 'unavailable_insufficient' })
  })

  it('puts unavailable_h1 first of all', () => {
    expect(responsiveness(input({ protocol: 'http/1.1', window: false, cappedWarmup: true, samples: probes(2) }))).toMatchObject({ state: 'unavailable_h1' })
  })
})

describe('the formula', () => {
  it('takes TM95 over the samples sent in the last 4 s, the median total over the whole window', () => {
    // Slow probes early in the window; the last 4 s hold 13 fast ones.
    const early = probes(10, 300).map((sample) => ({ ...sample, fetchStart: sample.fetchStart - 4200 }))
    const samples = [...early, ...probes(13, 50)]
    const block = responsiveness(input({ samples }))
    expect(block).toMatchObject({ state: 'measured', samples: 23, tm95Ms: 50, rpm: 1200, trimmed: 0, totalMedianMs: 52 })
  })

  it('trims at 20 samples in the last 4 s and states how many', () => {
    const samples = probes(20, 30).map((sample, index) => (index === 4 ? { ...sample, httpMs: 900 } : sample))
    // Spread over 4 s: 20 probes 200 ms apart.
    const spread = samples.map((sample, index) => ({ ...sample, fetchStart: 6000 + index * 200 }))
    expect(responsiveness(input({ samples: spread }))).toMatchObject({ state: 'measured', tm95Ms: 30, rpm: 2000, trimmed: 1 })
  })

  it('quantizes TM95 and the median to the timer resolution, the RPM from the quantized TM95', () => {
    const samples = probes(13, 33.37)
    expect(responsiveness(input({ samples, resolutionMs: 1 }))).toMatchObject({ tm95Ms: 33, rpm: 1818, totalMedianMs: 35 })
  })
})
