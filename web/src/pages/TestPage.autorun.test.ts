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

// The Test screen opened from a link (ui/flows.md section 2): the URL's settings go to the engine
// with configure, an invalid value shows as the URL parameter ignored notice, and once the engine
// has answered with the settings a 3 s countdown starts the run with the URL's label and the
// ignored parameters; Escape cancels it and Start then runs the same settings. The settings stored
// on the Settings screen sit under the URL's, and a stored Auto-start counts down as `run=1` does.
// Run again on a Result detail starts its result's settings at once. Each test loads the page
// afresh, since the URL applies once per page load.

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { getInfo, type Info } from '@/api/info'
import type { EngineEvent, TestSettings } from '@/engine/messages'
import { settingsFromDefaults } from '@/lib/defaults'
import { infoFixture, resultFixture } from '@/test/fixtures'

vi.mock('@/api/info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/info')>()),
  getInfo: vi.fn(),
}))

class StubWorker extends EventTarget {
  static started: StubWorker[] = []
  readonly posted: unknown[] = []

  constructor() {
    super()
    StubWorker.started.push(this)
  }

  postMessage(message: unknown): void {
    this.posted.push(message)
  }

  terminate(): void {}

  emit(...events: EngineEvent[]): void {
    events.forEach((event) => this.dispatchEvent(new MessageEvent('message', { data: event })))
  }
}

const INFO: Info = infoFixture()
const DEFAULTS = settingsFromDefaults(INFO.defaults) as TestSettings
const QUICK: TestSettings = { ...DEFAULTS, preset: 'quick', phases: ['idle', 'download'], pingCount: 10, download: { minMs: 5000, maxMs: 10_000 }, upload: { minMs: 5000, maxMs: 10_000 } }

/** The page loaded afresh at `search`, with its Worker; `before` runs on the fresh modules before it mounts. */
async function load(search: string, before?: () => Promise<void>) {
  window.history.replaceState(null, '', `/${search}`)
  vi.resetModules()
  await before?.()
  vi.stubGlobal('Worker', StubWorker)
  vi.mocked(getInfo).mockResolvedValue(INFO)
  const { useInfo } = await import('@/composables/useInfo')
  await useInfo().refresh()
  const { mountApp } = await import('@/test/mount')
  const { default: TestPage } = await import('@/pages/TestPage.vue')
  const page = await mountApp(TestPage, `/${search}`)
  const worker = StubWorker.started.at(-1)
  if (worker === undefined) {
    throw new Error('no Worker')
  }
  return { page, worker }
}

// The page's module graph, transformed once, so no test pays for the cold import within its timeout.
beforeAll(async () => {
  await import('@/pages/TestPage.vue')
}, 60_000)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
})

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  StubWorker.started = []
  window.history.replaceState(null, '', '/')
})

describe('a link with run', () => {
  it('words an ignored value as the export does, and hides it for the page load once dismissed', async () => {
    const { page, worker } = await load('?streams=12')
    worker.emit({ type: 'settings', scope: 'configured', settings: DEFAULTS })
    await flushPromises()
    const notice = page.get('[data-testid="notice"]')
    expect(notice.text()).toContain('streams=12 ignored, allowed 1–6. Streams stay on Auto; the other parameters from the link were applied.')
    expect(notice.get('button').text()).toBe('Dismiss')
    await notice.get('button').trigger('click')
    expect(page.find('[data-testid="notice"]').exists()).toBe(false)
    page.unmount()

    // Back on the Test screen from another screen, in the same page load, it stays dismissed.
    const { mountApp } = await import('@/test/mount')
    const { default: TestPage } = await import('@/pages/TestPage.vue')
    const again = await mountApp(TestPage, '/?streams=12')
    await flushPromises()
    expect(again.find('[data-testid="notice"]').exists()).toBe(false)
    again.unmount()
  })

  it('configures the URL settings, names the ignored value, and starts after the countdown', async () => {
    const { page, worker } = await load('?Run=1&preset=QUICK&test=download&streams=9&label=VPN&unknown=1')
    expect(worker.posted).toEqual([{ type: 'configure', settings: DEFAULTS, override: { phases: ['idle', 'download'], preset: 'quick' }, basePath: '/' }])
    expect(page.get('[data-testid="notice"]').text()).toContain('URL parameter ignored')
    expect(page.get('[data-testid="notice"]').text()).toContain('streams')
    // No countdown until the engine has the URL's settings.
    expect(page.find('[data-testid="countdown"]').exists()).toBe(false)

    worker.emit({ type: 'settings', scope: 'configured', settings: QUICK })
    await flushPromises()
    expect(page.get('[data-testid="countdown-number"]').text()).toBe('3')
    expect(page.get('[data-testid="auto-start"]').text()).toContain('Auto-start in 3 s')
    expect(page.get('[data-testid="start-button"]').text()).toContain('Start now')
    expect(page.get('[data-testid="settings-summary"]').text()).toContain('Quick')
    expect(page.findAll('[data-testid="phase-indicator"] li')).toHaveLength(2)

    vi.advanceTimersByTime(1000)
    await flushPromises()
    expect(page.get('[data-testid="countdown-number"]').text()).toBe('2')
    worker.posted.length = 0
    vi.advanceTimersByTime(2000)
    await flushPromises()
    expect(worker.posted).toEqual([{ type: 'start', override: { contextLabel: 'LAN', ignoredParameters: [{ parameter: 'streams', value: '9' }], label: 'VPN' }, visible: true }])
    expect(page.find('[data-testid="countdown"]').exists()).toBe(false)
    expect(page.get('[data-testid="start-button"]').text()).toContain('Stop test')
    page.unmount()
  })

  it('cancels on Escape, and Start then runs the URL settings', async () => {
    const { page, worker } = await load('?run&label=Office')
    worker.emit({ type: 'settings', scope: 'configured', settings: DEFAULTS })
    await flushPromises()
    expect(page.find('[data-testid="countdown"]').exists()).toBe(true)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(page.find('[data-testid="countdown"]').exists()).toBe(false)
    vi.advanceTimersByTime(5000)
    worker.posted.length = 0
    await page.get('[data-testid="start-button"]').trigger('click')
    expect(worker.posted).toEqual([{ type: 'start', override: { contextLabel: 'LAN', label: 'Office' }, visible: true }])
    page.unmount()
  })

  it('starts now on Enter, and the cancel button stops a countdown', async () => {
    const { page, worker } = await load('?run=true')
    worker.emit({ type: 'settings', scope: 'configured', settings: DEFAULTS })
    await flushPromises()
    worker.posted.length = 0
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(worker.posted).toEqual([{ type: 'start', override: { contextLabel: 'LAN' }, visible: true }])
    page.unmount()

    const again = await load('?run=1')
    again.worker.emit({ type: 'settings', scope: 'configured', settings: DEFAULTS })
    await flushPromises()
    await again.page.get('[data-testid="auto-start-cancel"]').trigger('click')
    vi.advanceTimersByTime(5000)
    expect(again.worker.posted.filter((message) => (message as { type: string }).type === 'start')).toEqual([])
    expect(again.page.get('[data-testid="start-button"]').text()).toContain('Start test')
    again.page.unmount()
  })

  it('does not count down without run, or with run=0', async () => {
    for (const search of ['?preset=quick', '?run=0']) {
      const { page, worker } = await load(search)
      worker.emit({ type: 'settings', scope: 'configured', settings: DEFAULTS })
      await flushPromises()
      expect(page.find('[data-testid="countdown"]').exists()).toBe(false)
      page.unmount()
    }
  })
})

describe('the stored settings', () => {
  const STORED = { preset: 'extended', label: 'Home', autoStart: { enabled: true, countdownS: 5 } }
  const EXTENDED: TestSettings = { ...DEFAULTS, preset: 'extended', download: { minMs: 20_000, maxMs: 40_000 }, upload: { minMs: 20_000, maxMs: 40_000 }, pingCount: 50 }

  it('configure the Worker, label the run and count down from their own length', async () => {
    localStorage.setItem('bitgauge.settings.v1', JSON.stringify(STORED))
    const { page, worker } = await load('')
    expect(worker.posted).toEqual([{ type: 'configure', settings: EXTENDED, basePath: '/' }])
    worker.emit({ type: 'settings', scope: 'configured', settings: EXTENDED })
    await flushPromises()
    expect(page.get('[data-testid="countdown-number"]').text()).toBe('5')
    expect(page.get('[data-testid="auto-start"]').text()).toContain('Auto-start is on in Settings')
    worker.posted.length = 0
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(worker.posted).toEqual([{ type: 'start', override: { contextLabel: 'LAN', label: 'Home' }, visible: true }])
    page.unmount()
  })

  it('lie under the URL parameters, and run=0 holds a stored Auto-start for the load', async () => {
    localStorage.setItem('bitgauge.settings.v1', JSON.stringify(STORED))
    const { page, worker } = await load('?run=0&preset=quick&label=VPN')
    expect(worker.posted).toEqual([{ type: 'configure', settings: EXTENDED, override: { preset: 'quick' }, basePath: '/' }])
    worker.emit({ type: 'settings', scope: 'configured', settings: QUICK })
    await flushPromises()
    expect(page.find('[data-testid="countdown"]').exists()).toBe(false)
    worker.posted.length = 0
    await page.get('[data-testid="start-button"]').trigger('click')
    expect(worker.posted).toEqual([{ type: 'start', override: { contextLabel: 'LAN', label: 'VPN' }, visible: true }])
    page.unmount()
  })
})

describe('Run again from a Result detail', () => {
  it("starts the result's settings and label once the engine is configured, with no countdown", async () => {
    const result = resultFixture({ label: 'Desk', settings: { ...resultFixture().settings, preset: 'quick', phases: ['idle', 'download'], pingCount: 10, streams: { mode: 'fixed', max: 6 } } })
    const { page, worker } = await load('', async () => {
      const { requestRunAgain } = await import('@/composables/useRunAgain')
      requestRunAgain(result)
    })
    expect(worker.posted.some((message) => (message as { type: string }).type === 'start')).toBe(false)
    worker.emit({ type: 'settings', scope: 'configured', settings: DEFAULTS })
    await flushPromises()
    const start = worker.posted.find((message) => (message as { type: string }).type === 'start')
    expect(start).toMatchObject({
      type: 'start',
      override: { label: 'Desk', preset: 'quick', phases: ['idle', 'download'], pingCount: 10, streams: { mode: 'fixed', max: 6, fixed: 6 }, dataCapBytes: null, warmup: 'auto', overheadCompensationPercent: 0 },
    })
    expect(page.find('[data-testid="countdown"]').exists()).toBe(false)
    page.unmount()
  })
})
