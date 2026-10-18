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

// A smoke test of the live chart under jsdom, whose canvas has no 2D context: the test setup's stub
// context takes every call. It checks the chart mounts, follows the run's data, names itself for assistive
// technology, shows its title, legend and meta line, and goes away with the component.

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { defineComponent, h, reactive } from 'vue'

import ThroughputChart from '@/components/chart/ThroughputChart.vue'
import { createRunState, type DirectionLive } from '@/composables/useRunState'
import { createAppI18n } from '@/i18n'

const DURATIONS = { download: { minMs: 10_000, maxMs: 20_000 }, upload: { minMs: 15_000, maxMs: 25_000 } }

function live(overrides: Partial<DirectionLive>): DirectionLive {
  return { firstBucket: 0, values: [], windowEnd: null, gauge: 0, sending: null, steady: null, warmupEnd: null, start: null, sendingTrace: [], streams: 1, phaseMs: 0, ...overrides }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function chart(props: Partial<InstanceType<typeof ThroughputChart>['$props']> = {}) {
  return mount(ThroughputChart, {
    props: { order: ['download', 'upload'], live: { download: null, upload: null }, units: 'bits', state: 'running', durations: DURATIONS, ...props },
    global: { plugins: [createAppI18n('', ['en'])] },
    attachTo: document.body,
  })
}

describe('the throughput chart', () => {
  it('mounts uPlot, follows the run state it is given and summarizes it from the readout', async () => {
    // The chart as the Test screen binds it: the run state's live record, replaced per sample.
    const state = createRunState()
    state.begin()
    const props = reactive({ state: 'empty' as const, readout: null as string | null })
    const Screen = defineComponent({
      setup: () => () =>
        h(ThroughputChart, { order: ['download', 'upload'], live: state.live.value, units: 'bits', state: props.state, durations: DURATIONS, readout: props.readout }),
    })
    const wrapper = mount(Screen, { global: { plugins: [createAppI18n('', ['en'])] }, attachTo: document.body })
    const host = wrapper.get('[data-testid="throughput-chart"]')
    expect(host.attributes('role')).toBe('img')
    expect(host.attributes('aria-label')).toBe('Throughput: no data yet')
    expect(host.find('.uplot').exists()).toBe(true)
    // The empty chart still draws its frame: up to 1 Gbit/s over the minimum durations, in one unit.
    expect(wrapper.findAll('[aria-hidden="true"] > span').map((label) => label.text())).toEqual(['0', '0.25', '0.50', '0.75', '1.00\u00a0Gbit/s', '0s', '5s', '10s', '15s', '20s', '25s'])
    expect(wrapper.get('[data-testid="throughput-chart"] + div + div').text()).toBe('Throughput over time appears here while the test runs.')
    expect(wrapper.find('figure').exists()).toBe(false)

    state.apply({ type: 'sample', direction: 'download', fromBucket: 0, values: [1_176_250, 1_176_250], gauge: 9.41e7, streams: 1, phaseMs: 0, warmupEndBucket: 1, dataUsedBytes: 2_352_500 })
    state.apply({ type: 'sample', direction: 'upload', fromBucket: 0, values: [], gauge: 2e7, streams: 1, phaseMs: 0, sending: 2e7, dataUsedBytes: 2_400_000 })
    state.apply({ type: 'sample', direction: 'upload', fromBucket: 40, values: [125_000], gauge: 2e7, streams: 1, phaseMs: 0, sending: 2e7, startBucket: 40, sendingBucket: 41.2, dataUsedBytes: 2_500_000 })
    Object.assign(props, { state: 'running', readout: 'Upload · sending 20.0 Mbit/s' })
    await flushPromises()
    expect(host.attributes('aria-label')).toBe('Throughput: Upload · sending 20.0 Mbit/s, 0.4 s / 15.2 s; warm-up shaded')
    expect(wrapper.text()).toContain('Download Upload · received Upload · sending Latency under load Warm-up')
    expect(wrapper.get('[data-testid="chart-meta"]').text()).toBe('0.4 s / 15.2 s')

    wrapper.unmount()
    expect(document.querySelector('.uplot')).toBeNull()
  })

  it('keeps the planned time axis for a run that stopped, and ends a finished run where it did', async () => {
    const download = live({ values: [1_176_250, 1_176_250], warmupEnd: 1 })
    const labels = (wrapper: ReturnType<typeof chart>) => wrapper.findAll('[aria-hidden="true"] > span').map((label) => label.text())
    const stopped = chart({ order: ['download'], live: { download, upload: null }, state: 'stopped' })
    await flushPromises()
    expect(labels(stopped)).toContain('10s')
    stopped.unmount()
    const done = chart({ order: ['download'], live: { download, upload: null }, state: 'done' })
    await flushPromises()
    expect(labels(done)).not.toContain('10s')
    done.unmount()
  })

  it('draws the loaded latency on its second scale, labeled right of the plot, until its toggle turns it off', async () => {
    const download = live({ values: Array.from({ length: 30 }, () => 1_176_250), warmupEnd: 10 })
    const loaded = { download: Array.from({ length: 10 }, (_, index) => ({ at: index * 3, ms: 18 + index })) }
    const wrapper = chart({ order: ['download'], live: { download, upload: null }, loaded, readout: 'Download 94.1 Mbit/s' })
    await flushPromises()
    const host = wrapper.get('[data-testid="throughput-chart"]')
    const toggle = wrapper.get('[data-testid="latency-toggle"]')
    expect(toggle.element.tagName).toBe('BUTTON')
    expect(toggle.text()).toBe('Latency under load')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(toggle.get('span').classes()).toContain('border-dashed')
    expect(host.attributes('aria-label')).toContain('; latency under load on a second scale')
    const right = () => wrapper.findAll('.text-\\(--series-latency\\)').map((label) => label.text())
    expect(right()).toEqual(['0', '30', '60\u00a0ms'])
    await toggle.trigger('click')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    expect(host.attributes('aria-label')).not.toContain('latency under load')
    expect(right()).toEqual([])
    wrapper.unmount()
  })

  it('lists the latency toggle before the first ping, with nothing on a second scale', async () => {
    const wrapper = chart({ order: ['download'], live: { download: live({ values: [1] }), upload: null } })
    await flushPromises()
    expect(wrapper.get('[data-testid="latency-toggle"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="throughput-chart"]').attributes('aria-label')).not.toContain('latency under load')
    expect(wrapper.findAll('.text-\\(--series-latency\\)')).toEqual([])
    wrapper.unmount()
  })

  it('cross-fades a new phase from a painted faded frame, which reduced motion turns off', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
    const wrapper = chart({ live: { download: live({ values: [1] }), upload: null } })
    const host = wrapper.get('[data-testid="throughput-chart"]')
    expect(host.classes()).toContain('motion-reduce:transition-none')
    await wrapper.setProps({ live: { download: live({ values: [1] }), upload: live({ firstBucket: 5, values: [1] }) } })
    expect(host.classes()).toContain('opacity-40')
    frames.splice(0).forEach((callback) => callback(0))
    await flushPromises()
    expect(host.classes()).toContain('opacity-40')
    frames.splice(0).forEach((callback) => callback(16))
    await flushPromises()
    expect(host.classes()).toContain('opacity-100')
    wrapper.unmount()
  })
})
