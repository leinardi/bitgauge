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

import { computed, type Ref, shallowRef, watch } from 'vue'

import { type History, useHistory } from '@/composables/useHistory'
import type { Result } from '@/engine/messages'

// The Test screen's side of history (ui/flows.md section 1 step 5): a `complete` result is saved
// automatically as the run ends; a `partial` or `error` one only when the user keeps it, never here.
// Where history is unavailable, the result says it was not saved (edge-cases.md section 7).

/**
 * What became of the ended run's result: being saved, saved, not saved because a write failed, or
 * not saved because history is unavailable in this browser; null for a partial or error result in
 * a browser that has history, which only the user's Keep saves.
 */
export type SaveState = 'saving' | 'saved' | 'failed' | 'unavailable'

export function useResultSave(result: Readonly<Ref<Result | null>>, history: History = useHistory()) {
  /** The latest complete result's id and how its save went. */
  const latest = shallowRef<{ id: string; state: SaveState } | null>(null)

  watch(
    result,
    async (next) => {
      if (next === null || next.status !== 'complete' || latest.value?.id === next.id) {
        return
      }
      latest.value = { id: next.id, state: 'saving' }
      const saved = await history.save(next)
      if (latest.value?.id === next.id) {
        latest.value = { id: next.id, state: saved ? 'saved' : history.status.value === 'unavailable' ? 'unavailable' : 'failed' }
      }
    },
    { immediate: true },
  )

  const state = computed<SaveState | null>(() => {
    const shown = result.value
    if (shown === null) {
      return null
    }
    if (shown.status === 'complete') {
      return latest.value?.id === shown.id ? latest.value.state : 'saving'
    }
    return history.status.value === 'unavailable' ? 'unavailable' : null
  })

  return { state }
}
