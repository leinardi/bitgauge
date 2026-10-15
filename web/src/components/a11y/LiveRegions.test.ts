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

// The live regions on fake timers, driven by the run state as the Test screen binds it: the phase
// as it starts, each headline once, the rate at most every 5 s, and the result summary.

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computed, defineComponent, h } from 'vue'

import LiveRegions from '@/components/a11y/LiveRegions.vue'
import type { RunView } from '@/components/test/screen'
import { createRunState } from '@/composables/useRunState'
import type { EngineEvent, PhaseName, PhaseState } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { resultFixture } from '@/test/fixtures'

function phase(name: PhaseName, state: PhaseState, extra: Partial<Extract<EngineEvent, { type: 'phase' }>> = {}): EngineEvent {
  return { type: 'phase', phase: name, state, notices: [], ...extra }
}

function sample(gauge: number): EngineEvent {
  return { type: 'sample', direction: 'download', fromBucket: 0, values: [], gauge, streams: 1, dataUsedBytes: 0 }
}

function regions() {
  const state = createRunState()
  const Screen = defineComponent({
    setup: () => {
      const run = computed<RunView>(() => ({
        status: state.status.value,
        phase: state.phase.value,
        phases: state.phases.value,
        live: state.live.value,
        idle: state.idle.value,
        dataUsedBytes: state.dataUsedBytes.value,
        result: state.result.value,
        error: state.error.value,
      }))
      return () => h(LiveRegions, { run: run.value, units: 'bits' })
    },
  })
  const wrapper = mount(Screen, { global: { plugins: [createAppI18n('', ['en'])] } })
  const text = (id: string) => wrapper.get(`[data-testid="${id}"]`).text()
  return { state, wrapper, live: () => text('live-region'), summary: () => text('result-summary') }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the live regions', () => {
  it('are polite, atomic and visually hidden', () => {
    const { wrapper } = regions()
    for (const id of ['live-region', 'result-summary']) {
      const region = wrapper.get(`[data-testid="${id}"]`)
      expect(region.attributes('aria-live')).toBe('polite')
      expect(region.attributes('aria-atomic')).toBe('true')
    }
    expect(wrapper.get('div').classes()).toContain('sr-only')
    wrapper.unmount()
  })

  it('announce each phase as it starts, and a headline once, before the next phase', async () => {
    const { state, live, wrapper } = regions()
    state.begin()
    state.apply(phase('info', 'started'))
    await flushPromises()
    expect(live()).toBe('Connecting to the server')
    state.apply(phase('info', 'finished'))
    state.apply(phase('idle', 'started'))
    await flushPromises()
    expect(live()).toBe('Measuring idle latency')
    state.apply(phase('idle', 'finished'))
    state.apply(phase('download', 'started'))
    await flushPromises()
    expect(live()).toBe('Measuring download')
    state.apply(phase('download', 'finished', { headlineBitsPerSecond: 9.41e7 }))
    state.apply(phase('upload', 'started'))
    await flushPromises()
    expect(live()).toBe('Download result: 94.1 megabits per second Measuring upload')
    state.apply(phase('upload', 'finished'))
    await flushPromises()
    expect(live()).toBe('Upload finished without a number')
    wrapper.unmount()
  })

  it('announce the rate at most every 5 s while running, not every sample', async () => {
    const { state, live, wrapper } = regions()
    state.begin()
    state.apply(phase('info', 'started'))
    state.apply(phase('info', 'finished'))
    state.apply(phase('download', 'started'))
    await flushPromises()
    const heard: string[] = []
    for (let tick = 1; tick <= 120; tick++) {
      state.apply(sample(1e6 * tick))
      vi.advanceTimersByTime(100)
      await flushPromises()
      if (heard.at(-1) !== live()) {
        heard.push(live())
      }
    }
    expect(heard).toEqual(['Measuring download', 'Download, 50.0 megabits per second', 'Download, 100 megabits per second'])
    wrapper.unmount()
  })

  it('stop announcing the rate once the run has ended', async () => {
    const { state, live, wrapper } = regions()
    state.begin()
    state.apply(phase('info', 'started'))
    state.apply(phase('download', 'started'))
    state.apply(sample(2e7))
    await flushPromises()
    state.apply(phase('download', 'finished', { headlineBitsPerSecond: 2e7 }))
    state.apply({ type: 'result', result: resultFixture() })
    await flushPromises()
    vi.advanceTimersByTime(20_000)
    await flushPromises()
    expect(live()).toBe('Download result: 20.0 megabits per second')
    wrapper.unmount()
  })

  it('read the result summary once it is ready, and clear it when the next run starts', async () => {
    const { state, summary, live, wrapper } = regions()
    state.begin()
    state.apply(phase('info', 'started'))
    state.apply({ type: 'result', result: resultFixture() })
    await flushPromises()
    expect(summary()).toBe(
      'Test complete. Download 612 megabits per second. Upload 438 megabits per second. Idle latency 3.1 milliseconds, jitter 0.4 milliseconds. Data used 1.3 gigabytes.',
    )
    state.begin()
    await flushPromises()
    expect(summary()).toBe('')
    expect(live()).toBe('')
    wrapper.unmount()
  })
})
