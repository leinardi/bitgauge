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

// The demo panel (frontend.md section 9), beside App.test.ts since it mounts the App and is held to
// the application's import policy: its controls, the choice it keeps and applies by loading the
// page again, and a page that boots into the chosen scenario, whose run the panel starts through
// the Start button.

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { attachWorker } from '@/demo/control'
import DemoPanel from '@/demo/DemoPanel.vue'
import { infoFor } from '@/demo/fixtures'
import { DEMO_SCENARIOS } from '@/demo/scenarios'
import { settingsFromDefaults } from '@/lib/defaults'

const STORAGE_KEY = 'bitgauge-demo'
const NAMES = Object.keys(DEMO_SCENARIOS)

/** A Worker global that records what the page posts to each Worker it starts. */
class StubWorker extends EventTarget {
  static started: { url: string; worker: StubWorker }[] = []
  readonly posted: unknown[] = []

  constructor(url: URL | string) {
    super()
    StubWorker.started.push({ url: String(url), worker: this })
  }

  postMessage(message: unknown): void {
    this.posted.push(message)
  }

  terminate(): void {}
}

beforeEach(() => {
  vi.stubGlobal('Worker', StubWorker)
  vi.stubEnv('VITE_DEMO', '1')
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  StubWorker.started = []
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/**
 * Loads the page with a stored choice, as the panel's reload does: the modules start over, so the
 * page reads its choice afresh.
 */
async function boot(stored: object) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  vi.resetModules()
  const { default: App } = await import('@/App.vue')
  const { mountApp } = await import('@/test/mount')
  return mountApp(App, '/', { props: { pagePath: '/' }, attachTo: document.body })
}

function options(select: Element): string[] {
  return [...select.querySelectorAll('option')].map((option) => option.value)
}

describe('the demo panel', () => {
  it.each([
    ['complete', 'lan', '192.168.1.42'],
    ['slowdone', 'vpn', '10.8.0.6'],
  ] as const)('boots the page into the stored %s: its Worker gets the scenario, the matching configure and start', async (scenario, link, ip) => {
    const wrapper = await boot({ scenario, speed: 2 })
    const worker = await vi.waitFor(
      () => {
        expect(StubWorker.started).toHaveLength(1)
        const [started] = StubWorker.started
        expect((started?.worker.posted as { type: string }[]).map((command) => command.type)).toEqual(expect.arrayContaining(['demo', 'configure', 'start']))
        return started
      },
      { timeout: 5000 },
    )
    expect(worker?.url).toMatch(/\/demo\/worker\.ts\b/)
    expect(worker?.worker.posted).toContainEqual({ type: 'demo', scenario, speed: 2, cpuBound: false, timerResolutionMs: 0.1, errorKind: 'requests', hold: false })
    // The configure carries the scenario's server defaults, from the page's own GET /info, which
    // the scenario's server answered.
    expect(worker?.worker.posted).toContainEqual({ type: 'configure', settings: settingsFromDefaults(infoFor(link).defaults), basePath: '/' })
    expect(wrapper.text()).toContain(ip)
    wrapper.unmount()
  })

  it('presses Start only once the Test screen offers it', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scenario: 'complete' }))
    const button = document.createElement('button')
    button.dataset.testid = 'start-button'
    button.setAttribute('aria-disabled', 'true')
    const pressed = vi.fn()
    button.addEventListener('click', pressed)
    document.body.append(button)
    const wrapper = mount(DemoPanel, { props: { navigate: vi.fn() } })
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(pressed).not.toHaveBeenCalled()
    button.removeAttribute('aria-disabled')
    await vi.waitFor(() => expect(pressed).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(pressed).toHaveBeenCalledOnce()
    wrapper.unmount()
    button.remove()
  })

  it('presses Stop when the demo Worker script asks to, and keeps that message from the engine listeners', () => {
    const button = document.createElement('button')
    button.dataset.testid = 'start-button'
    const pressed = vi.fn()
    button.addEventListener('click', pressed)
    document.body.append(button)
    const wrapper = mount(DemoPanel, { props: { navigate: vi.fn() } })
    const worker = new StubWorker('demo')
    attachWorker(worker as unknown as Worker)
    const engine = vi.fn()
    worker.addEventListener('message', engine)
    worker.dispatchEvent(new MessageEvent('message', { data: { type: 'demo-press-stop' } }))
    expect(pressed).toHaveBeenCalledOnce()
    expect(engine).not.toHaveBeenCalled()
    worker.dispatchEvent(new MessageEvent('message', { data: { type: 'phase', phase: 'idle', state: 'started' } }))
    expect(engine).toHaveBeenCalledOnce()
    wrapper.unmount()
    button.remove()
  })

  it('lists every scenario, offers every v0.1 state to force, and stays collapsed by default', async () => {
    const wrapper = mount(DemoPanel, { props: { navigate: vi.fn() } })
    expect(wrapper.find('[data-testid="demo-scenario"]').exists()).toBe(false)
    await wrapper.get('[data-testid="demo-toggle"]').trigger('click')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ open: true })
    expect(options(wrapper.get('[data-testid="demo-scenario"]').element)).toEqual(NAMES)
    expect(options(wrapper.get('[data-testid="demo-force-state"]').element)).toEqual(['', ...NAMES])
    expect(options(wrapper.get('[data-testid="demo-error-kind"]').element)).toEqual(['requests', 'unreachable', 'restarted', 'network'])
    expect(options(wrapper.get('[data-testid="demo-timer"]').element)).toEqual(['0.1', '1'])
  })

  it('keeps a choice and loads the page again with its scenario parameters', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ open: true }))
    const navigate = vi.fn()
    const wrapper = mount(DemoPanel, { props: { navigate } })
    await wrapper.get('[data-testid="demo-scenario"]').setValue('param-ignored')
    expect(navigate).toHaveBeenLastCalledWith('/?streams=12')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ scenario: 'param-ignored', forceState: '' })
    await wrapper.get('[data-testid="demo-force-state"]').setValue('upload')
    expect(navigate).toHaveBeenLastCalledWith('/')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ forceState: 'upload' })
    await wrapper.get('[data-testid="demo-speed-4"]').trigger('click')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ speed: 4 })
    await wrapper.get('[data-testid="demo-error-kind"]').setValue('restarted')
    await wrapper.get('[data-testid="demo-timer"]').setValue('1')
    await wrapper.get('[data-testid="demo-cpu"]').setValue(true)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ errorKind: 'restarted', timerResolutionMs: 1, cpuBound: true })
    expect(navigate).toHaveBeenCalledTimes(6)
  })

  it('restores only what it knows: an unknown stored value falls back to its default', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ open: true, scenario: 'continuous', speed: 3, errorKind: 'meteor', timerResolutionMs: 0 }))
    const wrapper = mount(DemoPanel, { props: { navigate: vi.fn() } })
    await flushPromises()
    expect((wrapper.get('[data-testid="demo-scenario"]').element as HTMLSelectElement).value).toBe('idle')
    expect(wrapper.get('[data-testid="demo-speed-1"]').attributes('aria-pressed')).toBe('true')
    expect((wrapper.get('[data-testid="demo-error-kind"]').element as HTMLSelectElement).value).toBe('requests')
    expect((wrapper.get('[data-testid="demo-timer"]').element as HTMLSelectElement).value).toBe('0.1')
  })
})
