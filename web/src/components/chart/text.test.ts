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

// The chart's words per state: the legend names what is drawn, the meta line where the run stands,
// and the summary says what the chart shows, with its warm-up and its marks (charts.md).

import { describe, expect, it } from 'vitest'

import { buildChart } from '@/components/chart/series'
import { chartLegend, chartMeta, type ChartState, chartSummary, type ChartTextInput } from '@/components/chart/text'
import type { Wording } from '@/components/test/wording'
import type { DirectionLive } from '@/composables/useRunState'
import type { Direction, DirectionEvent } from '@/engine/messages'
import { createAppI18n } from '@/i18n'

const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }
const DURATIONS = { download: { minMs: 10_000, maxMs: 20_000 }, upload: { minMs: 15_000, maxMs: 25_000 } }

function live(overrides: Partial<DirectionLive>): DirectionLive {
  return { firstBucket: 0, values: [], windowEnd: null, gauge: 0, sending: null, steady: null, warmupEnd: null, start: null, sendingTrace: [], ...overrides }
}

function input(
  state: ChartState,
  shown: Partial<Record<Direction, DirectionLive>>,
  extra: { readout?: string; totalMs?: number; events?: Partial<Record<Direction, DirectionEvent[]>> } = {},
): ChartTextInput {
  const order = ['download', 'upload'] as const
  const runLive = { download: shown.download ?? null, upload: shown.upload ?? null }
  return {
    state,
    order,
    live: runLive,
    model: buildChart({ order, live: runLive, units: 'bits', events: extra.events ?? {} }),
    durations: DURATIONS,
    totalMs: extra.totalMs ?? null,
    readout: extra.readout ?? null,
  }
}

const labels = (text: ChartTextInput) => chartLegend(text, wording).map((entry) => entry.label)
const download = live({ values: Array.from({ length: 50 }, () => 1000), warmupEnd: 20 })

describe('the chart text', () => {
  it('names both directions when empty, and no data yet', () => {
    const empty = input('empty', {})
    expect(labels(empty)).toEqual(['Download', 'Upload'])
    expect(chartMeta(empty, wording)).toBe('')
    expect(chartSummary(empty, wording)).toBe('Throughput: no data yet')
  })

  it('reads a live direction against its minimum, with the warm-up shaded', () => {
    const running = input('running', { download }, { readout: 'Download 597 Mbit/s' })
    expect(labels(running)).toEqual(['Download', 'Warm-up'])
    expect(chartMeta(running, wording)).toBe('5.0 s / 10.0 s')
    expect(chartSummary(running, wording)).toBe('Throughput: Download 597 Mbit/s, 5.0 s / 10.0 s; warm-up shaded')
  })

  it('names received only once the server has confirmed something, and sending while the run goes on', () => {
    const sendingOnly = live({ firstBucket: 0, values: [null], sendingTrace: [{ cell: 1, bitsPerSecond: 1e4 }] })
    expect(labels(input('running', { download, upload: sendingOnly }))).toEqual(['Download', 'Upload · sending', 'Warm-up'])
    const both = live({ values: [1000, 1000], start: 0 })
    expect(labels(input('stopped', { download, upload: both }))).toEqual(['Download', 'Upload · received', 'Upload · sending', 'Warm-up'])
    expect(labels(input('done', { download, upload: both }))).toEqual(['Download', 'Upload', 'Warm-up'])
  })

  it('gives the total once done, and where a stop or an error ended it with its mark', () => {
    expect(chartMeta(input('done', { download }, { totalMs: 28_600 }), wording)).toBe('28.6 s total')
    const stopped = input('stopped', { download }, { readout: 'Cancelled', events: { download: [{ code: 'cancelled', atMs: 5000 }] } })
    expect(chartSummary(stopped, wording)).toBe('Throughput: Cancelled, stopped at 5.0 s; warm-up shaded; marked: Cancelled')
    const interrupted = input('done', { download }, { readout: 'Download 612 Mbit/s', totalMs: 21_000, events: { download: [{ code: 'error', atMs: 4000, notice: 'upload-interrupted' }] } })
    expect(chartSummary(interrupted, wording)).toBe('Throughput: Download 612 Mbit/s, 21.0 s total; warm-up shaded; marked: Request failed')
  })
})
