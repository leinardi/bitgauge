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

// Download JSON on the Result detail waits for the note just typed (QA-110): it saves the note
// pending and waits for every write to history, the one already running too, then exports the
// result as history holds it. History's write is held here until the test releases it.

import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

import { demoHistoryResults } from '@/demo/history'
import type { Result } from '@/engine/messages'
import { openHistoryDB } from '@/history/db'
import { freshIndexedDB } from '@/test/idb'

vi.mock('@/components/feedback/notify', () => ({ notify: vi.fn() }))

const NEWEST = demoHistoryResults('populated')[0] as Result
// The note's pause before it saves, and a little more.
const PAUSE_MS = 350
const saved = vi.fn<(filename: string, content: string | Blob, type: string) => void>()

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

/** The page at the newest result, with history's edit held until `release` is called. */
async function open(): Promise<{ page: VueWrapper; release: () => void; edits: string[] }> {
  const db = await openHistoryDB()
  await db.put('results', NEWEST)
  db.close()
  vi.resetModules()
  vi.doMock('@/composables/useRun', () => ({ lastRunResult: shallowRef(null) }))
  vi.doMock('@/lib/saveFile', () => ({ saveFile: saved }))
  const { useHistory } = await import('@/composables/useHistory')
  const history = useHistory()
  const write = history.edit.bind(history)
  const held: (() => void)[] = []
  const edits: string[] = []
  history.edit = async (id, edit) => {
    edits.push(edit.note ?? edit.label ?? '')
    await new Promise<void>((resolve) => held.push(resolve))
    return write(id, edit)
  }
  const { default: ResultDetailPage } = await import('@/pages/ResultDetailPage.vue')
  const { mountApp } = await import('@/test/mount')
  const page = await mountApp(ResultDetailPage, `/result/${NEWEST.id}`, { attachTo: document.body })
  await vi.waitFor(() => expect(page.find('[data-testid="note-field"]').exists()).toBe(true))
  await settle()
  return { page, release: () => held.splice(0).forEach((resolve) => resolve()), edits }
}

/** The one result of the last file saved. */
function exported(): Result | undefined {
  return (JSON.parse(String(saved.mock.calls.at(-1)?.[1])) as { results: Result[] }).results[0]
}

beforeAll(async () => {
  await import('@/pages/ResultDetailPage.vue')
}, 60_000)

beforeEach(() => {
  freshIndexedDB()
  localStorage.clear()
  saved.mockClear()
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.doUnmock('@/composables/useRun')
  vi.doUnmock('@/lib/saveFile')
})

describe('Download JSON after a note is typed', () => {
  it('waits for the pending note to be written, then exports it', async () => {
    const { page, release, edits } = await open()
    await page.get('[data-testid="note-field"]').setValue('Typed just now')
    // Download at once: the save is still pending, nothing written yet.
    await page.get('[data-testid="download-json"]').trigger('click')
    await settle()
    expect(edits).toEqual(['Typed just now'])
    expect(saved).not.toHaveBeenCalled()
    release()
    await settle()
    expect(saved).toHaveBeenCalledOnce()
    expect(exported()?.note).toBe('Typed just now')
    page.unmount()
  })

  it('waits for a save already running when Download is clicked', async () => {
    const { page, release, edits } = await open()
    await page.get('[data-testid="note-field"]').setValue('Running save')
    // The pause ends: the save starts and is held mid-write.
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
    expect(edits).toEqual(['Running save'])
    await page.get('[data-testid="download-json"]').trigger('click')
    await settle()
    expect(saved).not.toHaveBeenCalled()
    release()
    await settle()
    expect(edits).toEqual(['Running save'])
    expect(exported()?.note).toBe('Running save')
    page.unmount()
  })

  it('saves a label being typed first, and exports it', async () => {
    const { page, release, edits } = await open()
    await page.get('[data-testid="edit-label"]').trigger('click')
    await settle()
    await page.get('[data-testid="label-input"]').setValue('Typed label')
    await page.get('[data-testid="download-json"]').trigger('click')
    await settle()
    expect(edits).toEqual(['Typed label'])
    expect(saved).not.toHaveBeenCalled()
    release()
    await settle()
    expect(exported()?.label).toBe('Typed label')
    page.unmount()
  })
})
