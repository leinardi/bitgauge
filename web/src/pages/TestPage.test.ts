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

// The Test screen starts the engine's Worker when it mounts, configures it with the server
// defaults under the page's base path as soon as GET /info has answered, and ends it on unmount.

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Info } from '@/api/info'
import { useInfo } from '@/composables/useInfo'
import { settingsFromDefaults } from '@/lib/defaults'
import TestPage from '@/pages/TestPage.vue'
import { mountApp } from '@/test/mount'

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

const INFO = {
  server: { name: 'Basement NAS', basePath: '/speed' },
  defaults: {
    preset: 'quick',
    phases: ['download', 'upload'],
    streams: { mode: 'fixed', fixed: 2, max: 8 },
    download: { minMs: 4000, maxMs: 10_000 },
    upload: { minMs: 4000, maxMs: 10_000 },
    dataCapBytes: 100_000_000,
    units: 'bytes',
    warmup: 1500,
    pingCount: 11,
    overheadCompensationPercent: 2,
  },
} as Info

const answering = (() => Promise.resolve(new Response(JSON.stringify(INFO)))) as typeof fetch
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

// The info state is shared by the module, so the order matters: first before any answer, then after.
describe('the Test screen', () => {
  it('starts the Worker on mount and configures it once GET /info answers', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    const [worker] = StubWorker.started
    expect(StubWorker.started).toHaveLength(1)
    expect(worker?.posted).toEqual([])

    await useInfo().refresh(answering)
    await flushPromises()
    expect(worker?.posted).toEqual([configure])

    page.unmount()
    expect(worker?.terminated).toBe(true)
  })

  it('configures at once when the defaults are already known', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    expect(StubWorker.started[0]?.posted).toEqual([configure])
    page.unmount()
  })
})
