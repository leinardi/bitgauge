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

import { describe, expect, it } from 'vitest'

import { decadeLabel, latencyTop, rateDecades, timeTicks, timeWindow } from '@/components/history/trendAxes'

const DAY_S = 86_400
const now = new Date(2026, 9, 18, 14, 2)
const nowS = now.getTime() / 1000

describe('the trend time window', () => {
  it('spans all time from the first result to today, at least seven days', () => {
    expect(timeWindow({ kind: 'all' }, new Date(2026, 9, 18, 9, 14).toISOString(), now)).toEqual({ from: nowS - 7 * DAY_S, to: nowS })
    expect(timeWindow({ kind: 'all' }, new Date(2026, 8, 17, 13, 14).toISOString(), now)).toEqual({ from: new Date(2026, 8, 17).getTime() / 1000, to: nowS })
    expect(timeWindow({ kind: 'all' }, undefined, now)).toEqual({ from: nowS - 7 * DAY_S, to: nowS })
  })

  it('follows a preset back from now', () => {
    expect(timeWindow({ kind: 'days', days: 30 }, undefined, now)).toEqual({ from: nowS - 30 * DAY_S, to: nowS })
  })

  it('ends a custom range with its last day, never past now', () => {
    expect(timeWindow({ kind: 'custom', from: '2026-09-01', to: '2026-09-30' }, undefined, now)).toEqual({ from: new Date(2026, 8, 1).getTime() / 1000, to: new Date(2026, 9, 1).getTime() / 1000 })
    expect(timeWindow({ kind: 'custom', from: '2026-10-01', to: '2026-10-31' }, undefined, now).to).toBe(nowS)
    const short = timeWindow({ kind: 'custom', from: '2026-09-10', to: '2026-09-11' }, undefined, now)
    expect(short.to - short.from).toBe(7 * DAY_S)
  })
})

describe('the trend time ticks', () => {
  it('reads the last one as today and keeps three to five', () => {
    const week = timeTicks({ from: nowS - 7 * DAY_S, to: nowS }, now)
    expect(week.map((tick) => (nowS - tick.at) / DAY_S)).toEqual([6, 3, 0])
    expect(week.map((tick) => tick.today)).toEqual([false, false, true])
    for (const days of [7, 13, 14, 30, 69, 70, 90, 365, 3650]) {
      const ticks = timeTicks({ from: nowS - days * DAY_S, to: nowS }, now)
      expect(ticks.length, `${days} days`).toBeGreaterThanOrEqual(3)
      expect(ticks.length, `${days} days`).toBeLessThanOrEqual(5)
    }
  })

  it('steps by weeks over a month and by months over a quarter', () => {
    const month = timeTicks({ from: nowS - 30 * DAY_S, to: nowS }, now)
    expect(month.map((tick) => (nowS - tick.at) / DAY_S)).toEqual([28, 21, 14, 7, 0])
    const quarter = timeTicks({ from: nowS - 90 * DAY_S, to: nowS }, now)
    expect(quarter.map((tick) => new Date(tick.at * 1000).getMonth())).toEqual([7, 8, 9])
    expect(quarter.every((tick) => !tick.year)).toBe(true)
  })

  it('names no day today in a window that ends earlier', () => {
    expect(timeTicks({ from: nowS - 30 * DAY_S, to: nowS - DAY_S }, now).some((tick) => tick.today)).toBe(false)
  })
})

describe('the trend value axes', () => {
  it('spans whole decades around the rates, at least two', () => {
    expect(rateDecades([241e6])).toEqual([7, 9])
    expect(rateDecades([640e3, 241e6])).toEqual([5, 9])
    expect(rateDecades([1e8])).toEqual([6, 8])
    expect(rateDecades([])).toEqual([7, 9])
    expect([1e5, 1e7, 1e8, 1e9, 1e12, 10].map(decadeLabel)).toEqual(['100k', '10M', '100M', '1G', '1T', '10'])
  })

  it('tops latency at 80 ms or a quarter above the highest, rounded up', () => {
    expect(latencyTop([14])).toBe(80)
    expect(latencyTop([72])).toBe(100)
    expect(latencyTop([150])).toBe(200)
    expect(latencyTop([190])).toBe(250)
    expect(latencyTop([])).toBe(80)
  })
})
