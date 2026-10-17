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

// The Result detail (ui/screens.md section 2) on an in-memory IndexedDB: a stored result with its
// tiles, grade, loaded latency, confidence and notices, charts with their tables, the share panel and
// parameters;
// the label and the note saved as they change; Delete with its undo; Run again; not found; and the
// result of the run just finished, not saved, with editing and Delete disabled and the reason.

import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { toast } from 'vue-sonner'

import { demoHistoryResults } from '@/demo/history'
import type { Result } from '@/engine/messages'
import { openHistoryDB } from '@/history/db'
import { resultFixture } from '@/test/fixtures'
import { freshIndexedDB } from '@/test/idb'

vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))

const RESULTS = demoHistoryResults('populated')
const NEWEST = RESULTS[0] as Result

async function seed(results: readonly Result[]): Promise<void> {
  if (results.length === 0) {
    return
  }
  const db = await openHistoryDB()
  for (const result of results) {
    await db.put('results', result)
  }
  db.close()
}

async function stored(id: string): Promise<Result | undefined> {
  const db = await openHistoryDB()
  const result = (await db.get('results', id)) as Result | undefined
  db.close()
  return result
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

/** The page on a fresh module graph at `/result/id`; `memory` is the run just finished. */
async function open(id: string, results: readonly Result[] = RESULTS, memory: Result | null = null) {
  await seed(results)
  vi.resetModules()
  vi.doMock('@/composables/useRun', () => ({ lastRunResult: shallowRef(memory) }))
  const { default: ResultDetailPage } = await import('@/pages/ResultDetailPage.vue')
  const { mountApp } = await import('@/test/mount')
  const page = await mountApp(ResultDetailPage, `/result/${id}`, { attachTo: document.body })
  await settle()
  // A cold module graph can take longer than the settling: wait until the page has left loading.
  await vi.waitFor(() => expect(page.find('[data-testid="result-loading"]').exists()).toBe(false))
  await settle()
  return page
}

const text = (page: VueWrapper, testid: string) => page.get(`[data-testid="${testid}"]`).text()

beforeAll(async () => {
  await import('@/pages/ResultDetailPage.vue')
}, 60_000)

beforeEach(() => {
  freshIndexedDB()
  localStorage.clear()
  vi.mocked(toast).mockClear()
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.doUnmock('@/composables/useRun')
  vi.unstubAllGlobals()
})

describe('a stored result', () => {
  it('shows its header, tiles, grade, loaded latency, confidence and notices', async () => {
    const page = await open(NEWEST.id)
    expect(text(page, 'result-label')).toBe('VPN via 5G')
    expect(page.get('nav[aria-label="Breadcrumb"] a').attributes('href')).toBe('/history')
    expect(page.findAll('[data-testid="metric-tile"]')).toHaveLength(4)
    expect(page.findAll('[data-testid="metric-tile"]')[0]?.text()).toContain('640')
    expect(text(page, 'load-grade')).toBe('D')
    expect(text(page, 'load-basis')).toMatch(/^Basis: worse of download and upload — upload \+\d+ ms \(download \+\d+ ms\)$/)
    const rows = page.findAll('[data-testid="load-row"]').map((row) => row.text())
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatch(/^During download · WebSocketp90 \d+ · \+\d+ ms vs idle\d+ms$/)
    expect(text(page, 'confidence-level')).toBe('Confidence: low')
    expect(text(page, 'confidence-confidence')).toContain('Download confidence: low')
    expect(text(page, 'confidence-notices')).toContain('Packet loss not measured')
    expect(page.find('[data-testid="not-saved"]').exists()).toBe(false)
    page.unmount()
  })

  it('draws each direction and the idle latency, each with a table of its windows', async () => {
    const page = await open(NEWEST.id)
    expect(page.find('[data-testid="phase-chart-download"]').attributes('aria-label')).toMatch(/^Download chart: 15\.0\ss · 4 streams; warm-up excluded; latency under load on a second scale$/)
    expect(page.find('[data-testid="phase-chart-upload"]').exists()).toBe(true)
    expect(page.find('[data-testid="phase-chart-latency"]').exists()).toBe(true)
    const card = page.get('[data-testid="chart-card-download"]')
    await card.findAll('button').find((button) => button.text() === 'Table')?.trigger('click')
    const table = card.get('[data-testid="window-table"]')
    const cells = table.findAll('tbody tr').map((row) => row.findAll('td').map((cell) => cell.text()))
    expect(cells).toHaveLength(3)
    expect(cells[0]?.slice(0, 2)).toEqual(['9.0–11.0\u00a0s', '2.0\u00a0s'])
    expect(cells[0]?.[2]).toMatch(/kbit\/s$/)
    expect(cells[0]?.[3]).toMatch(/ms$/)
    expect(card.text()).toContain('From warm-up end (9.0 s).')
    page.unmount()
  })

  it('lists its parameters', async () => {
    const page = await open(NEWEST.id)
    expect(text(page, 'parameter-phases')).toContain('Idle latency → Download → Upload')
    expect(text(page, 'parameter-streams')).toContain('Auto, up to 6')
    expect(text(page, 'parameter-streams-download')).toContain('4 · plateau: no-gain')
    expect(text(page, 'parameter-ip')).toContain('100.101.4.17')
    expect(text(page, 'parameter-warmup')).toMatch(/Auto · ended at 9\.0\ss \(download\), 9\.0\ss \(upload\)$/)
    expect(text(page, 'parameter-isolated')).toContain('Yes')
    page.unmount()
  })

  it('shows the share panel in its rail, between the note and the parameters', async () => {
    const page = await open(NEWEST.id)
    const rail = page.get('aside')
    expect(rail.findAll('[data-testid="note-field"], [data-testid="share-panel"], [data-testid^="parameter-"]').map((element) => element.attributes('data-testid')).slice(0, 2)).toEqual(['note-field', 'share-panel'])
    expect(text(page, 'share-summary')).toContain('Server: ')
    expect(text(page, 'share-summary')).not.toContain('100.101.4.17')
    page.unmount()
  })
})

describe('editing', () => {
  it('saves the label edited in place', async () => {
    const page = await open(NEWEST.id)
    await page.get('[data-testid="edit-label"]').trigger('click')
    const input = page.get('[data-testid="label-input"]')
    await input.setValue('Desk, 5 GHz')
    await input.trigger('keydown', { key: 'Enter' })
    // The edit is a write to IndexedDB, which a loaded machine can take longer than the settling for.
    await vi.waitFor(() => expect(text(page, 'result-label')).toBe('Desk, 5 GHz'))
    expect((await stored(NEWEST.id))?.label).toBe('Desk, 5 GHz')
    page.unmount()
  })

  it('leaves the label as it was on Escape', async () => {
    const page = await open(NEWEST.id)
    await page.get('[data-testid="edit-label"]').trigger('click')
    await page.get('[data-testid="label-input"]').setValue('Other')
    await page.get('[data-testid="label-input"]').trigger('keydown', { key: 'Escape' })
    await settle()
    expect(text(page, 'result-label')).toBe('VPN via 5G')
    expect((await stored(NEWEST.id))?.label).toBe('VPN via 5G')
    page.unmount()
  })

  it('saves the note as it changes', async () => {
    const page = await open(NEWEST.id)
    await page.get('[data-testid="note-field"]').setValue('Hotel room')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await vi.waitFor(async () => expect((await stored(NEWEST.id))?.note).toBe('Hotel room'))
    page.unmount()
  })
})

describe('Delete and Run again', () => {
  it('deletes the result with an undo that brings it back', async () => {
    const page = await open(NEWEST.id)
    await page.get('[data-testid="delete-result"]').trigger('click')
    await vi.waitFor(() => expect(text(page, 'result-missing')).toContain('Result deleted'))
    expect(await stored(NEWEST.id)).toBeUndefined()
    const [title, options] = vi.mocked(toast).mock.calls[0] ?? []
    expect(title).toBe('1 result deleted.')
    ;(options as { action: { onClick: () => void } }).action.onClick()
    await vi.waitFor(() => expect(text(page, 'result-label')).toBe('VPN via 5G'))
    page.unmount()
  })

  it("asks the Test screen to run the result's settings again", async () => {
    const page = await open(NEWEST.id)
    await page.get('[data-testid="run-again"]').trigger('click')
    await settle()
    expect(page.vm.$router.currentRoute.value.path).toBe('/')
    const { takeRunAgain } = await import('@/composables/useRunAgain')
    expect(takeRunAgain()).toMatchObject({ label: 'VPN via 5G', settings: { preset: 'standard', phases: ['idle', 'download', 'upload'] } })
    page.unmount()
  })
})

describe('the other states', () => {
  it('says an unknown id is not found, with a link to History', async () => {
    const page = await open('d0000000-0000-4000-8000-0000000000ff')
    expect(text(page, 'result-missing')).toContain('Result not found')
    expect(page.get('[data-testid="result-missing"] a').attributes('href')).toBe('/history')
    page.unmount()
  })

  it('shows the partial result just finished as not saved, editing and Delete disabled with the reason', async () => {
    const partial = resultFixture({ id: 'a1b2c3d4-0000-4000-8000-0000000000aa', status: 'partial', label: 'Stopped' })
    const page = await open(partial.id, RESULTS, partial)
    expect(text(page, 'result-label')).toBe('Stopped')
    expect(text(page, 'not-saved')).toBe('Not saved')
    expect(text(page, 'not-saved-reason')).toBe('Partial results are not saved')
    const reason = page.get('[data-testid="not-saved-reason"]').attributes('id')
    for (const control of ['edit-label', 'delete-result']) {
      expect(page.get(`[data-testid="${control}"]`).attributes('aria-disabled')).toBe('true')
      expect(page.get(`[data-testid="${control}"]`).attributes('aria-describedby')).toBe(reason)
    }
    await page.get('[data-testid="delete-result"]').trigger('click')
    await page.get('[data-testid="edit-label"]').trigger('click')
    expect(page.find('[data-testid="label-input"]').exists()).toBe(false)
    expect(page.get('[data-testid="note-field"]').attributes('readonly')).toBeDefined()
    expect(page.find('[data-testid="download-json"]').exists()).toBe(true)
    expect(page.find('[data-testid="share-panel"]').exists()).toBe(true)
    page.unmount()
  })

  it('says history is unavailable for the result in memory', async () => {
    const result = resultFixture({ id: 'a1b2c3d4-0000-4000-8000-0000000000bb', label: 'Private window' })
    vi.stubGlobal('indexedDB', undefined)
    const page = await open(result.id, [], result)
    expect(text(page, 'result-unavailable')).toContain('History unavailable')
    expect(text(page, 'not-saved-reason')).toBe('History unavailable · nothing is saved in this window')
    page.unmount()
  })
})
