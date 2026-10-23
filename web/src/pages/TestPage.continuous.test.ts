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

// The Continuous flow on the Test screen (ui/flows.md section 7, ui/screens.md section 1), from a
// synthetic event stream through a stub Worker: the run's settings arrive with its start, as the
// Settings screen does not offer the preset yet. Running, the live view in place of the tiles with
// a dash before three fully known 1 s cells, the elapsed time, the latest data-used notice and the
// announcement, on download and on upload with its unknown cells as gaps, and the idle-latency
// tiles before it; then both endings: complete, saved, with the run-wide numbers, the grade, the
// responsiveness, the scores and every data-used notice; and partial, a stop in the warm-up, with
// Keep in history and Download JSON.

import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { getInfo } from '@/api/info'
import { useHistory } from '@/composables/useHistory'
import { useInfo } from '@/composables/useInfo'
import type { EngineEvent, Result } from '@/engine/messages'
import TestPage from '@/pages/TestPage.vue'
import { continuousResultSettings, continuousSettings, continuousStream } from '@/test/continuous'
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

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

beforeAll(async () => {
  freshIndexedDB()
  vi.mocked(getInfo).mockResolvedValue(infoFixture())
  await useInfo().refresh()
})

afterEach(() => {
  StubWorker.started = []
  vi.unstubAllGlobals()
})

/** The Test screen with a Continuous download started: idle latency done, the direction begun. */
async function started(): Promise<{ page: VueWrapper; worker: StubWorker }> {
  vi.stubGlobal('Worker', StubWorker)
  const page = await mountApp(TestPage)
  await settle()
  await page.get('[data-testid="start-button"]').trigger('click')
  const worker = StubWorker.started.at(-1) as StubWorker
  worker.emit(
    { type: 'phase', phase: 'info', state: 'finished', notices: [] },
    { type: 'phase', phase: 'idle', state: 'started', notices: [] },
    { type: 'phase', phase: 'idle', state: 'finished', idle: { path: 'websocket', lossPercent: 0, samples: [3, 3.1, 3.2, 3, 3.1], medianMs: 3.1, minMs: 3, p90Ms: 3.2, jitterMs: 0.1 }, notices: [] },
  )
  return { page, worker }
}

const tiles = (page: VueWrapper) => page.findAll('[data-testid="continuous-view"] [data-testid="metric-tile"]').map((tile) => tile.text())

function continuousResult(patch: Partial<Result>): Result {
  const base = resultFixture({ id: 'a1b2c3d4-0000-4000-8000-0000000000c1', settings: continuousResultSettings('download') })
  return { ...base, upload: { status: 'skipped', streams: 0, bytes: 0, events: [], confirmedRequests: 0 }, ...patch }
}

describe('a Continuous run on the Test screen', () => {
  it('shows its live view: a dash before three known cells, then the run-wide numbers, the elapsed time and the latest data-used notice', async () => {
    const { page, worker } = await started()
    // The stream's own settings and phase start stand in for the engine's; idle latency already ran.
    continuousStream({ direction: 'download', seconds: 30, stepS: 1, pingS: 1, warmupBuckets: 60 }, (event) => worker.emit(event))
    await settle()
    expect(page.find('[data-testid="continuous-view"]').exists()).toBe(true)
    expect(page.findAll('[data-testid="metric-tile"]').some((tile) => tile.text().startsWith('Download'))).toBe(false)
    const view = tiles(page)
    expect(view[0]).toContain('Current')
    expect(view[1]).toMatch(/^Average1\.00Mbit\/s/)
    expect(page.text()).toContain('Download · continuous')
    expect(page.text()).toContain('0:30 elapsed')
    // The polite region is written once its coalescing window has passed.
    await vi.waitFor(() => expect(page.get('[data-testid="live-region"]').text()).toContain('Continuous download running.'))
    worker.emit({ type: 'sample', direction: 'download', fromBucket: 300, values: [], gauge: 1e8, streams: 4, phaseMs: 30_000, dataUsedBytes: 2e9, notices: [{ code: 'data-used', bytes: 1e9 }] })
    worker.emit({ type: 'sample', direction: 'download', fromBucket: 300, values: [], gauge: 1e8, streams: 4, phaseMs: 30_000, dataUsedBytes: 2e10, notices: [{ code: 'data-used', bytes: 1e10 }] })
    await settle()
    const notices = page.findAll('[data-testid="notice"]').map((notice) => notice.text())
    expect(notices.filter((text) => text.includes('Data used'))).toHaveLength(1)
    expect(notices.join(' ')).toContain('The next notice appears at 100')
    page.unmount()
  })

  it('runs a Continuous upload: the sending tile, its phase, its announcement, and its unknown cells as gaps', async () => {
    const { page, worker } = await started()
    // Two failure gaps, in the steady part of the run.
    continuousStream({ direction: 'upload', seconds: 30, stepS: 1, pingS: 1, warmupBuckets: 60, gaps: [[120, 130], [200, 205]] }, (event) => worker.emit(event))
    await settle()
    const view = tiles(page)
    expect(view[0]).toMatch(/^Current · sending/)
    expect(view[1]).toMatch(/^Average1\.00Mbit\/s/)
    expect(page.text()).toContain('Upload · continuous')
    expect(page.text()).not.toContain('Download · continuous')
    expect(page.text()).toContain('0:30 elapsed · unknown cells as gaps')
    // The polite region is written once its coalescing window has passed.
    await vi.waitFor(() => expect(page.get('[data-testid="live-region"]').text()).toContain('Continuous upload running.'))
    page.unmount()
  })

  it('keeps the idle-latency tiles while idle latency runs, before the live view', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    await settle()
    await page.get('[data-testid="start-button"]').trigger('click')
    const worker = StubWorker.started.at(-1) as StubWorker
    worker.emit({ type: 'settings', scope: 'run', settings: continuousSettings('download') }, { type: 'phase', phase: 'info', state: 'finished', notices: [] }, { type: 'phase', phase: 'idle', state: 'started', notices: [] })
    await settle()
    expect(page.find('[data-testid="continuous-view"]').exists()).toBe(false)
    expect(page.findAll('[data-testid="metric-tile"]').length).toBeGreaterThan(0)
    page.unmount()
  })

  it('reads a dash, never 0, while it warms up, and until three fully known 1 s cells', async () => {
    const { page, worker } = await started()
    continuousStream({ direction: 'download', seconds: 4, stepS: 1, warmupBuckets: 60 }, (event) => worker.emit(event))
    await settle()
    expect(tiles(page).slice(1, 3)).toEqual(['Average—starts after warm-up', 'Peak · p90, last hour—starts after warm-up'])
    page.unmount()
    const later = await started()
    // Warm-up ends at 6 s; the stream sends no rate before 9 s.
    continuousStream({ direction: 'download', seconds: 8, stepS: 1, warmupBuckets: 60 }, (event) => later.worker.emit(event))
    await settle()
    expect(tiles(later.page).slice(1, 3)).toEqual(['Average—after 3 s of fully known data', 'Peak · p90, last hour—after 3 s of fully known data'])
    later.page.unmount()
  })

  it('ends complete: saved, with the run-wide numbers, the grade, the responsiveness, the scores and every data-used notice', async () => {
    const { page, worker } = await started()
    continuousStream({ direction: 'download', seconds: 20, stepS: 1 }, (event) => worker.emit(event))
    const base = continuousResult({})
    const result = continuousResult({
      download: {
        ...base.download!,
        bitsPerSecond: 921e6,
        minBitsPerSecond: 702e6,
        maxBitsPerSecond: 941e6,
        peakBitsPerSecond: 936e6,
        loadedLatency: { source: 'websocket', samples: 300, skippedTicks: 0, lost: 0, medianMs: 21, p90Ms: 27, increaseMs: 17.9, series: [] },
        responsiveness: { state: 'measured', protocol: 'h2', samples: 60, rpm: 1380, tm95Ms: 43.5, trimmed: 3, totalMedianMs: 46 },
      },
      bufferbloat: { grade: 'A', basis: 'download', increaseMs: 17.9 },
      scores: { basis: 'download', packetLoss: 'not-measured', streaming: { points: 90, band: 'great' }, gaming: { points: 70, band: 'good' }, rtc: { points: 70, band: 'good' } },
      notices: [{ code: 'data-used', bytes: 1e9 }, { code: 'data-used', bytes: 1e10 }],
    })
    worker.emit({ type: 'phase', phase: 'download', state: 'finished', result: result.download, notices: [] }, { type: 'result', result })
    await settle()
    await vi.waitFor(() => expect(page.get('[data-testid="result-bar"]').text()).toContain('Saved to history'))
    await vi.waitFor(() => expect(useHistory().results.value.map((saved) => saved.id)).toContain(result.id))
    const labels = ['Average', 'Peak · p90, last hour', 'Minimum', 'Loaded latency', 'Data used']
    expect(tiles(page).map((tile, index) => tile.startsWith(labels[index] ?? '?'))).toEqual([true, true, true, true, true])
    expect(tiles(page)[2]).toContain('702')
    expect(page.get('[data-testid="load-grade"]').text()).toBe('A')
    expect(page.findAll('[data-testid="load-row"]').map((row) => row.text())).toEqual([expect.stringContaining('last hour')])
    expect(page.get('[data-testid="load-responsiveness"]').text()).toContain('download only')
    expect(page.find('[data-testid="quality-list"]').exists()).toBe(true)
    const passed = page.findAll('[data-testid="notice"]').map((notice) => notice.text()).filter((text) => text.includes('This run passed'))
    expect(passed).toHaveLength(2)
    expect(page.get('[data-testid="result-summary"]').text()).toContain('Upload not run.')
    page.unmount()
  })

  it('ends partial after a stop in the warm-up: not saved, with Keep in history and Download JSON', async () => {
    const { page, worker } = await started()
    continuousStream({ direction: 'download', seconds: 5, stepS: 1, warmupBuckets: 60 }, (event) => worker.emit(event))
    const result = continuousResult({
      id: 'a1b2c3d4-0000-4000-8000-0000000000c2',
      status: 'partial',
      download: { status: 'insufficient-data', streams: 4, bytes: 6e6, events: [{ code: 'cancelled', atMs: 5000 }] },
      notices: [{ code: 'stopped-early', direction: 'download', coveredMs: 0 }],
    })
    worker.emit({ type: 'phase', phase: 'download', state: 'finished', result: result.download, notices: [] }, { type: 'result', result })
    await settle()
    expect(page.get('[data-testid="result-bar"]').text()).toContain('Partial results are not saved')
    expect(page.find('[data-testid="keep-in-history"]').exists()).toBe(true)
    expect(page.findAll('button').some((button) => button.text().includes('Download JSON'))).toBe(true)
    expect(tiles(page)[0]).toBe('Average—starts after warm-up')
    expect(useHistory().results.value.map((saved) => saved.id)).not.toContain(result.id)
    page.unmount()
  })
})
