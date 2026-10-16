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

// The latency samples chart: its points on the phase's time with gaps where a ping gave no RTT,
// its axis to the phase's estimate, and its words per state, from the gauge's readout (charts.md).

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { buildLatency, type LatencyChartInput, latencyLegend, latencyMeta, latencySummary } from '@/components/chart/latency'
import LatencyChart from '@/components/chart/LatencyChart.vue'
import type { Wording } from '@/components/test/wording'
import { createAppI18n } from '@/i18n'

const wording: Wording = { t: createAppI18n('', ['en']).global.t as unknown as Wording['t'], locale: 'en' }
const POINTS = [
  { atMs: 230, rttMs: 3.2 },
  { atMs: 1340, rttMs: null },
  { atMs: 1450, rttMs: 2.9 },
]

function input(overrides: Partial<LatencyChartInput> = {}): LatencyChartInput {
  return { state: 'running', points: POINTS, aboutMs: 2000, ranMs: null, mark: null, readout: 'Latency 2.9 ms', ...overrides }
}

const words = (overrides: Partial<LatencyChartInput> = {}) => {
  const shown = input(overrides)
  const model = buildLatency(shown)
  return { meta: latencyMeta(shown, model, wording), summary: latencySummary(shown, model, wording) }
}

describe('the latency samples chart', () => {
  it('places each ping on the phase time, a ping without an RTT as a gap, to the estimate or past it', () => {
    expect(buildLatency(input())).toEqual({ data: [[0.23, 1.34, 1.45], [3.2, null, 2.9]], end: 1.45, xMax: 2 })
    expect(buildLatency(input({ aboutMs: 1000 })).xMax).toBe(1.45)
    // A failed phase ends where it ran to, past its last ping.
    expect(buildLatency(input({ ranMs: 1900 })).end).toBe(1.9)
    expect(buildLatency(input({ points: [] }))).toEqual({ data: [[], []], end: 0, xMax: 2 })
  })

  it('says where the phase stands, where it stopped and how, from the readout', () => {
    expect(latencyLegend(wording).map((entry) => [entry.label, entry.colour])).toEqual([['Round-trip time', 'var(--series-latency)']])
    expect(words()).toEqual({ meta: '1.5 s / ~2 s', summary: 'Latency samples: Latency 2.9 ms, 1.5 s / ~2 s' })
    expect(words({ state: 'stopped', mark: 'cancelled', readout: 'Cancelled' })).toEqual({ meta: 'stopped at 1.5 s', summary: 'Latency samples: Cancelled, stopped at 1.5 s; marked: Cancelled' })
    expect(words({ state: 'stopped', mark: 'error', ranMs: 1900, readout: 'Connection lost' }).summary).toBe('Latency samples: Connection lost, stopped at 1.9 s; marked: Connection lost')
  })

  it('mounts uPlot with its title, legend and meta, labelled by its summary', async () => {
    const wrapper = mount(LatencyChart, { props: input(), global: { plugins: [createAppI18n('', ['en'])] }, attachTo: document.body })
    const host = wrapper.get('[data-testid="latency-chart"]')
    expect(host.attributes('role')).toBe('img')
    expect(host.attributes('aria-label')).toBe('Latency samples: Latency 2.9 ms, 1.5 s / ~2 s')
    expect(host.find('.uplot').exists()).toBe(true)
    expect(wrapper.text()).toBe('Latency samples Round-trip time1.5 s / ~2 s')
    await wrapper.setProps({ state: 'stopped', mark: 'cancelled', readout: 'Cancelled' })
    await flushPromises()
    expect(wrapper.get('[data-testid="chart-meta"]').text()).toBe('stopped at 1.5 s')
    wrapper.unmount()
    expect(document.querySelector('.uplot')).toBeNull()
  })
})
