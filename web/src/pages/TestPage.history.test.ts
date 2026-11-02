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
// in-memory IndexedDB: the idle state's line to the latest saved result, a complete result saved
// as the run ends, which the bar says, with its label saved as typed; a partial one kept in memory
// for its Result detail, and in history once the user keeps it.

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { getInfo } from '@/api/info'
import { useHistory } from '@/composables/useHistory'
import { useInfo } from '@/composables/useInfo'
import { lastRunResult, takeEndedRun } from '@/composables/useRun'
import { requestRunAgain } from '@/composables/useRunAgain'
import type { EngineEvent, Result } from '@/engine/messages'
import { openHistoryDB } from '@/history/db'
import { settingsFromDefaults } from '@/lib/defaults'
import ResultDetailPage from '@/pages/ResultDetailPage.vue'
import TestPage from '@/pages/TestPage.vue'
import { continuousResultSettings, continuousStream } from '@/test/continuous'
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
  // A run a test left ended Cancelled or Error would show again on the next test's screen.
  takeEndedRun()
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
    // Kept in memory for its Result detail, which Details opens.
    expect(lastRunResult.value?.id).toBe(result.id)
    expect(page.get('[data-testid="result-details"]').attributes('href')).toBe(`/result/${result.id}`)
    page.unmount()
  })

  it('saves the label typed in the save bar, and suggests the labels of history', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    await settle()
    await page.get('[data-testid="start-button"]').trigger('click')
    const result = resultFixture({ id: 'a1b2c3d4-0000-4000-8000-000000000004' })
    StubWorker.started[0]?.emit({ type: 'result', result })
    await settle()
    expect(page.findAll('[data-testid="label-suggestion"]').map((chip) => chip.text())).toEqual(['LAN', 'Home Wi-Fi'])
    const field = page.get('[data-testid="result-label-field"]')
    await field.setValue('Attic')
    await field.trigger('blur')
    await settle()
    expect(useHistory().results.value.find((saved) => saved.id === result.id)?.label).toBe('Attic')
    page.unmount()
  })

  it('keeps a partial result in history when the user chooses Keep in history', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    await settle()
    await page.get('[data-testid="start-button"]').trigger('click')
    const result = resultFixture({ id: 'a1b2c3d4-0000-4000-8000-000000000005', status: 'partial', notices: [{ code: 'stopped-early', direction: 'upload', coveredMs: 3000 }] })
    StubWorker.started[0]?.emit({ type: 'result', result })
    await settle()
    await page.get('[data-testid="keep-in-history"]').trigger('click')
    await settle()
    expect(page.get('[data-testid="result-bar"] [role="status"]').text()).toBe('Saved as partial')
    expect(page.text()).toContain('Partial results · saved as partial')
    expect(page.text()).not.toContain('Partial results · not saved')
    expect(useHistory().results.value.find((saved) => saved.id === result.id)?.status).toBe('partial')
    page.unmount()
  })

  it('shows the load card: pending, the live loaded latency, then the grade of the result', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    await settle()
    const card = () => page.get('[data-testid="load-card"]')
    expect(card().text()).toContain('Graded after upload')
    expect(page.findAll('[data-testid="load-row"]').map((row) => row.text())).toEqual(['During downloadPending—', 'During uploadPending—'])
    await page.get('[data-testid="start-button"]').trigger('click')
    const worker = StubWorker.started[0]
    worker?.emit(
      { type: 'phase', phase: 'download', state: 'started', notices: [] },
      { type: 'sample', direction: 'download', fromBucket: 0, values: [1000], gauge: 1e6, streams: 1, phaseMs: 400, dataUsedBytes: 1000, loadedLatency: [{ atMs: 100, rttMs: 18 }, { atMs: 300, rttMs: 22 }] },
    )
    await settle()
    const live = page.findAll('[data-testid="load-row"]')[0]
    expect(live?.text()).toContain('During download')
    expect(live?.find('[data-live]').text()).toBe('20ms')
    const base = resultFixture()
    const loaded = { source: 'websocket' as const, samples: 40, skippedTicks: 0, lost: 0, medianMs: 18, p90Ms: 24, increaseMs: 14.9, series: [] }
    worker?.emit({ type: 'result', result: resultFixture({ id: 'a1b2c3d4-0000-4000-8000-000000000006', download: { ...base.download!, loadedLatency: loaded }, upload: { ...base.upload!, loadedLatency: { ...loaded, medianMs: 42, p90Ms: 55, increaseMs: 38.9 } }, bufferbloat: { grade: 'B', basis: 'download+upload', increaseMs: 38.9 } }) })
    await settle()
    expect(page.get('[data-testid="load-grade"]').text()).toBe('B')
    expect(card().text()).toContain('Mild bufferbloat')
    expect(page.findAll('[data-testid="load-row"]').map((row) => row.find('[data-live]').exists())).toEqual([false, false])
    page.unmount()
  })

  it('shows the HTTP loaded responsiveness and quality list while a standard run goes on, then the result’s', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    await settle()
    await page.get('[data-testid="start-button"]').trigger('click')
    const worker = StubWorker.started[0]
    worker?.emit({ type: 'phase', phase: 'download', state: 'started', notices: [] })
    await settle()
    // Pending, as the kit's Test screen shows them: "—" until the result.
    expect(page.findAll('[data-testid="load-rpm"]').map((row) => row.text())).toEqual(['Download—', 'Upload—'])
    expect(page.findAll('[data-testid="quality-row"]').map((row) => row.text())).toEqual(['Streaming—', 'Gaming—', 'Video calls—'])
    const base = resultFixture()
    const h1 = { state: 'unavailable_h1' as const, protocol: 'http/1.1', samples: 0 }
    const scores = { basis: 'download' as const, packetLoss: 'not-measured' as const, streaming: { points: 90, band: 'great' as const }, gaming: { points: 60, band: 'good' as const }, rtc: { points: 50, band: 'average' as const } }
    worker?.emit({ type: 'result', result: resultFixture({ id: 'a1b2c3d4-0000-4000-8000-000000000007', download: { ...base.download!, responsiveness: h1 }, upload: { ...base.upload!, responsiveness: h1 }, scores }) })
    await settle()
    expect(page.get('[data-testid="load-responsiveness"]').text()).toContain('needs HTTP/2 or HTTP/3 at the reverse proxy')
    expect(page.findAll('[data-testid="load-rpm"]').map((row) => row.text())).toEqual(['Download—', 'Upload—'])
    expect(page.get('[data-testid="quality-basis"]').text()).toBe('download only')
    expect(page.findAll('[data-testid="quality-row"]').map((row) => row.text())).toEqual(['Streaming Great', 'Gaming Good', 'Video calls Average'])
    page.unmount()
  })

  it('reads no idle latency on the live load card when idle latency ended without a median', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    await settle()
    await page.get('[data-testid="start-button"]').trigger('click')
    StubWorker.started[0]?.emit(
      { type: 'phase', phase: 'idle', state: 'started', notices: [] },
      // Four samples: the progress has a median, the finished phase none (measurement.md section 10).
      { type: 'idle', path: 'websocket', pings: 5, count: 20, rttMs: 3, medianMs: 3.1, phaseMs: 500 },
      { type: 'phase', phase: 'idle', state: 'finished', idle: { path: 'websocket', lossPercent: 75, samples: [3, 3.1, 3.2, 3] }, notices: [] },
      { type: 'phase', phase: 'download', state: 'started', notices: [] },
      { type: 'sample', direction: 'download', fromBucket: 0, values: [1000], gauge: 1e6, streams: 1, phaseMs: 400, dataUsedBytes: 1000, loadedLatency: [{ atMs: 100, rttMs: 18 }] },
    )
    await settle()
    expect(page.findAll('[data-testid="load-row"]')[0]?.text()).toContain('p90 18 · no idle latency')
    page.unmount()
  })
})

describe('Back from the Details of a run that ended Cancelled or Error (ui/flows.md section 4)', () => {
  const IDLE = resultFixture().idle!
  const SKIPPED_UP = { status: 'skipped' as const, streams: 0, bytes: 0, events: [], confirmedRequests: 0 }
  const EMPTY_CHART = 'Throughput over time appears here while the test runs.'

  /** The Test screen with a run started on its Worker. */
  async function startRun() {
    vi.stubGlobal('Worker', StubWorker)
    const page = await mountApp(TestPage)
    await settle()
    await page.get('[data-testid="start-button"]').trigger('click')
    const worker = StubWorker.started.at(-1) as StubWorker
    const emit = async (...events: EngineEvent[]) => {
      worker.emit(...events)
      await settle()
    }
    return { page, worker, emit }
  }

  /** Everything the screen shows: its text, and each chart's summary of its series and marks. */
  function shown(page: Awaited<ReturnType<typeof mountApp>>) {
    const label = (id: string) => (page.find(`[data-testid="${id}"]`).exists() ? (page.get(`[data-testid="${id}"]`).attributes('aria-label') ?? null) : null)
    return { text: page.get('main').text(), throughput: label('throughput-chart'), latency: label('latency-chart') }
  }

  /** Past the gauge's 280 ms scale tween, so the screen is compared as it settled, not mid-shift. */
  const still = () => new Promise((resolve) => setTimeout(resolve, 400))

  /** Details, then Back: the screen leaves and a new one opens on a new Worker. */
  async function back(page: Awaited<ReturnType<typeof mountApp>>) {
    page.unmount()
    const again = await mountApp(TestPage)
    await settle()
    return again
  }

  const downloadStarted: EngineEvent[] = [
    { type: 'phase', phase: 'info', state: 'finished', notices: [] },
    { type: 'phase', phase: 'idle', state: 'started', notices: [] },
    { type: 'phase', phase: 'idle', state: 'finished', idle: IDLE, notices: [] },
    { type: 'phase', phase: 'download', state: 'started', notices: [] },
    { type: 'sample', direction: 'download', fromBucket: 0, values: [1_176_250, 1_176_250, 1_176_250], gauge: 9.41e7, streams: 2, phaseMs: 300, dataUsedBytes: 3_528_750, loadedLatency: [{ atMs: 100, rttMs: 18 }] },
  ]

  it('shows a stop mid-download again as it was: gauge, chart, tiles, notices, Keep, Details and Download JSON', async () => {
    const { page, emit } = await startRun()
    await emit(...downloadStarted)
    await page.get('[data-testid="start-button"]').trigger('click')
    const base = resultFixture()
    const { bitsPerSecond: _b, peakBitsPerSecond: _p, windowMs: _w, series: _s, ...bare } = base.download!
    const download = { ...bare, status: 'insufficient-data' as const, events: [{ code: 'cancelled' as const, atMs: 300 }] }
    const result: Result = { ...base, id: 'a1b2c3d4-0000-4000-8000-0000000000d1', status: 'partial', download, upload: SKIPPED_UP, notices: [{ code: 'stopped-early', direction: 'download', coveredMs: 0 }] }
    await emit({ type: 'phase', phase: 'download', state: 'finished', result: download, notices: result.notices }, { type: 'phase', phase: 'upload', state: 'skipped', notices: result.notices }, { type: 'result', result })
    await still()
    const before = shown(page)
    expect(before.text).toContain('Cancelled')
    expect(before.text).toContain('Test cancelled during download')
    expect(before.text).not.toContain(EMPTY_CHART)
    expect(before.throughput).toContain('stopped at 0.3')
    expect(before.throughput).toContain('marked: Cancelled')
    const again = await back(page)
    expect(shown(again)).toEqual(before)
    expect(again.find('[data-testid="keep-in-history"]').exists()).toBe(true)
    expect(again.get('[data-testid="result-details"]').attributes('href')).toBe(`/result/${result.id}`)
    expect(again.findAll('button').filter((button) => button.text() === 'Download JSON')).toHaveLength(1)
    again.unmount()
  })

  it('shows an error mid-upload again: the Error state, its gauge on the last live sample, and the chart', async () => {
    const { page, emit } = await startRun()
    const base = resultFixture()
    await emit(
      ...downloadStarted,
      { type: 'phase', phase: 'download', state: 'finished', result: base.download!, notices: [] },
      { type: 'phase', phase: 'upload', state: 'started', notices: [] },
      { type: 'sample', direction: 'upload', fromBucket: 0, values: [], gauge: 3e7, streams: 1, phaseMs: 400, sending: 3e7, dataUsedBytes: 4_000_000 },
    )
    const upload = { status: 'error' as const, streams: 1, bytes: 1, events: [{ code: 'error' as const, atMs: 400, notice: 'requests-failed' as const }], confirmedRequests: 0 }
    const result: Result = { ...base, id: 'a1b2c3d4-0000-4000-8000-0000000000d2', status: 'error', upload }
    await emit({ type: 'error', code: 'requests-failed', messageKey: 'errors.requests-failed', phase: 'upload', partial: true }, { type: 'phase', phase: 'upload', state: 'failed', ranMs: 400, notices: [] }, { type: 'result', result })
    await still()
    const before = shown(page)
    expect(before.text).toContain('Connection lost')
    expect(before.text).toContain('last sample')
    expect(before.throughput).toContain('Connection lost')
    const again = await back(page)
    expect(shown(again)).toEqual(before)
    expect(again.find('[data-testid="keep-in-history"]').exists()).toBe(true)
    again.unmount()
  })

  it('shows a stop during idle latency again: the latency chart and the gauge in milliseconds', async () => {
    const { page, emit } = await startRun()
    const pings = [3, 4, 5, 6].map((n): EngineEvent => ({ type: 'idle', path: 'websocket', phaseMs: n * 40, pings: n, count: 20, rttMs: 3 + n / 10, medianMs: 3.2, minMs: 2.4, p90Ms: 4.1, jitterMs: 0.8, lossPercent: 0 }))
    await emit({ type: 'phase', phase: 'info', state: 'finished', notices: [] }, { type: 'phase', phase: 'idle', state: 'started', notices: [] }, ...pings)
    await page.get('[data-testid="start-button"]').trigger('click')
    const result: Result = { ...resultFixture(), id: 'a1b2c3d4-0000-4000-8000-0000000000d3', status: 'partial', download: undefined, upload: undefined, notices: [] }
    await emit({ type: 'phase', phase: 'idle', state: 'finished', idle: IDLE, notices: [] }, { type: 'phase', phase: 'download', state: 'skipped', notices: [] }, { type: 'phase', phase: 'upload', state: 'skipped', notices: [] }, { type: 'result', result })
    await still()
    const before = shown(page)
    expect(before.latency).toContain('Cancelled')
    expect(before.throughput).toBeNull()
    expect(page.get('[data-testid="gauge-text"]').text()).toContain('Cancelled')
    const again = await back(page)
    expect(shown(again)).toEqual(before)
    again.unmount()
  })

  it('shows a Continuous stop in warm-up again: its live view, chart and loaded latency', async () => {
    const { page, worker, emit } = await startRun()
    await emit({ type: 'phase', phase: 'info', state: 'finished', notices: [] }, { type: 'phase', phase: 'idle', state: 'started', notices: [] }, { type: 'phase', phase: 'idle', state: 'finished', idle: IDLE, notices: [] })
    continuousStream({ direction: 'download', seconds: 5, stepS: 1, pingS: 1, warmupBuckets: 60 }, (event) => worker.emit(event))
    await settle()
    await page.get('[data-testid="start-button"]').trigger('click')
    const base = resultFixture()
    const download = { status: 'insufficient-data' as const, streams: 4, bytes: 6e6, events: [{ code: 'cancelled' as const, atMs: 5000 }] }
    const result: Result = { ...base, id: 'a1b2c3d4-0000-4000-8000-0000000000d4', settings: continuousResultSettings('download'), status: 'partial', download, upload: SKIPPED_UP, notices: [{ code: 'stopped-early', direction: 'download', coveredMs: 0 }] }
    await emit({ type: 'phase', phase: 'download', state: 'finished', result: download, notices: result.notices }, { type: 'result', result })
    await still()
    const before = shown(page)
    expect(page.find('[data-testid="continuous-view"]').exists()).toBe(true)
    expect(before.text).toContain('Latency under load')
    expect(before.throughput).not.toBeNull()
    const loadRows = page.findAll('[data-testid="load-row"]').map((row) => row.text())
    const again = await back(page)
    expect(shown(again)).toEqual(before)
    expect(again.findAll('[data-testid="load-row"]').map((row) => row.text())).toEqual(loadRows)
    again.unmount()
  })

  it('keeps the restored result once, and reads it as kept on the next Back', async () => {
    const { page, emit } = await startRun()
    const result = resultFixture({ id: 'a1b2c3d4-0000-4000-8000-0000000000d5', status: 'partial', notices: [{ code: 'stopped-early', direction: 'upload', coveredMs: 3000 }] })
    await emit({ type: 'result', result })
    const again = await back(page)
    const save = vi.spyOn(useHistory(), 'save')
    await again.get('[data-testid="keep-in-history"]').trigger('click')
    await settle()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(result)
    save.mockRestore()
    const third = await back(again)
    expect(third.get('[data-testid="result-bar"] [role="status"]').text()).toBe('Saved as partial')
    expect(third.find('[data-testid="keep-in-history"]').exists()).toBe(false)
    third.unmount()
  })

  it('starts Run again from the Details at once with the recorded settings, restoring nothing', async () => {
    const { page, emit } = await startRun()
    const result = resultFixture({ id: 'a1b2c3d4-0000-4000-8000-0000000000d6', status: 'error', label: 'Attic', notices: [] })
    await emit({ type: 'result', result })
    requestRunAgain(result)
    page.unmount()
    vi.stubGlobal('Worker', StubWorker)
    const again = await mountApp(TestPage)
    const worker = StubWorker.started.at(-1) as StubWorker
    expect(again.find('[data-testid="keep-in-history"]').exists()).toBe(false)
    // The held run was dropped as the screen opened, not kept for a later one.
    expect(takeEndedRun()).toBeNull()
    worker.posted.length = 0
    worker.emit({ type: 'settings', scope: 'configured', settings: settingsFromDefaults(infoFixture().defaults) })
    await settle()
    expect(worker.posted).toContainEqual(expect.objectContaining({ type: 'start', override: expect.objectContaining({ label: 'Attic', preset: result.settings.preset }) }))
    expect(again.get('[data-testid="start-button"]').text()).toContain('Stop')
    again.unmount()
  })

  it('shows the idle state after a complete run whose saving failed, its Details from memory', async () => {
    const save = vi.spyOn(useHistory(), 'save').mockResolvedValue(false)
    const { page, emit } = await startRun()
    const result = resultFixture({ id: 'a1b2c3d4-0000-4000-8000-0000000000d7' })
    await emit({ type: 'result', result })
    save.mockRestore()
    expect(lastRunResult.value?.id).toBe(result.id)
    page.unmount()
    const details = await mountApp(ResultDetailPage, `/result/${result.id}`)
    await settle()
    expect(details.get('[data-testid="not-saved"]').text()).toBe('Not saved')
    details.unmount()
    const again = await mountApp(TestPage)
    await settle()
    expect(again.find('[data-testid="result-bar"]').exists()).toBe(false)
    expect(again.get('[data-testid="start-button"]').text()).toContain('Start')
    again.unmount()
  })
})
