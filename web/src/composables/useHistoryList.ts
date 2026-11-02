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

import { Trash2 } from '@lucide/vue'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { notify } from '@/components/feedback/notify'
import type { History } from '@/composables/useHistory'
import { correctedQuery, DEFAULT_SORT, filterFromQuery, filterResults, type HistoryFilter, queryFromFilter, type SortDirection, type SortKey, sortResults } from '@/history/filters'

// The History list's state (ui/screens.md section 3, ui/flows.md section 6): the filter, kept in
// the query string so Back and a reload keep it; the sort, newest first by default; the rows shown,
// 100 at a time; the selection; and deletion, at once with an undo toast for 8 s. Date ranges count back from the moment the page
// opened.

const FILTER_KEYS: readonly string[] = ['labels', 'contexts', 'range', 'q']

/** The rows the list adds at a time (ui/screens.md section 3). */
export const PAGE_SIZE = 100

/** The direction a column sorts in when first chosen: newest, fastest and best first, text A to Z. */
const FIRST_DIRECTION: Record<SortKey, SortDirection> = {
  startedAt: 'descending',
  download: 'descending',
  upload: 'descending',
  idle: 'ascending',
  jitter: 'ascending',
  grade: 'ascending',
  label: 'ascending',
  contextLabel: 'ascending',
  protocol: 'ascending',
  status: 'ascending',
}

export function useHistoryList(history: History) {
  const route = useRoute()
  const router = useRouter()
  const { t } = useI18n()
  const now = shallowRef(new Date())

  const filter = computed(() => filterFromQuery(route.query))
  // Only the filter's own keys change: the URL parameters of ui/url-params.md stay on any route.
  function replaceFilter(query: Record<string, string | string[]>): void {
    const others = Object.fromEntries(Object.entries(route.query).filter(([key]) => !FILTER_KEYS.includes(key)))
    void router.replace({ query: { ...others, ...query } })
  }
  function setFilter(next: HistoryFilter): void {
    replaceFilter(queryFromFilter(next))
  }
  // A filter the screen reads otherwise than the URL says is corrected in place, silently.
  watch(
    () => route.query,
    (query) => {
      const corrected = correctedQuery(query)
      if (corrected !== null) {
        replaceFilter(corrected)
      }
    },
    { immediate: true },
  )

  const filtered = computed(() => filterResults(history.results.value, filter.value, now.value))
  const sort = shallowRef(DEFAULT_SORT)
  const sorted = computed(() => sortResults(filtered.value, sort.value.key, sort.value.direction))

  // The rows rendered: the first 100 of the sorted set, 100 more at a time, from 100 again after a
  // change of filter or sort. Rendering every stored result at once takes seconds past a thousand.
  const limit = shallowRef(PAGE_SIZE)
  const shown = computed(() => sorted.value.slice(0, limit.value))
  watch([filter, sort], () => {
    limit.value = PAGE_SIZE
  })
  function showMore(): void {
    limit.value += PAGE_SIZE
  }

  /** A column's header: the sorted one turns around, another sorts in its first direction. */
  function sortBy(key: SortKey): void {
    const { key: current, direction } = sort.value
    sort.value = { key, direction: key !== current ? FIRST_DIRECTION[key] : direction === 'ascending' ? 'descending' : 'ascending' }
  }

  const selected = shallowRef<ReadonlySet<string>>(new Set())
  // A result that left the list, deleted or hidden by the filter, leaves the selection, so Delete
  // selected removes only rows in view.
  watch(filtered, (results) => {
    const shown = new Set(results.map((result) => result.id))
    if ([...selected.value].some((id) => !shown.has(id))) {
      selected.value = new Set([...selected.value].filter((id) => shown.has(id)))
    }
  })
  function toggle(id: string): void {
    const next = new Set(selected.value)
    if (!next.delete(id)) {
      next.add(id)
    }
    selected.value = next
  }
  function clearSelection(): void {
    selected.value = new Set()
  }

  async function remove(ids: readonly string[]): Promise<void> {
    const removed = await history.remove(ids)
    if (removed.length === 0) {
      return
    }
    notify({
      tone: 'info',
      icon: Trash2,
      title: t('history.deleted.title', { n: removed.length }, removed.length),
      undo: { label: t('history.deleted.undo'), countdown: true, onClick: () => void history.restore(removed) },
    })
  }

  return { now, filter, setFilter, filtered, sort, sorted, shown, showMore, sortBy, selected, toggle, clearSelection, remove }
}

/** The storage this origin uses, where the browser can estimate it (ui/screens.md section 3). */
export async function storageUsage(storage: Pick<StorageManager, 'estimate'> | undefined = navigator.storage): Promise<number | null> {
  try {
    const estimate = await storage?.estimate()
    return estimate?.usage ?? null
  } catch {
    return null
  }
}
