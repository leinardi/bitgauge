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

// A Continuous result on the Result detail (ui/screens.md section 2, measurement.md section 15):
// the direction it ran with its run-wide average, minimum and maximum and the p90 of the last
// hour; the other direction not run, with no notice; the last hour's loaded latency; the run
// length; the stored cells as the table's rows; every data-used notice; one share block. A run past
// 7 days says that only its last 7 days were saved.

import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

import { continuousFixture } from '@/demo/continuousResults'
import { type Result, validateResult } from '@/engine/messages'
import { openHistoryDB } from '@/history/db'
import { continuousResult } from '@/test/continuous'
import { freshIndexedDB } from '@/test/idb'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const TWO_HOURS = continuousResult({ endMs: 2 * HOUR, bucketMs: 60_000, runLengthMs: 2 * HOUR })
const NINE_DAYS = { ...continuousResult({ endMs: 9 * DAY + 4 * HOUR + 12 * 60_000, bucketMs: 600_000 }), id: 'c0a1b2c3-0000-4000-8000-00000000c0c9' }

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

async function open(result: Result): Promise<VueWrapper> {
  const db = await openHistoryDB()
  await db.put('results', result)
  db.close()
  vi.resetModules()
  vi.doMock('@/composables/useRun', () => ({ lastRunResult: shallowRef(null) }))
  const { default: ResultDetailPage } = await import('@/pages/ResultDetailPage.vue')
  const { mountApp } = await import('@/test/mount')
  const page = await mountApp(ResultDetailPage, `/result/${result.id}`, { attachTo: document.body })
  await settle()
  await vi.waitFor(() => expect(page.find('[data-testid="result-loading"]').exists()).toBe(false))
  await settle()
  return page
}

const text = (page: VueWrapper, testid: string) => page.get(`[data-testid="${testid}"]`).text().replace(/\u00a0/gu, ' ')

beforeAll(async () => {
  await import('@/pages/ResultDetailPage.vue')
}, 60_000)

beforeEach(() => {
  freshIndexedDB()
  localStorage.clear()
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.doUnmock('@/composables/useRun')
})

describe('a Continuous result', () => {
  it('is a valid result, saved from the cells that cover it', () => {
    expect(validateResult(TWO_HOURS)).toEqual([])
    expect(validateResult(NINE_DAYS)).toEqual([])
    // The long ring's 1008 closed cells and the partial last one, as the engine saves them.
    expect(NINE_DAYS.download?.series?.values).toHaveLength(1009)
  })

  it('shows its direction’s run-wide numbers, the other direction not run, and the last hour’s loaded latency', async () => {
    const page = await open(TWO_HOURS)
    const tiles = page.findAll('[data-testid="metric-tile"]').map((tile) => tile.text().replace(/\u00a0/gu, ' '))
    expect(tiles[0]).toMatch(/^Download · average921Mbit\/srun-wide min 702 · max 941 · peak 936 · p90, last hour, 1 s cells · 6 streams · plateau: cap/)
    expect(tiles[1]).toBe('Upload—not run · Continuous runs one direction')
    expect(page.findAll('[data-testid="load-row"]').map((row) => row.text().replace(/\u00a0/gu, ' '))).toEqual([expect.stringMatching(/^During download · WebSocketp90 24 · \+15 ms vs idle · last hour18ms$/)])
    expect(text(page, 'load-basis')).toBe('Basis: download only — +15 ms vs idle; upload not run · Continuous runs one direction')
    // No notice says the upload did not run; every data-used notice is listed.
    const notices = text(page, 'confidence-notices')
    expect(notices).not.toContain('did not run')
    expect(notices).toContain('This run passed 1.00 GB.')
    expect(notices).toContain('This run passed 100 GB.')
    page.unmount()
  })

  it('lists its run length, and its stored 1 min cells as the table’s rows', async () => {
    const page = await open(TWO_HOURS)
    expect(text(page, 'parameter-phases')).toBe('Phases and orderIdle latency → Download (continuous)')
    expect(text(page, 'parameter-run-length')).toBe('Run length2 h')
    expect(page.find('[data-testid="parameter-duration-download"]').exists()).toBe(false)
    const card = page.get('[data-testid="chart-card-download"]')
    expect(page.get('[data-testid="phase-chart-download"]').attributes('aria-label')?.replace(/\u00a0/gu, ' ')).toBe('Download chart: 2 h · 1 min cells · 6 streams; warm-up excluded; latency under load on a second scale')
    await card.findAll('button').find((button) => button.text() === 'Table')?.trigger('click')
    const table = card.get('[data-testid="window-table"]')
    expect(table.get('thead').text().replace(/\u00a0/gu, ' ')).toContain('1 min cells')
    const rows = table.findAll('tbody tr').map((row) => row.findAll('td').map((cell) => cell.text().replace(/\u00a0/gu, ' ')))
    expect(rows).toHaveLength(120)
    expect(rows[0]?.slice(0, 3)).toEqual(['0:06–1:06', '60.0 s', '921 Mbit/s'])
    expect(rows.at(-1)?.[0]).toBe('1:59:06–2:00:00')
    expect(card.text().replace(/\u00a0/gu, ' ')).toContain('One row per stored 1 min cell')
    expect(text(page, 'share-summary')).not.toContain('Upload')
    page.unmount()
  })

  it('says that a run past 7 days saved only its last 7 days, on the chart and under its table', async () => {
    const page = await open(NINE_DAYS)
    expect(text(page, 'parameter-run-length')).toBe('Run lengthNone · ran 9 d 4 h 12 min')
    const card = page.get('[data-testid="chart-card-download"]')
    expect(card.text().replace(/\u00a0/gu, ' ')).toContain('9 d 4 h 12 min · last 7 days saved · 10 min cells · 6 streams')
    await card.findAll('button').find((button) => button.text() === 'Table')?.trigger('click')
    expect(card.get('[data-testid="window-table"]').findAll('tbody tr')).toHaveLength(1009)
    const foot = /One row per stored.*?JSON export\./u.exec(card.text().replace(/\u00a0/gu, ' '))?.[0] ?? ''
    expect(foot).toContain('One row per stored 10 min cell. This 9 d 4 h 12 min run is longer than the 7-day long ring, so only its last 7 days were saved (from 52:10:06)')
    // The table starts past the warm-up end, so the foot does not say it starts there.
    expect(foot).not.toContain('warm-up end')
    page.unmount()
  })
})

describe('the demo’s Continuous results', () => {
  it('say on the 9-day run’s Result detail that only its last 7 days were saved', async () => {
    expect(validateResult(continuousFixture('9d'))).toEqual([])
    const page = await open(continuousFixture('9d'))
    const card = page.get('[data-testid="chart-card-download"]')
    expect(card.text().replace(/\u00a0/gu, ' ')).toContain('9 d 4 h 12 min · last 7 days saved · 10 min cells · 6 streams')
    page.unmount()
  })
})
