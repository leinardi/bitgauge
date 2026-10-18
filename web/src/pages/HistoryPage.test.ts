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

// The History screen (ui/screens.md section 3, ui/flows.md section 6) on an in-memory IndexedDB:
// its states, the per-origin notice, the filters kept in the query string, the sort with aria-sort,
// selection by Space and opening by Enter, deletion with its undo toast, Clear all after its
// confirmation, the import's summary and refusals, the export menu, and Compare.

import { DOMWrapper, flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'vue-sonner'

import { demoHistoryResults } from '@/demo/history'
import type { Result } from '@/engine/messages'
import { openHistoryDB } from '@/history/db'
import { freshIndexedDB } from '@/test/idb'

vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))

const RESULTS = demoHistoryResults('populated')
const EXPORT = (results: Result[]) => JSON.stringify({ format: 'bitgauge.history', formatVersion: 1, exportedAt: '2026-10-08T12:00:00.000Z', results })

async function seed(results: readonly Result[]): Promise<void> {
  const db = await openHistoryDB()
  for (const result of results) {
    await db.put('results', result)
  }
  db.close()
}

/** The page on a fresh module graph, so its history opens the database as a new page load would. */
async function open(path = '/history', results: readonly Result[] = RESULTS) {
  await seed(results)
  vi.resetModules()
  const { default: HistoryPage } = await import('@/pages/HistoryPage.vue')
  const { mountApp } = await import('@/test/mount')
  const page = await mountApp(HistoryPage, path, { attachTo: document.body })
  await settle()
  return page
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function query(page: VueWrapper) {
  return page.vm.$router.currentRoute.value.query
}

function rows(page: VueWrapper): string[] {
  return page.findAll('[data-testid="history-row"]').map((row) => row.text())
}

const body = () => new DOMWrapper(document.body)

// The page's modules are transformed once here, so no test pays for it within its own timeout.
beforeAll(async () => {
  await import('@/pages/HistoryPage.vue')
}, 60_000)

beforeEach(() => {
  freshIndexedDB()
  localStorage.clear()
  vi.mocked(toast).mockClear()
})

afterEach(() => {
  document.body.innerHTML = ''
  Reflect.deleteProperty(navigator, 'clipboard')
  vi.unstubAllGlobals()
})

describe('the states', () => {
  it('shows the stored results newest first, with their count and the origin they belong to', async () => {
    const page = await open()
    expect(page.get('[data-testid="history-count"]').text()).toContain('8 of 8 shown')
    expect(page.get('[data-testid="origin-notice"]').text()).toContain(`Stored only in this browser, for ${window.location.origin}`)
    expect(rows(page)).toHaveLength(8)
    expect(rows(page)[0]).toContain('VPN via 5G')
    expect(rows(page)[0]).toContain('Low confidence')
    expect(rows(page)[0]).toContain('640')
    expect(page.get('[aria-sort="descending"]').text()).toBe('Date')
    expect(page.findAll('[aria-sort="none"]')).toHaveLength(9)
    expect(page.get('[data-testid="history-trend"]').text()).toContain('8 results')
    page.unmount()
  })

  it('says when trends appear while it holds a single result of today', async () => {
    const page = await open('/history', demoHistoryResults('single'))
    const trend = page.get('[data-testid="history-trend"]')
    expect(trend.text()).toContain('1 result · today')
    expect(trend.text()).toContain('Trends appear from the second result.')
    page.unmount()
  })

  it('explains the Why? of the per-origin notice on demand', async () => {
    const page = await open()
    const why = page.get('[data-testid="origin-notice"] button')
    expect(why.attributes('aria-expanded')).toBe('false')
    await why.trigger('click')
    expect(page.get('[data-testid="origin-notice"]').text()).toContain('Export JSON to move them.')
    page.unmount()
  })

  it('offers a test and an import when empty', async () => {
    const page = await open('/history', [])
    expect(page.get('[data-testid="history-empty"]').text()).toContain('No results yet')
    expect(page.get('[data-testid="history-count"]').text()).toContain('0 results')
    expect(page.find('[data-testid="export-menu"]').exists()).toBe(false)
    expect(page.find('[data-testid="clear-all"]').exists()).toBe(false)
    page.unmount()
  })

  it('says history is unavailable where IndexedDB is missing', async () => {
    await seed([])
    vi.stubGlobal('indexedDB', undefined)
    vi.resetModules()
    const { default: HistoryPage } = await import('@/pages/HistoryPage.vue')
    const { mountApp } = await import('@/test/mount')
    const page = await mountApp(HistoryPage, '/history')
    await settle()
    expect(page.get('[data-testid="history-unavailable"]').text()).toContain('History is unavailable in this browser mode — results are not saved.')
    expect(page.get('[data-testid="history-count"]').text()).toBe('Not saved in this window')
    expect(page.find('[data-testid="origin-notice"]').exists()).toBe(false)
    expect(page.get('[data-testid="import-json"]').attributes('disabled')).toBeDefined()
    page.unmount()
    vi.unstubAllGlobals()
  })
})

describe('the filters', () => {
  it('live in the query string, beside the URL parameters, and narrow the list and the trend', async () => {
    const page = await open('/history?units=bytes')
    const office = page.findAll('[data-testid="chip-labels"]').find((chip) => chip.text().startsWith('VPN · office'))
    await office?.trigger('click')
    await settle()
    expect(query(page)).toEqual({ units: 'bytes', labels: ['VPN · office'] })
    expect(rows(page)).toHaveLength(2)
    expect(page.get('[data-testid="history-count"]').text()).toContain('2 of 8 shown')
    expect(office?.attributes('aria-pressed')).toBe('true')
    page.unmount()
  })

  it('read the query string on load, the search over labels and notes included', async () => {
    const page = await open('/history?q=caf&contexts=VPN')
    expect(rows(page)).toHaveLength(1)
    expect(rows(page)[0]).toContain('VPN · café')
    expect((page.get('[data-testid="history-search"]').element as HTMLInputElement).value).toBe('caf')
    page.unmount()
  })

  it('show the no-match state with Clear filters', async () => {
    const page = await open('/history?q=airport')
    expect(page.get('[data-testid="history-no-match"]').text()).toContain('Nothing matches “airport”. All')
    await page.get('[data-testid="history-no-match"] button').trigger('click')
    await settle()
    expect(query(page)).toEqual({})
    expect(rows(page)).toHaveLength(8)
    page.unmount()
  })

  it('apply a custom date range of two inclusive local dates', async () => {
    const page = await open()
    await page.get('[data-testid="date-range"]').trigger('click')
    await settle()
    const from = body().get('[data-testid="range-from"]')
    const to = body().get('[data-testid="range-to"]')
    await from.setValue('2026-10-02')
    await to.setValue('2026-10-05')
    await body().get('[data-testid="range-apply"]').trigger('click')
    await settle()
    expect(query(page)).toEqual({ range: '2026-10-02..2026-10-05' })
    expect(rows(page)).toHaveLength(2)
    page.unmount()
  })
})

describe('the list', () => {
  it('sorts by a column header, turning around on the second press', async () => {
    const page = await open()
    await page.get('[data-testid="sort-download"]').trigger('click')
    expect(page.get('[aria-sort="descending"]').text()).toBe('Download')
    expect(rows(page)[0]).toContain('VPN · office')
    await page.get('[data-testid="sort-download"]').trigger('click')
    expect(page.get('[aria-sort="ascending"]').text()).toBe('Download')
    // A result without a download number sorts last either way.
    expect(rows(page)[0]).toContain('640')
    expect(rows(page)[7]).toContain('Error')
    page.unmount()
  })

  it('selects a focused row with Space and opens it with Enter', async () => {
    const page = await open()
    const row = page.get('[data-testid="history-row"]')
    await row.trigger('keydown', { key: ' ' })
    expect(row.attributes('data-selected')).toBe('true')
    expect(page.get('[data-testid="selection-bar"]').text()).toContain('1 selected')
    await row.trigger('keydown', { key: 'Enter' })
    // The Result detail's page loads as its own chunk before the navigation lands.
    await vi.waitFor(() => expect(page.vm.$router.currentRoute.value.path).toBe(`/result/${RESULTS[0]?.id}`), { timeout: 4000 })
    page.unmount()
  })

  it('drops from the selection the rows a filter hides', async () => {
    const page = await open()
    const [first, second] = page.findAll('[data-testid="row-select"]')
    await first?.trigger('click')
    await second?.trigger('click')
    expect(page.get('[data-testid="selection-bar"]').text()).toContain('2 selected')
    await page.get('[data-testid="history-search"]').setValue('hotel')
    await settle()
    expect(rows(page)).toHaveLength(1)
    expect(page.get('[data-testid="selection-bar"]').text()).toContain('1 selected')
    page.unmount()
  })

  it('deletes the selected rows at once and puts them back on Undo', async () => {
    const page = await open()
    const [first, second] = page.findAll('[data-testid="row-select"]')
    await first?.trigger('click')
    await second?.trigger('click')
    await page.get('[data-testid="delete-selected"]').trigger('click')
    await settle()
    expect(rows(page)).toHaveLength(6)
    expect(page.find('[data-testid="selection-bar"]').exists()).toBe(false)
    const [title, options] = vi.mocked(toast).mock.calls[0] ?? []
    expect(title).toBe('2 results deleted.')
    expect(options).toMatchObject({ duration: 8000, action: { label: 'Undo' } })
    ;(options as { action: { onClick: () => void } }).action.onClick()
    await settle()
    expect(rows(page)).toHaveLength(8)
    page.unmount()
  })
})

describe('Compare', () => {
  it('stays reachable but unavailable until exactly two are selected, then opens the compare view', async () => {
    const page = await open('/history?labels=VPN%20%C2%B7%20office')
    const [newer, older] = page.findAll('[data-testid="row-select"]')
    await newer?.trigger('click')
    const compare = page.get('[data-testid="selection-bar"] [data-testid="compare"]')
    expect(compare.attributes('aria-disabled')).toBe('true')
    expect(document.getElementById(compare.attributes('aria-describedby') ?? '')?.textContent).toContain('Compare needs exactly 2')
    await compare.trigger('click')
    await settle()
    expect(body().find('[data-testid="compare-panel"]').exists()).toBe(false)

    await older?.trigger('click')
    expect(compare.attributes('aria-disabled')).toBe('false')
    await compare.trigger('click')
    await settle()
    const panel = body().get('[data-testid="compare-panel"]')
    expect(panel.attributes('role')).toBe('dialog')
    expect(panel.text()).toContain('Compare results')
    // A is the older of the two, on HTTP/2; B the newer, on HTTP/1.1.
    expect(panel.get('[data-testid="compare-warning"]').text()).toBe('Not directly comparable: different protocol (HTTP/2 vs HTTP/1.1)')
    expect(panel.get('[data-testid="compare-row-download"]').text()).toContain('better')
    expect(panel.get('[data-testid="compare-row-grade"]').text()).toContain('same')
    page.unmount()
  })

  async function compared() {
    const page = await open('/history?labels=VPN%20%C2%B7%20office')
    for (const box of page.findAll('[data-testid="row-select"]')) {
      await box.trigger('click')
    }
    await page.get('[data-testid="selection-bar"] [data-testid="compare"]').trigger('click')
    await settle()
    return page
  }

  it('copies the comparison as text', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const page = await compared()
    await body().get('[data-testid="compare-copy"]').trigger('click')
    await settle()
    expect(writeText).toHaveBeenCalledOnce()
    expect(String(writeText.mock.calls[0]?.[0 as never])).toContain('Protocol: HTTP/2 → HTTP/1.1')
    expect(toast.success).toHaveBeenCalledWith('Comparison copied.')
    page.unmount()
  })

  it('offers the text to copy by hand where there is no clipboard, as on an insecure origin', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    const page = await compared()
    await body().get('[data-testid="compare-copy"]').trigger('click')
    await settle()
    const field = body().get('[data-testid="compare-text"]')
    expect((field.element as HTMLTextAreaElement).value).toContain('Protocol: HTTP/2 → HTTP/1.1')
    expect(document.activeElement).toBe(field.element)
    page.unmount()
  })

  it('links each side to its detail on narrow screens too', async () => {
    const page = await compared()
    const links = body().findAll('[data-testid="compare-card"] a').map((link) => link.attributes('href'))
    expect(links).toEqual([`/result/${RESULTS[5]?.id}`, `/result/${RESULTS[3]?.id}`])
    page.unmount()
  })
})

describe('Clear all', () => {
  it('asks first, naming the count, and removes everything', async () => {
    const page = await open()
    await page.get('[data-testid="clear-all"]').trigger('click')
    await settle()
    const dialog = body().get('[role="alertdialog"]')
    expect(dialog.text()).toContain('This removes 8 results with their labels and notes from this browser. This cannot be undone.')
    expect(dialog.text()).toContain('Export JSON first')
    await body().get('[data-testid="clear-confirm"]').trigger('click')
    await settle()
    expect(page.get('[data-testid="history-empty"]').text()).toContain('No results yet')
    page.unmount()
  })
})

describe('the import', () => {
  function choose(page: VueWrapper, name: string, text: string): Promise<void> {
    const input = page.get('[data-testid="import-input"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File([text], name, { type: 'application/json' })] })
    return input.trigger('change')
  }

  it('adds the new results, skips the duplicates and names each rejected record', async () => {
    const page = await open('/history', RESULTS.slice(0, 2))
    const newer = { ...RESULTS[2], schemaVersion: 3 }
    await choose(page, 'bitgauge-history.json', EXPORT([...RESULTS.slice(0, 2), newer as unknown as Result, ...RESULTS.slice(3)]))
    await settle()
    const done = page.get('[data-testid="import-done"]')
    expect(done.text()).toContain('Imported bitgauge-history.json')
    expect(done.text()).toContain('5 added, 2 skipped as duplicates, 1 rejected: result 3: schema version 3 is newer than this app')
    expect(rows(page)).toHaveLength(7)
    page.unmount()
  })

  it('refuses a file over 10 MB by its size, before reading it', async () => {
    const page = await open()
    const file = new File(['{}'], 'huge.json', { type: 'application/json' })
    Object.defineProperty(file, 'size', { value: 10_000_001 })
    const text = vi.spyOn(file, 'text')
    const input = page.get('[data-testid="import-input"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change')
    await settle()
    expect(page.get('[data-testid="import-failed"]').text()).toContain('The file is larger than 10 MB')
    expect(text).not.toHaveBeenCalled()
    page.unmount()
  })

  it('ends a write the database refuses in its failed state, Import usable again', async () => {
    const page = await open()
    const { useHistory } = await import('@/composables/useHistory')
    vi.spyOn(useHistory(), 'importText').mockRejectedValueOnce(new DOMException('broken', 'UnknownError'))
    await choose(page, 'bitgauge-history.json', EXPORT(RESULTS))
    await settle()
    expect(page.get('[data-testid="import-failed"]').text()).toContain('The browser refused to store the results. Nothing in your history was changed.')
    expect(page.get('[data-testid="import-json"]').attributes('disabled')).toBeUndefined()
    page.unmount()
  })

  it('refuses a CSV export by its name, and a file that is not a history export', async () => {
    const page = await open()
    await choose(page, 'bitgauge-history.csv', 'startedAt,label\r\n')
    await settle()
    expect(page.get('[data-testid="import-failed"]').text()).toContain("CSV exports are summaries and can't be restored. Nothing in your history was changed.")
    await choose(page, 'other.json', '{"results": []}')
    await settle()
    expect(page.get('[data-testid="import-failed"]').text()).toContain("The file isn't a BitGauge history export")
    expect(rows(page)).toHaveLength(8)
    page.unmount()
  })
})

describe('the export menu', () => {
  it('saves the JSON of every result and the CSV of the current filter', async () => {
    const created: Blob[] = []
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = (blob: Blob) => {
          created.push(blob)
          return 'blob:http://127.0.0.1/1'
        }
        static override revokeObjectURL = () => undefined
      },
    )
    const clicked: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download)
    })
    const page = await open('/history?labels=VPN%20%C2%B7%20office')
    await page.get('[data-testid="export-menu"]').trigger('keydown', { key: 'Enter' })
    await settle()
    expect(body().text()).toContain('Contains client IP addresses, labels and notes.')
    await body().get('[data-testid="export-json-all"]').trigger('click')
    await settle()
    expect(clicked[0]).toMatch(/^bitgauge-history-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
    expect((JSON.parse(await (created[0] as Blob).text()) as { results: unknown[] }).results).toHaveLength(8)
    await page.get('[data-testid="export-menu"]').trigger('keydown', { key: 'Enter' })
    await settle()
    await body().get('[data-testid="export-csv-filtered"]').trigger('click')
    await settle()
    expect(clicked[1]).toMatch(/\.csv$/)
    expect((await (created[1] as Blob).text()).trim().split('\r\n')).toHaveLength(3)
    page.unmount()
    vi.unstubAllGlobals()
  })
})
