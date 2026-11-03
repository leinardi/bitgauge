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

import { notify } from '@/components/feedback/notify'
import { demoHistoryResults } from '@/demo/history'
import type { Result } from '@/engine/messages'
import { openHistoryDB } from '@/history/db'
import { freshIndexedDB } from '@/test/idb'

vi.mock('@/components/feedback/notify', () => ({ notify: vi.fn() }))

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
  await settled(() => expect(page.find('[data-testid="history-loading"]').exists()).toBe(false))
  return page
}

// fake-indexeddb runs its requests on setImmediate, which Node does not order against
// setTimeout, so a fixed number of turns can end before a read or a write lands on a loaded
// runner. Whatever waits on the database waits for its outcome instead.
const IDB_TIMEOUT = 4000

/** Turns the event loop until the assertion holds, for an outcome that waits on the database. */
async function settled<T>(assertion: () => T): Promise<T> {
  return vi.waitFor(async () => {
    await settle()
    return assertion()
  }, { timeout: IDB_TIMEOUT })
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

/** 230 copies of the first result, a minute apart, newest first. */
function many(): Result[] {
  const base = RESULTS[0] as Result
  return Array.from({ length: 230 }, (_, index) => ({ ...base, id: `many-${String(index).padStart(3, '0')}`, startedAt: new Date(Date.parse(base.startedAt) - index * 60_000).toISOString() }))
}

// The page's modules are transformed once here, so no test pays for it within its own timeout.
beforeAll(async () => {
  await import('@/pages/HistoryPage.vue')
}, 60_000)

beforeEach(() => {
  freshIndexedDB()
  localStorage.clear()
  vi.mocked(notify).mockClear()
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
    expect(rows(page)[0]).toContain('low confidence: unstable')
    expect(rows(page)[0]).toContain('640')
    expect(page.get('[aria-sort="descending"]').text()).toBe('Date')
    expect(page.findAll('[aria-sort="none"]')).toHaveLength(9)
    expect(page.get('[data-testid="history-trend"]').text()).toContain('8 results')
    // A result without a grade names why, in the row and on its card alike.
    expect(page.findAll('[data-testid="grade-ungraded"]').map((cell) => cell.text())).toEqual(['Not graded · Test incomplete', 'Not graded · Test incomplete'])
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

  it('correct an unreadable filter and a reversed range in the URL, keeping the URL parameters', async () => {
    const page = await open('/history?range=foo&units=bytes')
    await settle()
    expect(query(page)).toEqual({ units: 'bytes' })
    expect(rows(page)).toHaveLength(8)
    page.unmount()
    const reversed = await open('/history?range=2026-10-19..2026-10-15')
    await settle()
    expect(query(reversed)).toEqual({ range: '2026-10-15..2026-10-19' })
    reversed.unmount()
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
    await settled(() => expect(rows(page)).toHaveLength(6))
    expect(page.find('[data-testid="selection-bar"]').exists()).toBe(false)
    const [notice] = vi.mocked(notify).mock.calls[0] ?? []
    expect(notice).toMatchObject({ tone: 'info', title: '2 results deleted.', undo: { label: 'Undo', countdown: true } })
    notice?.undo?.onClick()
    await settled(() => expect(rows(page)).toHaveLength(8))
    page.unmount()
  })

  it('shows 100 rows at a time, the focus on the first added, and starts again after a sort', async () => {
    const page = await open('/history', many())
    const more = () => page.find('[data-testid="history-more"]')
    expect(rows(page)).toHaveLength(100)
    // The count and the trend cover every result, not only the rows shown.
    expect(page.get('[data-testid="history-count"]').text()).toContain('230 of 230 shown')
    expect(more().text()).toContain('Showing 100 of 230')
    expect(more().get('button').text()).toBe('Show 100 more')
    await more().get('button').trigger('click')
    await settle()
    expect(rows(page)).toHaveLength(200)
    expect(document.activeElement).toBe(page.findAll('[data-testid="history-row"]')[100]?.element)
    expect(more().get('button').text()).toBe('Show 30 more')
    await more().get('button').trigger('click')
    await settle()
    expect(rows(page)).toHaveLength(230)
    expect(more().exists()).toBe(false)
    await page.get('[data-testid="sort-download"]').trigger('click')
    await settle()
    expect(rows(page)).toHaveLength(100)
    page.unmount()
  }, 20_000)

  it('drops from the selection the rows a sort leaves past the ones shown', async () => {
    const page = await open('/history', many())
    await page.get('[data-testid="history-more"] button').trigger('click')
    await settle()
    await page.findAll('[data-testid="row-select"]')[120]?.trigger('click')
    expect(page.get('[data-testid="selection-bar"]').text()).toContain('1 selected')
    // Oldest first, the selected row is no longer among the first 100.
    await page.get('[data-testid="sort-startedAt"]').trigger('click')
    await settle()
    expect(rows(page)).toHaveLength(100)
    expect(page.find('[data-testid="selection-bar"]').exists()).toBe(false)
    page.unmount()
  }, 20_000)

  it('keeps the rows shown and the sort when coming Back from a result, not on a new visit', async () => {
    await seed(many())
    vi.resetModules()
    const { RouterView } = await import('vue-router')
    const { mountApp } = await import('@/test/mount')
    // The router view, as in the app: the page is mounted again on Back.
    const app = await mountApp(RouterView, '/history', { attachTo: document.body })
    const router = app.vm.$router
    const loaded = () => settled(() => expect(app.findAll('[data-testid="history-row"]').length).toBeGreaterThan(0))
    await loaded()
    await app.get('[data-testid="sort-startedAt"]').trigger('click')
    await app.get('[data-testid="history-more"] button').trigger('click')
    await settle()
    expect(rows(app)).toHaveLength(200)
    await router.push('/result/many-050')
    await settled(() => expect(app.find('[data-testid="history-row"]').exists()).toBe(false))
    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/history'))
    await loaded()
    expect(rows(app)).toHaveLength(200)
    expect(app.get('[aria-sort="ascending"]').text()).toBe('Date')
    await router.push('/result/many-050')
    await router.push('/history')
    await loaded()
    expect(rows(app)).toHaveLength(100)
    expect(app.get('[aria-sort="descending"]').text()).toBe('Date')
    app.unmount()
  }, 20_000)
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
    // Long unbroken labels wrap inside the warning rather than run past it (QA-58).
    expect(panel.get('[data-testid="compare-warning"] > span').classes()).toEqual(expect.arrayContaining(['min-w-0', 'wrap-anywhere']))
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
    expect(notify).toHaveBeenCalledWith({ tone: 'ok', title: 'Comparison copied.' })
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
    await settled(() => expect(page.get('[data-testid="history-empty"]').text()).toContain('No results yet'))
    // The trigger left with the history: focus is on the empty state's Import JSON.
    await settled(() => expect(document.activeElement).toBe(page.get('[data-testid="empty-import"]').element))
    page.unmount()
  })

  it('drops the filter from the URL, so the next import lands in an unfiltered list', async () => {
    const page = await open('/history?q=hotel&units=bytes')
    await page.get('[data-testid="clear-all"]').trigger('click')
    await settle()
    await body().get('[data-testid="clear-confirm"]').trigger('click')
    await settled(() => expect(page.find('[data-testid="history-empty"]').exists()).toBe(true))
    await settled(() => expect(query(page)).toEqual({ units: 'bytes' }))
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
    // The records are checked one turn of the event loop at a time.
    const done = await settled(() => page.get('[data-testid="import-done"]'))
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

  it('counts the records it checks with a progress bar, and Cancel ends it with nothing written', async () => {
    const page = await open('/history', RESULTS.slice(0, 2))
    // The check yields after each record; the third turn is held, as a long file would hold it.
    let release = (): void => undefined
    let turns = 0
    vi.stubGlobal('scheduler', {
      yield: () => {
        turns += 1
        return turns < 3 ? Promise.resolve() : new Promise<void>((resolve) => (release = resolve))
      },
    })
    await choose(page, 'bitgauge-history.json', EXPORT(RESULTS))
    await settle()
    const busy = page.get('[data-testid="import-busy"]')
    expect(busy.text()).toContain(`Checking 3 of ${RESULTS.length} results…`)
    const bar = busy.get('[role="progressbar"]')
    expect(bar.attributes()).toMatchObject({ 'aria-label': 'Import progress', 'aria-valuemin': '0', 'aria-valuemax': String(RESULTS.length), 'aria-valuenow': '3' })
    await busy.get('[data-testid="import-cancel"]').trigger('click')
    release()
    await settle()
    expect(page.find('[data-testid="import-busy"]').exists()).toBe(false)
    expect(page.find('[data-testid="import-done"]').exists()).toBe(false)
    expect(rows(page)).toHaveLength(2)
    vi.unstubAllGlobals()
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
