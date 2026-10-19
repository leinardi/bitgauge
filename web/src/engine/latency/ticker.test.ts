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

import { sendProbe, Ticker } from '@/engine/latency/ticker'
import { FakeClock } from '@/engine/test/fakeClock'
import type { ProbeTiming } from '@/engine/types'

describe('the ticker', () => {
  it('ticks at start and every 300 ms until stopped, and stays stopped', async () => {
    const clock = new FakeClock()
    const ticks: number[] = []
    const ticker = new Ticker(clock, () => ticks.push(clock.now()))
    ticker.start()
    await clock.advance(700)
    ticker.stop()
    await clock.advance(1000)
    ticker.start()
    expect(ticks).toEqual([0, 300, 600])
  })
})

describe('an HTTP probe', () => {
  const answered: ProbeTiming = { status: 204, sentAt: 0, doneAt: 5, timing: null }

  it('settles with the answer, or null when it fails or is aborted', async () => {
    const settled: (ProbeTiming | null)[] = []
    sendProbe({ probe: () => Promise.resolve(answered) }, '/api/v1/ping', (probe) => settled.push(probe))
    sendProbe({ probe: () => Promise.reject(new Error('network')) }, '/api/v1/ping', (probe) => settled.push(probe))
    const controller = sendProbe(
      { probe: (_path, signal) => new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')))) },
      '/api/v1/small',
      (probe) => settled.push(probe),
    )
    controller.abort()
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toEqual([answered, null, null])
  })
})
