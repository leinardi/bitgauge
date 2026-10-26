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

// The History trend (ui/screens.md section 3): a Continuous result is drawn by its headline, the
// run-wide average of the direction it ran; the other direction has no point for it.

import { describe, expect, it } from 'vitest'

import TrendChart from '@/components/history/TrendChart.vue'
import TrendPlot from '@/components/history/TrendPlot.vue'
import { continuousResult } from '@/test/continuous'
import { mountApp } from '@/test/mount'

const at = (startedAt: string, direction: 'download' | 'upload') => ({ ...continuousResult({ direction, endMs: 7_200_000, bucketMs: 60_000 }), startedAt })

describe('the History trend', () => {
  it('draws a Continuous result by the headline of the direction it ran', async () => {
    const results = [at('2026-10-06T08:00:00.000Z', 'download'), at('2026-10-07T08:00:00.000Z', 'upload')]
    const page = await mountApp(TrendChart, '/history', { props: { results, units: 'bits', contexts: [], range: { kind: 'all' }, now: new Date('2026-10-08T12:00:00.000Z') } })
    const [download, upload] = page.findAllComponents(TrendPlot).map((plot) => plot.props('points').map((point) => point.value))
    expect(download).toEqual([921e6, null])
    expect(upload).toEqual([null, 921e6])
    page.unmount()
  })

  it('names each plot with its counts in the singular or plural', async () => {
    const results = [at('2026-10-06T08:00:00.000Z', 'download')]
    const page = await mountApp(TrendChart, '/history', { props: { results, units: 'bits', contexts: [], range: { kind: 'all' }, now: new Date('2026-10-08T12:00:00.000Z') } })
    const names = page.findAllComponents(TrendPlot).map((plot) => plot.props('label'))
    expect(names).toEqual(['Download trend, 1 result, 0 partial or error', 'Upload trend, 0 results, 0 partial or error', 'Idle latency trend, 1 result, 0 partial or error'])
    page.unmount()
  })
})
