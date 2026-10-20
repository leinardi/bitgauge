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

// The demo's History variants (frontend.md section 9): the kit's eight results, each a valid
// result the History import would accept, newest first, with the kit's statuses and grades, which
// the engine's grading of their loaded latency gives, the engine's quality scores, and path B as
// the kit's Compare shows it, Compare B over HTTP/1.1 or HTTP/2.

import { describe, expect, it } from 'vitest'

import { restore } from '@/demo/choice'
import { chooseHistory, demoHistory } from '@/demo/control'
import { DEMO_HISTORY_VARIANTS, demoHistoryResults, isDemoHistory } from '@/demo/history'
import type { Result } from '@/engine/messages'
import { bufferbloat } from '@/engine/latency/grade'
import { validateResult } from '@/engine/messages'
import { scores } from '@/engine/result/scores'

describe('the demo history', () => {
  it('holds the kit rows as valid results, newest first', () => {
    const results = demoHistoryResults('populated')
    expect(results).toHaveLength(8)
    expect(results.flatMap((result) => validateResult(result))).toEqual([])
    expect(new Set(results.map((result) => result.id)).size).toBe(8)
    const starts = results.map((result) => Date.parse(result.startedAt))
    expect(starts).toEqual([...starts].sort((a, b) => b - a))
    expect(results.map((result) => result.status)).toEqual(['complete', 'complete', 'complete', 'complete', 'partial', 'complete', 'error', 'complete'])
    expect(results.map((result) => result.bufferbloat?.grade ?? null)).toEqual(['D', 'C', 'C', 'B', 'D', 'B', null, 'F'])
    expect(demoHistoryResults('empty')).toEqual([])
  })

  it("holds one result in the single variant, today's office run", () => {
    // Today at the kit's 07:14 UTC; or now, earlier in the day, or where 07:14 UTC is another
    // local day (east of UTC+9:46 at this instant).
    const now = new Date(Date.UTC(2026, 9, 18, 14, 2))
    const kit = '2026-10-18T07:14:00.000Z'
    const [only, ...rest] = demoHistoryResults('single', now)
    expect(rest).toEqual([])
    expect(only === undefined ? ['missing'] : validateResult(only)).toEqual([])
    expect(only?.label).toBe('VPN · office')
    expect(only?.download?.bitsPerSecond).toBe(241e6)
    expect(only?.startedAt).toBe(new Date(kit).toDateString() === now.toDateString() ? kit : now.toISOString())
    expect(demoHistoryResults('single', new Date(Date.UTC(2026, 9, 18, 7, 0)))[0]?.startedAt).toBe('2026-10-18T07:00:00.000Z')
  })

  it('dates the single result on the local today at every hour, never after now', () => {
    for (let minutes = 0; minutes < 48 * 60; minutes += 30) {
      const now = new Date(Date.UTC(2026, 9, 18) + minutes * 60_000)
      const at = new Date(demoHistoryResults('single', now)[0]?.startedAt ?? '')
      expect(at.toDateString()).toBe(now.toDateString())
      expect(at.getTime()).toBeLessThanOrEqual(now.getTime())
    }
  })

  it('grades each result as the engine grades its stored loaded latency, on a stored steady window', () => {
    for (const result of demoHistoryResults('populated')) {
      expect(result.bufferbloat).toEqual(bufferbloat(result.download?.loadedLatency, result.upload?.loadedLatency, true))
      const series = result.download?.series
      if (series !== undefined) {
        expect(series.values).toHaveLength((series.endMs - series.firstCellMs) / series.bucketMs)
      }
    }
  })

  it('scores each result as the engine scores it, and gives each direction that ran its path B', () => {
    for (const compareB of ['h1', 'h2'] as const) {
      const results = demoHistoryResults('populated', new Date(), compareB)
      expect(results.flatMap((result) => validateResult(result))).toEqual([])
      for (const result of results) {
        expect(result.scores).toEqual(scores({ idle: result.idle, bufferbloat: result.bufferbloat, download: result.download }))
        for (const part of [result.download, result.upload]) {
          // Over HTTP/1.1 path B does not run; over HTTP/2 a direction without a window has too few samples.
          const expected = result.client.protocol === 'HTTP/1.1' ? 'unavailable_h1' : part?.status === 'measured' ? expect.stringMatching(/^(measured|uncertain)$/u) : 'unavailable_insufficient'
          expect(part?.responsiveness?.state).toEqual(expected)
        }
      }
    }
  })

  it('compares the office runs as the kit does: B over HTTP/1.1, or over HTTP/2 and measured', () => {
    const rpm = (result: Result | undefined) => [result?.download?.responsiveness, result?.upload?.responsiveness].map((block) => (block === undefined ? null : [block.state, 'rpm' in block ? block.rpm : null]))
    const h1 = demoHistoryResults('populated', new Date(), 'h1')
    const h2 = demoHistoryResults('populated', new Date(), 'h2')
    // A, the 26 Sep office run, is the same in both.
    expect(rpm(h1[5])).toEqual([['measured', 980], ['uncertain', 610]])
    expect(rpm(h2[5])).toEqual(rpm(h1[5]))
    expect([h1[3]?.client.protocol, rpm(h1[3])]).toEqual(['HTTP/1.1', [['unavailable_h1', null], ['unavailable_h1', null]]])
    expect([h2[3]?.client.protocol, rpm(h2[3])]).toEqual(['HTTP/2', [['measured', 1010], ['measured', 640]]])
  })

  it('knows its variants, and the panel reads an unknown one back as the browser history', () => {
    expect(DEMO_HISTORY_VARIANTS.every(isDemoHistory)).toBe(true)
    expect(isDemoHistory('select3')).toBe(false)
    const storage = (value: object) => ({ getItem: () => JSON.stringify(value), setItem: () => undefined })
    expect(restore(storage({ history: 'empty' })).history).toBe('empty')
    expect(restore(storage({ history: 'deleted' })).history).toBe('')
  })

  it('never opens the history for the loading variant, so the screen stays loading', async () => {
    chooseHistory({ variant: 'loading', compareB: 'h1' })
    let settled = false
    void demoHistory().then(() => {
      settled = true
    })
    // Long past the turns an answer would take: the chosen variant is already there.
    for (let turn = 0; turn < 20; turn++) {
      await Promise.resolve()
    }
    expect(settled).toBe(false)
  })
})
