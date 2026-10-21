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
import { chartLegend, chartMeta, type ChartState, chartSummary, type ChartTextInput, chartTitle, continuousResultTick, continuousStep, continuousTick } from '@/components/chart/text'
import type { Wording } from '@/components/test/wording'
import type { DirectionLive } from '@/composables/runLive'
import { type ContinuousSeries, useContinuousSeries } from '@/composables/useContinuousSeries'
import type { Direction, DirectionEvent } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { continuousSettings } from '@/test/continuous'

const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }
const DURATIONS = { download: { minMs: 10_000, maxMs: 20_000 }, upload: { minMs: 15_000, maxMs: 25_000 } }

function live(overrides: Partial<DirectionLive>): DirectionLive {
  return { firstBucket: 0, values: [], windowEnd: null, gauge: 0, sending: null, steady: null, continuous: null, warmupEnd: null, start: null, sendingTrace: [], streams: 1, phaseMs: 0, ...overrides }
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
  it('names both directions and the latency toggle when empty, and no data yet', () => {
    const empty = input('empty', {})
    expect(labels(empty)).toEqual(['Download', 'Upload', 'Latency under load'])
    expect(chartMeta(empty, wording)).toBe('')
    expect(chartSummary(empty, wording)).toBe('Throughput: no data yet')
  })

  it('reads a live direction against its minimum, with the warm-up shaded', () => {
    const running = input('running', { download }, { readout: 'Download 597 Mbit/s' })
    expect(labels(running)).toEqual(['Download', 'Latency under load', 'Warm-up'])
    expect(chartMeta(running, wording)).toBe('5.0 s / 10 s')
    expect(chartSummary(running, wording)).toBe('Throughput: Download 597 Mbit/s, 5.0 s / 10 s; warm-up shaded')
  })

  it('names received only once the server has confirmed something, and sending while the run goes on', () => {
    const sendingOnly = live({ firstBucket: 0, values: [null], sendingTrace: [{ cell: 1, bitsPerSecond: 1e4 }] })
    expect(labels(input('running', { download, upload: sendingOnly }))).toEqual(['Download', 'Upload · sending', 'Latency under load', 'Warm-up'])
    const both = live({ values: [1000, 1000], start: 0 })
    expect(labels(input('stopped', { download, upload: both }))).toEqual(['Download', 'Upload · received', 'Upload · sending', 'Latency under load', 'Warm-up'])
    expect(labels(input('done', { download, upload: both }))).toEqual(['Download', 'Upload', 'Latency under load', 'Warm-up'])
  })

  it('names the loaded latency, dashed, as its toggle, and says its second scale while it is shown', () => {
    const text = input('running', { download }, { readout: 'Download 597 Mbit/s' })
    const withLatency = { ...text, model: { ...text.model, latency: [{ at: 1, ms: 18 }] } }
    const entry = chartLegend(withLatency, wording).find((item) => item.key === 'latency')
    expect(entry).toMatchObject({ label: 'Latency under load', color: 'var(--series-latency)', dashed: true })
    expect(labels(withLatency)).toEqual(['Download', 'Latency under load', 'Warm-up'])
    expect(chartSummary({ ...withLatency, latencyShown: true }, wording)).toBe('Throughput: Download 597 Mbit/s, 5.0 s / 10 s; warm-up shaded; latency under load on a second scale')
    expect(chartSummary({ ...withLatency, latencyShown: false }, wording)).not.toContain('latency')
    // Before its first ping the toggle is listed, and nothing is drawn on a second scale.
    expect(chartSummary({ ...text, latencyShown: true }, wording)).not.toContain('latency')
  })

  it('gives the total once done, and where a stop or an error ended it with its mark', () => {
    expect(chartMeta(input('done', { download }, { totalMs: 28_600 }), wording)).toBe('28.6 s total')
    const stopped = input('stopped', { download }, { readout: 'Cancelled', events: { download: [{ code: 'cancelled', atMs: 5000 }] } })
    expect(chartSummary(stopped, wording)).toBe('Throughput: Cancelled, stopped at 5.0 s; warm-up shaded; marked: Cancelled')
    const interrupted = input('done', { download }, { readout: 'Download 612 Mbit/s', totalMs: 21_000, events: { download: [{ code: 'error', atMs: 4000, notice: 'upload-interrupted' }] } })
    expect(chartSummary(interrupted, wording)).toBe('Throughput: Download 612 Mbit/s, 21.0 s total; warm-up shaded; marked: Request failed')
  })
})

describe('a Continuous run’s chart text', () => {
  function series(direction: Direction, elapsedMs: number): ContinuousSeries {
    const continuous = useContinuousSeries()
    continuous.apply({ type: 'settings', scope: 'run', settings: continuousSettings(direction) })
    continuous.apply({ type: 'phase', phase: direction, state: 'started', notices: [] })
    continuous.apply({ type: 'sample', direction, fromBucket: 0, values: [1000], gauge: 0, streams: 1, phaseMs: elapsedMs, dataUsedBytes: 0, continuous: { elapsedMs, dataBytes: 0 } })
    return continuous.series.value as ContinuousSeries
  }
  const meta = (state: ChartState, direction: Direction, runLengthMs?: number, ended?: DirectionEvent) => {
    const shown = live({ values: [1000], continuous: { elapsedMs: 2_538_000, dataBytes: 0, ...(runLengthMs === undefined ? {} : { runLengthMs }) } })
    return chartMeta({ ...input(state, { [direction]: shown }, ended === undefined ? {} : { events: { [direction]: [ended] } }), continuous: series(direction, 2_538_000) }, wording)
  }

  it('reads the elapsed time against the run length, or alone, then how it ended; an upload’s unknown cells are gaps', () => {
    expect(meta('running', 'download')).toBe('42:18 elapsed')
    expect(meta('running', 'download', 7_200_000)).toBe('42:18 / 2:00:00')
    expect(meta('running', 'upload')).toBe('42:18 elapsed · unknown cells as gaps')
    expect(meta('done', 'download', undefined, { code: 'cancelled', atMs: 2_538_000 })).toBe('42:18 · stopped by you')
    expect(meta('done', 'download', 7_200_000, { code: 'data-cap', atMs: 2_538_000 })).toBe('42:18 · data cap reached')
    expect(meta('done', 'download', undefined, { code: 'error', atMs: 2_538_000, notice: 'requests-failed' })).toBe('stopped at 42:18')
    // Its run length passed: the elapsed time alone.
    expect(meta('done', 'download', 2_538_000)).toBe('42:18')
    expect(meta('done', 'upload', undefined, { code: 'cancelled', atMs: 2_538_000 })).toBe('42:18 · stopped by you · unknown cells as gaps')
  })

  it('titles the session, and past the warm-up drops its legend entry while the band stays shaded', () => {
    const past = { ...input('running', { download }, { readout: 'Download 934 Mbit/s' }), continuous: series('download', 2_538_000) }
    expect(chartTitle(past, wording)).toBe('Throughput · session')
    expect(labels(past)).toEqual(['Download', 'Latency under load'])
    expect(chartSummary(past, wording)).toBe('Throughput · session: Download 934 Mbit/s, 42:18 elapsed; warm-up shaded')
    expect(chartTitle(input('running', { download }), wording)).toBe('Throughput')
  })

  it('ticks its axis in seconds, minutes, hours or days, about six of them', () => {
    expect([30, 600, 2700, 4 * 3600, 8 * 86_400].map(continuousStep)).toEqual([10, 120, 600, 3600, 86_400])
    expect([30, 600, 7200, 86_400].map((seconds) => continuousTick(seconds, wording))).toEqual(['30s', '10m', '2h', '1d'])
  })

  it('ticks a Continuous result as the kit does: 0, minutes, then hours with their minutes', () => {
    expect([0, 1200, 3600, 4800, 6000, 86_400].map((seconds) => continuousResultTick(seconds, wording))).toEqual(['0', '20m', '1h', '1h20', '1h40', '1d'])
  })
})
