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

// The history store on fake-indexeddb (frontend.md section 5): the database's shape, every
// operation, migration on read, and the persistence request of the first save.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DB_NAME, DB_VERSION, openHistoryDB } from '@/history/db'
import { createHistoryStore } from '@/history/store'
import { resultFixture } from '@/test/fixtures'
import { freshIndexedDB } from '@/test/idb'

const OLD = resultFixture({ id: 'old', startedAt: '2026-10-01T08:00:00.000Z', label: 'LAN' })
const NEW = resultFixture({ id: 'new', startedAt: '2026-10-09T08:00:00.000Z', label: 'VPN' })
const MID = resultFixture({ id: 'mid', startedAt: '2026-10-05T08:00:00.000Z' })

beforeEach(() => {
  freshIndexedDB()
})

async function store(persist: (() => Promise<boolean>) | null = null) {
  const db = await openHistoryDB()
  return { db, store: createHistoryStore(db, persist) }
}

describe('the database', () => {
  it('is bitgauge, version 1, with the results store keyed by id and its two indexes', async () => {
    const { db } = await store()
    expect([db.name, db.version, DB_NAME, DB_VERSION]).toEqual(['bitgauge', 1, 'bitgauge', 1])
    expect([...db.objectStoreNames]).toEqual(['results'])
    const results = db.transaction('results').store
    expect(results.keyPath).toBe('id')
    expect([...results.indexNames].sort()).toEqual(['label', 'startedAt'])
    db.close()
  })
})

describe('the store', () => {
  it('saves, gets, lists newest first and counts', async () => {
    const { store: history } = await store()
    for (const result of [OLD, NEW, MID]) {
      await history.save(result)
    }
    expect(await history.get('mid')).toEqual(MID)
    expect(await history.get('none')).toBeUndefined()
    expect((await history.list()).map((result) => result.id)).toEqual(['new', 'mid', 'old'])
    expect(await history.count()).toBe(3)
    expect(await history.ids()).toEqual(new Set(['old', 'new', 'mid']))
  })

  it('removes at once, restores what it removed, and clears', async () => {
    const { store: history } = await store()
    await history.save(OLD)
    await history.save(NEW)
    const removed = await history.remove(['new', 'none'])
    expect(removed).toEqual([NEW])
    expect(await history.count()).toBe(1)
    await history.restore(removed)
    expect((await history.list()).map((result) => result.id)).toEqual(['new', 'old'])
    await history.clear()
    expect(await history.count()).toBe(0)
  })

  it('edits the label and note and writes the record back', async () => {
    const { store: history } = await store()
    await history.save(OLD)
    expect(await history.edit('old', { note: 'after the router swap' })).toEqual({ ...OLD, note: 'after the router swap' })
    expect(await history.edit('old', { label: 'Office' })).toEqual({ ...OLD, label: 'Office', note: 'after the router swap' })
    expect(await history.get('old')).toEqual({ ...OLD, label: 'Office', note: 'after the router swap' })
    expect(await history.edit('none', { note: 'x' })).toBeUndefined()
  })

  it('reads a v0.1 record without a note, and keeps out of the list one it cannot read', async () => {
    const { db, store: history } = await store()
    const v01 = { ...OLD }
    Reflect.deleteProperty(v01, 'note')
    await db.put('results', v01)
    await db.put('results', { ...NEW, schemaVersion: 2 as 1 })
    await db.put('results', { ...MID, status: 'great' as 'complete' })
    expect((await history.list()).map((result) => result.id)).toEqual(['old'])
    expect(await history.get('new')).toBeUndefined()
    // Unreadable records stay stored.
    expect(await history.count()).toBe(3)
  })

  it('asks for persistent storage on the first save only', async () => {
    const persist = vi.fn(() => Promise.resolve(true))
    const { store: history } = await store(persist)
    await history.save(OLD)
    await history.save(NEW)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('saves even when the persistence request fails', async () => {
    const { store: history } = await store(() => Promise.reject(new Error('denied')))
    await history.save(OLD)
    expect(await history.count()).toBe(1)
  })
})
