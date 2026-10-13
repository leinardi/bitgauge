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

// The gauge component: the exact readout with three significant digits, the caption naming the
// window, the window it moves itself, its marks per direction, and the transitions reduced motion
// turns off.

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import CountdownRing from '@/components/gauge/CountdownRing.vue'
import Gauge from '@/components/gauge/Gauge.vue'
import { createAppI18n } from '@/i18n'

function gauge(props: Partial<InstanceType<typeof Gauge>['$props']>) {
  return mount(Gauge, {
    props: { mode: 'rate', units: 'bits', value: null, label: 'Download', window: 6, ...props },
    global: { plugins: [createAppI18n('', ['en'])] },
  })
}

/** A frame queue the test runs by hand, at the timestamps it chooses. */
function frames() {
  const queue: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => queue.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  return (now: number) => queue.splice(0).forEach((callback) => callback(now))
}

function reducedMotion(matches: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the gauge', () => {
  it('reads out the exact value with three significant digits and names the window', async () => {
    const wrapper = gauge({ value: 94_123_456, direction: 'download' })
    expect(wrapper.get('[data-testid="gauge-number"]').text()).toBe('94.1')
    expect(wrapper.get('[data-testid="gauge-unit"]').text()).toBe('Mbit/s')
    expect(wrapper.get('[data-testid="gauge-label"]').text()).toBe('Download')
    expect(wrapper.get('[data-testid="gauge-caption"]').text()).toBe('log scale · 1 Mbit/s – 10 Gbit/s · auto')
  })

  it('keeps the readout exact outside the window, where the needle pins', async () => {
    const wrapper = gauge({ value: 23_400_000_000, direction: 'download' })
    expect(wrapper.get('[data-testid="gauge-number"]').text()).toBe('23.4')
    expect(wrapper.get('[data-testid="gauge-unit"]').text()).toBe('Gbit/s')
    expect(wrapper.get('[data-testid="gauge-needle"]').attributes('style')).toContain('rotate(270deg)')
  })

  it('reads bytes in byte units and byte windows', async () => {
    const wrapper = gauge({ units: 'bytes', window: 5, value: 800_000_000, direction: 'upload' })
    expect(wrapper.get('[data-testid="gauge-number"]').text()).toBe('100')
    expect(wrapper.get('[data-testid="gauge-unit"]').text()).toBe('MB/s')
    expect(wrapper.get('[data-testid="gauge-caption"]').text()).toBe('log scale · 100 kB/s – 1 GB/s · auto')
  })

  it('switches to the fixed milliseconds scale for idle latency', async () => {
    const wrapper = gauge({ mode: 'ms', value: 9.42, label: 'Idle latency' })
    expect(wrapper.get('[data-testid="gauge-number"]').text()).toBe('9.4')
    expect(wrapper.get('[data-testid="gauge-unit"]').text()).toBe('ms')
    expect(wrapper.get('[data-testid="gauge-caption"]').text()).toBe('log scale · 1 – 1000 ms')
  })

  it('shows a dash and no needle before the first value', async () => {
    const wrapper = gauge({})
    expect(wrapper.get('[data-testid="gauge-number"]').text()).toBe('—')
    expect(wrapper.find('[data-testid="gauge-unit"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="gauge-needle"]').exists()).toBe(false)
  })

  it('moves its window after the dwell, sample time by sample time', async () => {
    const wrapper = gauge({ value: 5e6, at: 0, direction: 'download', 'onUpdate:window': (k: number) => wrapper.setProps({ window: k }) })
    for (let ms = 100; ms <= 1900; ms += 100) {
      await wrapper.setProps({ at: ms })
    }
    expect(wrapper.emitted('update:window')).toBeUndefined()
    await wrapper.setProps({ at: 2000 })
    expect(wrapper.emitted('update:window')).toEqual([[5]])
    expect(wrapper.get('[data-testid="gauge-caption"]').text()).toBe('log scale · 100 kbit/s – 1 Gbit/s · auto')
  })

  it('draws the band of the recent values, and the peak tick only on download after warm-up', async () => {
    const wrapper = gauge({ value: 5e8, at: 0, direction: 'download' })
    expect(wrapper.find('[data-testid="gauge-band"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="gauge-peak"]').exists()).toBe(false)
    await wrapper.setProps({ value: 6e8, at: 100, peak: 5.8e8 })
    expect(wrapper.find('[data-testid="gauge-band"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="gauge-peak"]').exists()).toBe(true)
    // Upload shows sending progress: no tick, and a band of its own values only.
    await wrapper.setProps({ direction: 'upload', value: 2e8, at: 200 })
    expect(wrapper.find('[data-testid="gauge-peak"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="gauge-band"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="gauge-inner"]').exists()).toBe(false)
    await wrapper.setProps({ inner: 1.9e8 })
    expect(wrapper.find('[data-testid="gauge-inner"]').exists()).toBe(true)
  })

  it('hides the decoration from assistive technology and drops its transitions under reduced motion', async () => {
    const wrapper = gauge({ value: 5e8, direction: 'download' })
    expect(wrapper.get('[data-testid="gauge-arc"]').attributes('aria-hidden')).toBe('true')
    for (const part of ['gauge-needle', 'gauge-fill']) {
      const classes = wrapper.get(`[data-testid="${part}"]`).classes()
      expect(classes.some((name) => name.startsWith('transition'))).toBe(true)
      expect(classes).toContain('motion-reduce:transition-none')
    }
    expect(wrapper.find('[aria-live]').exists()).toBe(false)
  })

  it('leaves no decorative part in the accessibility tree: only the label, readout and caption', async () => {
    // Every part drawn at once: arc, ticks and their labels, band, value arc, inner arc, peak tick, needle.
    const wrapper = gauge({ value: 5e8, at: 0, direction: 'download', inner: 1.9e8 })
    await wrapper.setProps({ value: 6e8, at: 100, peak: 5.8e8 })
    const parts = ['gauge-band', 'gauge-fill', 'gauge-inner', 'gauge-peak', 'gauge-needle']
    parts.forEach((part) => expect(wrapper.find(`[data-testid="${part}"]`).exists()).toBe(true))
    const hidden = (element: Element) => element.closest('[aria-hidden="true"]') !== null
    const svg = wrapper.get('svg').element
    expect([svg, ...svg.querySelectorAll('*')].every(hidden)).toBe(true)
    const exposed = [...wrapper.element.querySelectorAll('[data-testid]')].filter((element) => !hidden(element)).map((element) => element.getAttribute('data-testid'))
    expect(exposed).toEqual(['gauge-label', 'gauge-number', 'gauge-unit', 'gauge-caption'])
    wrapper.unmount()
    const ring = mount(CountdownRing, { props: { remainingMs: 2500, totalMs: 3000 }, global: { plugins: [createAppI18n('', ['en'])] } })
    expect(ring.get('svg').attributes('aria-hidden')).toBe('true')
    ring.unmount()
  })

  it('draws the value arc as a fraction of the track', () => {
    const wrapper = gauge({ value: 1e8, direction: 'download' })
    const fill = wrapper.get('[data-testid="gauge-fill"]')
    expect(fill.attributes('pathLength')).toBe('1')
    expect(fill.attributes('stroke-dasharray')).toBe('0.5 1')
  })

  it('tweens a window shift, ticks and needle together, and jumps under reduced motion', async () => {
    reducedMotion(false)
    const run = frames()
    const wrapper = gauge({ value: 5e6, direction: 'download' })
    await wrapper.setProps({ window: 5 })
    const arc = wrapper.get('[data-testid="gauge-arc"]')
    expect(arc.attributes('data-window')).toBe('6')
    expect(wrapper.get('[data-testid="gauge-needle"]').classes()).toContain('transition-none')
    run(1000)
    run(1140)
    await nextTick()
    const halfway = Number(arc.attributes('data-window'))
    expect(halfway).toBeGreaterThan(5)
    expect(halfway).toBeLessThan(6)
    run(1280)
    await nextTick()
    expect(arc.attributes('data-window')).toBe('5')
    expect(wrapper.get('[data-testid="gauge-needle"]').classes()).toContain('motion-reduce:transition-none')

    reducedMotion(true)
    await wrapper.setProps({ window: 4 })
    expect(arc.attributes('data-window')).toBe('4')
  })

  it('starts a new band and hold when the value goes back to none, as between runs', async () => {
    const wrapper = gauge({ value: 5e8, at: 0, direction: 'download', 'onUpdate:window': (k: number) => wrapper.setProps({ window: k }) })
    await wrapper.setProps({ value: 6e8, at: 100 })
    expect(wrapper.find('[data-testid="gauge-band"]').exists()).toBe(true)
    // A hold in the bottom decade begins, then the run ends.
    await wrapper.setProps({ value: 5e6, at: 200 })
    await wrapper.setProps({ value: null, at: null })
    await wrapper.setProps({ value: 5e6, at: 2300 })
    expect(wrapper.find('[data-testid="gauge-band"]').exists()).toBe(false)
    expect(wrapper.emitted('update:window')).toBeUndefined()
    await wrapper.setProps({ at: 4300 })
    expect(wrapper.emitted('update:window')).toEqual([[5]])
  })

  it('labels the milliseconds scale with whole numbers', () => {
    const wrapper = gauge({ mode: 'ms', value: 20, label: 'Idle latency' })
    const labels = wrapper.findAll('text').map((label) => label.text())
    expect(labels).toEqual(['1', '10', '100', '1000'])
  })
})
