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

// The demo's Continuous results (frontend.md section 9): valid results, graded and scored by the
// engine, the 2 h one with its run length and the 9-day one without, saved from its last 7 days.

import { describe, expect, it } from 'vitest'

import { continuousFixture, continuousFixtureId } from '@/demo/continuousResults'
import { bufferbloat } from '@/engine/latency/grade'
import { validateResult } from '@/engine/messages'
import { scores } from '@/engine/result/scores'

describe('the demo’s Continuous results', () => {
  it('are valid results, graded and scored by the engine', () => {
    for (const length of ['2h', '9d'] as const) {
      const result = continuousFixture(length)
      expect(validateResult(result)).toEqual([])
      expect(result.id).toBe(continuousFixtureId(length))
      expect(result.bufferbloat).toEqual(bufferbloat(result.download?.loadedLatency, undefined, true))
      expect(result.scores).toEqual(scores({ idle: result.idle, bufferbloat: result.bufferbloat, download: result.download }))
    }
  })

  it('run 2 h with its run length in 1 min cells, and 9 days without one, saved from their last 7 days', () => {
    const short = continuousFixture('2h')
    expect(short.settings.runLengthMs).toBe(7_200_000)
    expect(short.download?.series).toMatchObject({ bucketMs: 60_000, firstCellMs: 6500, warmupEndMs: 6500 })
    const long = continuousFixture('9d')
    expect(long.settings).not.toHaveProperty('runLengthMs')
    const series = long.download?.series
    // The engine's cut: its first saved cell comes after the warm-up end.
    expect((series?.firstCellMs ?? 0) > (series?.warmupEndMs ?? 0)).toBe(true)
    expect((series?.endMs ?? 0) - (series?.firstCellMs ?? 0)).toBeLessThanOrEqual(7 * 86_400_000 + 600_000)
  })

  it('take the Result detail’s Responsiveness for their download', () => {
    expect(continuousFixture('2h').download?.responsiveness).toMatchObject({ state: 'measured', rpm: 1379 })
    expect(continuousFixture('2h', 'uncertain').download?.responsiveness?.state).toBe('uncertain')
    expect(continuousFixture('9d', 'needs-h2').download?.responsiveness).toMatchObject({ state: 'unavailable_h1', protocol: 'http/1.1' })
    expect(continuousFixture('9d', 'not-reported').download?.responsiveness).toMatchObject({ state: 'unavailable_h1', protocol: '' })
  })
})
