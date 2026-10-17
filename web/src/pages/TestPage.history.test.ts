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

// The Test screen's side of history (ui/flows.md section 1 step 5, ui/screens.md section 1) on an
// in-memory IndexedDB: the idle state's line to the latest saved result, and a complete result
// saved as the run ends, which the bar says.

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { getInfo } from '@/api/info'
import { useHistory } from '@/composables/useHistory'
import { useInfo } from '@/composables/useInfo'
import type { EngineEvent } from '@/engine/messages'
import { openHistoryDB } from '@/history/db'
import TestPage from '@/pages/TestPage.vue'
import { infoFixture, resultFixture } from '@/test/fixtures'
import { freshIndexedDB } from '@/test/idb'
import { mountApp } from '@/test/mount'

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

const SAVED = resultFixture({ id: 'a1b2c3d4-0000-4000-8000-000000000001', startedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), label: 'Home Wi-Fi' })

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

beforeAll(async () => {
  freshIndexedDB()
  const db = await openHistoryDB()
  await db.put('results', SAVED)
  db.close()
  vi.mocked(getInfo).mockResolvedValue(infoFixture())
  await useInfo().refresh()
})

afterEach(() => {
  StubWorker.started = []
  vi.unstubAllGlobals()
})

describe('history on the Test screen', () => {
  it('links the idle state to the latest saved result', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    await settle()
    const line = page.get('[data-testid="last-result"]')
    expect(line.text()).toBe('Last test 2h ago · ↓ 612 · ↑ 438 Mbit/s · 3.1 ms · Home Wi-Fi View')
    expect(line.attributes('href')).toBe(`/result/${SAVED.id}`)
    page.unmount()
  })

  it('saves a complete result as the run ends and says so, the line gone while it shows', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    await settle()
    await page.get('[data-testid="start-button"]').trigger('click')
    const worker = StubWorker.started[0]
    const result = resultFixture({ id: 'a1b2c3d4-0000-4000-8000-000000000002' })
    worker?.emit(
      { type: 'phase', phase: 'info', state: 'finished', notices: [] },
      { type: 'phase', phase: 'upload', state: 'finished', notices: [] },
      { type: 'result', result },
    )
    await settle()
    expect(page.get('[data-testid="result-bar"]').text()).toContain('Saved to history')
    expect(page.find('[data-testid="result-bar-body"]').exists()).toBe(false)
    expect(page.find('[data-testid="last-result"]').exists()).toBe(false)
    expect(useHistory().results.value.map((saved) => saved.id)).toContain(result.id)
    page.unmount()
  })

  it('keeps a partial result out of history', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    await settle()
    await page.get('[data-testid="start-button"]').trigger('click')
    const result = resultFixture({ id: 'a1b2c3d4-0000-4000-8000-000000000003', status: 'partial', notices: [{ code: 'stopped-early', direction: 'upload', coveredMs: 3000 }] })
    StubWorker.started[0]?.emit({ type: 'result', result })
    await settle()
    expect(page.get('[data-testid="result-bar"]').text()).toContain('Partial results are not saved')
    expect(useHistory().results.value.map((saved) => saved.id)).not.toContain(result.id)
    page.unmount()
  })
})
