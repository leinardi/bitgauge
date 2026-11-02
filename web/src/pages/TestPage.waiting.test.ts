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

// The Test screen before GET /api/v1/info answers: the server is not known to be unreachable,
// Start waits for its default settings, and the gauge says so instead of Ready.

import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getInfo, type Info } from '@/api/info'
import { useInfo } from '@/composables/useInfo'
import type { EngineEvent } from '@/engine/messages'
import TestPage from '@/pages/TestPage.vue'
import { infoFixture } from '@/test/fixtures'
import { mountApp } from '@/test/mount'

vi.mock('@/api/info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/info')>()),
  getInfo: vi.fn(),
}))

class StubWorker extends EventTarget {
  static started: StubWorker[] = []

  constructor() {
    super()
    StubWorker.started.push(this)
  }

  postMessage(): void {}
  terminate(): void {}

  emit(...events: EngineEvent[]): void {
    events.forEach((event) => this.dispatchEvent(new MessageEvent('message', { data: event })))
  }
}

afterEach(() => {
  StubWorker.started = []
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('the Test screen before the server answers', () => {
  it('reads Waiting for the server, then Ready once the defaults arrive', async () => {
    vi.stubGlobal('Worker', StubWorker)
    let answer: (info: Info) => void = () => undefined
    vi.mocked(getInfo).mockReturnValueOnce(new Promise<Info>((resolve) => (answer = resolve)))
    const page = await mountApp(TestPage)
    const checked = useInfo().refresh()
    await flushPromises()
    expect(getInfo).toHaveBeenCalledOnce()
    expect(page.get('[data-testid="gauge-text"]').text()).toContain('Waiting for the server')
    expect(page.get('[data-testid="gauge-text"]').text()).not.toContain('Ready')
    answer(infoFixture())
    await checked
    await flushPromises()
    expect(page.get('[data-testid="gauge-text"]').text()).toContain('Ready')
    page.unmount()
  })

  it('shows an ignored parameter only once the defaults arrive, and keeps its box when a run starts', async () => {
    // The URL parameters are read once per page load: a fresh module graph at the link.
    window.history.replaceState(null, '', '/?cap=1MB')
    vi.resetModules()
    vi.stubGlobal('Worker', StubWorker)
    let answer: (info: Info) => void = () => undefined
    vi.mocked(getInfo).mockReturnValueOnce(new Promise<Info>((resolve) => (answer = resolve)))
    const fresh = { info: await import('@/composables/useInfo'), mount: await import('@/test/mount'), page: await import('@/pages/TestPage.vue') }
    const page = await fresh.mount.mountApp(fresh.page.default, '/?cap=1MB')
    const checked = fresh.info.useInfo().refresh()
    await flushPromises()
    // Before GET /info answers no body is rendered from settings it does not have yet (QA-105).
    expect(page.find('[data-testid="notice"]').exists()).toBe(false)
    answer(infoFixture())
    await checked
    await flushPromises()
    const box = page.get('[data-testid="notice"]')
    expect(box.text()).toContain('The data cap stays on none')
    const body = box.text()
    await page.get('[data-testid="start-button"]').trigger('click')
    await flushPromises()
    // The run started: the same box, until the run's first phase event brings its own notice.
    expect(page.get('[data-testid="notice"]').element).toBe(box.element)
    const worker = StubWorker.started.at(-1) as StubWorker
    worker.emit({ type: 'phase', phase: 'info', state: 'started', notices: [{ code: 'url-parameter-ignored', parameter: 'cap', value: '1MB' }] })
    await flushPromises()
    expect(page.findAll('[data-testid="notice"]')).toHaveLength(1)
    expect(page.get('[data-testid="notice"]').element).toBe(box.element)
    expect(page.get('[data-testid="notice"]').text()).toBe(body)
    page.unmount()
  })
})
