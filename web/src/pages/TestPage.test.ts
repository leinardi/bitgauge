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

// The Test screen before a run: offline until GET /info answers, with Retry; then the idle state
// with the connection info. It starts the engine's Worker when it mounts, configures it with the
// server defaults under the page's base path as soon as they are known, and ends it on unmount.

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { getInfo, type Info } from '@/api/info'
import { useInfo } from '@/composables/useInfo'
import { settingsFromDefaults } from '@/lib/defaults'
import TestPage from '@/pages/TestPage.vue'
import { infoFixture } from '@/test/fixtures'
import { mountApp } from '@/test/mount'

vi.mock('@/api/info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/info')>()),
  getInfo: vi.fn(),
}))

class StubWorker extends EventTarget {
  static started: StubWorker[] = []
  readonly posted: unknown[] = []
  terminated = false

  constructor() {
    super()
    StubWorker.started.push(this)
  }

  postMessage(message: unknown): void {
    this.posted.push(message)
  }

  terminate(): void {
    this.terminated = true
  }
}

const fixture = infoFixture({ server: { basePath: '/speed' } })
const INFO: Info = {
  ...fixture,
  defaults: { ...fixture.defaults, preset: 'quick', phases: ['download', 'upload'], streams: { mode: 'fixed', fixed: 2, max: 8 }, units: 'bytes', warmup: 1500 },
}

const configure = { type: 'configure', settings: settingsFromDefaults(INFO.defaults), basePath: '/speed' }

beforeAll(() => {
  const meta = document.createElement('meta')
  meta.name = 'bitgauge-base-path'
  meta.content = '/speed'
  document.head.append(meta)
})

afterEach(() => {
  StubWorker.started = []
  vi.unstubAllGlobals()
})

// The info state is shared by the module, so the order matters: first offline, then answered.
describe('the Test screen', () => {
  it('is offline until Retry reaches the server, then configures the Worker', async () => {
    vi.stubGlobal('Worker', StubWorker)
    vi.mocked(getInfo).mockRejectedValueOnce(new TypeError('network'))
    const page = await mountApp(TestPage)
    await useInfo().refresh()
    await flushPromises()
    const [worker] = StubWorker.started
    expect(StubWorker.started).toHaveLength(1)
    expect(worker?.posted).toEqual([])
    const alert = page.get('[role="alert"]')
    expect(alert.text()).toContain('Server unreachable')
    expect(page.get('[data-testid="connection-ip"]').text()).toContain('—')
    expect(page.find('[data-testid="settings-summary"]').exists()).toBe(false)

    vi.mocked(getInfo).mockResolvedValueOnce(INFO)
    await alert.get('button').trigger('click')
    await flushPromises()
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(worker?.posted).toEqual([configure])

    page.unmount()
    expect(worker?.terminated).toBe(true)
  })

  it('shows the idle state with the connection info', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    expect(page.get('[data-testid="connection-ip"]').text()).toMatch(/192\.168\.1\.42\s*IPv4/)
    expect(page.get('[data-testid="connection-protocol"]').text()).toContain('not reported')
    expect(page.get('[data-testid="connection-streams"]').text()).toMatch(/2\s*fixed/)
    expect(page.get('[data-testid="context-label"]').text()).toBe('LAN')
    expect(page.get('[data-testid="context-label"]').attributes('aria-label')).toBe('Context: LAN')
    expect(page.get('[data-testid="settings-summary"]').text()).toBe('Quick preset · 2 streams · No data cap')
    expect(page.text()).toContain('suggested')
    page.unmount()
  })

  it('configures at once when the defaults are already known', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    expect(StubWorker.started[0]?.posted).toEqual([configure])
    page.unmount()
  })
})
