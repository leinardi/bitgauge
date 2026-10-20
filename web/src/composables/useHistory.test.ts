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

// The application's history (frontend.md section 5, edge-cases.md section 7): available or not for
// the session, every change reflected in the list, and an edited result that exports and imports
// back as it was.

import { describe, expect, it } from 'vitest'

import { createHistory, useHistory } from '@/composables/useHistory'
import { openIfAvailable } from '@/history/availability'
import { openHistoryDB } from '@/history/db'
import { historyExport } from '@/history/export'
import { resultFixture } from '@/test/fixtures'
import { freshIndexedDB } from '@/test/idb'

async function opened() {
  freshIndexedDB()
  const history = createHistory(openIfAvailable, null)
  await history.refresh()
  return history
}

describe('the history', () => {
  it('is unavailable where the database cannot open, and saves nothing', async () => {
    const history = createHistory(() => openIfAvailable(() => Promise.reject(new DOMException('blocked', 'InvalidStateError'))), null)
    await history.refresh()
    expect(history.status.value).toBe('unavailable')
    expect(await history.save(resultFixture())).toBe(false)
    expect(await history.importText('{}')).toEqual({ ok: false, refused: 'not-history' })
  })

  it('is unavailable without IndexedDB at all', async () => {
    const saved = globalThis.indexedDB
    Reflect.deleteProperty(globalThis, 'indexedDB')
    try {
      expect(await openIfAvailable()).toBeNull()
    } finally {
      globalThis.indexedDB = saved
    }
  })

  it('becomes unavailable for the session once the quota is spent', async () => {
    freshIndexedDB()
    const db = await openHistoryDB()
    const put = db.put.bind(db)
    db.put = () => Promise.reject(new DOMException('full', 'QuotaExceededError'))
    const history = createHistory(() => Promise.resolve(db), null)
    await history.refresh()
    expect(history.status.value).toBe('available')
    expect(await history.save(resultFixture())).toBe(false)
    expect(history.status.value).toBe('unavailable')
    db.put = put
  })

  it('keeps the list newest first through save, remove, restore and clear', async () => {
    const history = await opened()
    expect(history.status.value).toBe('available')
    await history.save(resultFixture({ id: 'a', startedAt: '2026-10-01T00:00:00.000Z' }))
    await history.save(resultFixture({ id: 'b', startedAt: '2026-10-02T00:00:00.000Z' }))
    expect(history.results.value.map((r) => r.id)).toEqual(['b', 'a'])
    const removed = await history.remove(['b'])
    expect(history.results.value.map((r) => r.id)).toEqual(['a'])
    await history.restore(removed)
    expect(history.results.value.map((r) => r.id)).toEqual(['b', 'a'])
    // A listed result goes back into a write as it is.
    expect(await history.save(history.results.value[0] ?? resultFixture())).toBe(true)
    await history.restore(history.results.value)
    expect(history.results.value.map((r) => r.id)).toEqual(['b', 'a'])
    await history.clear()
    expect(history.results.value).toEqual([])
  })

  it('answers false, not a rejection, when a save fails otherwise', async () => {
    freshIndexedDB()
    const db = await openHistoryDB()
    db.put = () => Promise.reject(new DOMException('gone', 'InvalidStateError'))
    const history = createHistory(() => Promise.resolve(db), null)
    await history.refresh()
    expect(await history.save(resultFixture())).toBe(false)
  })

  it('round-trips an edited label and note through the JSON export and import, beside a record without a note', async () => {
    const history = await opened()
    const bare = resultFixture({ id: 'bare', startedAt: '2026-09-01T00:00:00.000Z' })
    await history.save(bare)
    await history.save(resultFixture({ id: 'edited' }))
    await history.edit('edited', { label: 'Kitchen', note: 'after the router swap' })
    const file = historyExport(history.results.value, new Date())
    expect(file).not.toBeNull()

    const other = await opened()
    expect(await other.importText(file?.json ?? '')).toEqual({ ok: true, added: 2, skipped: 0, rejected: [] })
    expect(other.results.value).toEqual(history.results.value)
    expect(other.results.value.find((r) => r.id === 'edited')).toMatchObject({ label: 'Kitchen', note: 'after the router swap' })
    expect('note' in (other.results.value.find((r) => r.id === 'bare') ?? {})).toBe(false)
    // The same file again only skips.
    expect(await other.importText(file?.json ?? '')).toEqual({ ok: true, added: 0, skipped: 2, rejected: [] })
  })

  it('is one history for the whole application', async () => {
    freshIndexedDB()
    const history = useHistory()
    expect(useHistory()).toBe(history)
    await history.refresh()
    expect(history.status.value).toBe('available')
  })

  it('refuses a file as a whole with its reason', async () => {
    const history = await opened()
    expect(await history.importText('not json')).toEqual({ ok: false, refused: 'not-json' })
  })
})
