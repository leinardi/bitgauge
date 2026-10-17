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

// The Result detail's table (ui/screens.md section 2): 2 s windows from warm-up end, throughput as
// bytes over known time, "no known time" rows, the real span of the last row, the median loaded
// latency per window, one row per cell when cells are coarser, and the idle pings in fives.

import { describe, expect, it } from 'vitest'

import { median, pingGroups, windowTable } from '@/components/result/windowTable'
import type { ResultSeries } from '@/engine/messages'

/** 100 ms cells from 6.5 s to 10 s, each 1 250 000 bytes (100 Mbit/s), with an unknown stretch. */
function series(values: (number | null)[], patch: Partial<ResultSeries> = {}): ResultSeries {
  return { bucketMs: 100, firstCellMs: 6500, warmupEndMs: 6500, endMs: 6500 + values.length * 100, values, ...patch }
}

describe('windowTable', () => {
  it('rows 2 s windows from warm-up end, the last with its real span', () => {
    const table = windowTable(series(Array.from({ length: 35 }, () => 1_250_000)))
    expect(table.cellMs).toBeNull()
    expect(table.rows.map((row) => [row.fromMs, row.toMs, row.knownMs])).toEqual([
      [6500, 8500, 2000],
      [8500, 10_000, 1500],
    ])
    expect(table.rows[0]?.bitsPerSecond).toBeCloseTo(100e6)
    expect(table.rows[1]?.bitsPerSecond).toBeCloseTo(100e6)
  })

  it('counts known time only, and gives a window with none no throughput', () => {
    const values = [...Array.from({ length: 10 }, () => 1_250_000), ...Array.from({ length: 30 }, () => null)]
    const table = windowTable(series(values))
    expect(table.rows.map((row) => row.knownMs)).toEqual([1000, 0])
    expect(table.rows[0]?.bitsPerSecond).toBeCloseTo(100e6)
    expect(table.rows[1]?.bitsPerSecond).toBeNull()
  })

  it('takes the median loaded latency of the samples in each window', () => {
    const latency = [
      { atMs: 6600, rttMs: 10 },
      { atMs: 7000, rttMs: 30 },
      { atMs: 8400, rttMs: 20 },
      { atMs: 8500, rttMs: 40 },
      { atMs: 10_500, rttMs: 50 },
    ]
    const table = windowTable(series(Array.from({ length: 40 }, () => 1000)), latency)
    expect(table.rows.map((row) => row.latencyMs)).toEqual([20, 45])
  })

  it('has no latency in a window without samples', () => {
    expect(windowTable(series([1000, 1000])).rows[0]?.latencyMs).toBeNull()
  })

  it('rows each stored cell when cells are coarser than 2 s', () => {
    const table = windowTable({ bucketMs: 60_000, firstCellMs: 6500, warmupEndMs: 6500, endMs: 150_000, values: [7_500_000, null, 6_000_000] })
    expect(table.cellMs).toBe(60_000)
    expect(table.rows.map((row) => [row.fromMs, row.toMs, row.knownMs, row.bitsPerSecond])).toEqual([
      [6500, 66_500, 60_000, 1e6],
      [66_500, 126_500, 0, null],
      [126_500, 150_000, 23_500, (6_000_000 * 8 * 1000) / 23_500],
    ])
  })

  it('counts a cell in the window its start falls in', () => {
    const table = windowTable(series([1000, 1000], { firstCellMs: 6400, warmupEndMs: 6500, endMs: 6600 }))
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0]?.knownMs).toBe(200)
  })
})

describe('median', () => {
  it('is the middle value, or the mean of the two middle ones', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe('pingGroups', () => {
  it('groups the idle samples by five in send order, the last group shorter', () => {
    expect(pingGroups([5, 1, 3, 2, 4, 9, 7])).toEqual([
      { first: 1, last: 5, medianMs: 3, minMs: 1, maxMs: 5 },
      { first: 6, last: 7, medianMs: 8, minMs: 7, maxMs: 9 },
    ])
  })
})
