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

import { type ComputedRef, onScopeDispose, type Ref, watch } from 'vue'

import type { ScreenState } from '@/components/test/screen/states'
import { type History, useHistory } from '@/composables/useHistory'
import { holdEndedRun, takeEndedRun, type useRun } from '@/composables/useRun'
import { peekRunAgain } from '@/composables/useRunAgain'

// Back from the Details of a run that ended Cancelled or Error (ui/flows.md section 4, D-20): the
// Test screen leaves with the run's whole view held, and the next Test screen shows it again, ended,
// with Keep in history, Details and Download JSON, until a new run starts or the page reloads. A
// pending Run again drops it: that run starts at once instead. Whether the result was kept is read
// back from history, as the Result detail reads it.

export interface EndedRunInput {
  run: ReturnType<typeof useRun>
  state: ComputedRef<ScreenState>
  /** The screen's Keep in history state, set from history for a restored result. */
  kept: Ref<boolean>
  /** The gauge's window, which the run moved: held and restored with the run. */
  gaugeWindow: Ref<number>
  history?: History
}

/** The held run's gauge window, which belongs to the screen rather than the run. */
let heldWindow: number | null = null

export function useEndedRun({ run, state, kept, gaugeWindow, history = useHistory() }: EndedRunInput): void {
  const held = takeEndedRun()
  if (held !== null && !peekRunAgain()) {
    run.restore(held)
    gaugeWindow.value = heldWindow ?? gaugeWindow.value
    const id = held.view.result?.id
    let read = false
    watch(
      history.status,
      (status) => {
        if (read || status === 'loading') {
          return
        }
        read = true
        kept.value = history.results.value.some((result) => result.id === id)
      },
      { immediate: true },
    )
  }
  onScopeDispose(() => {
    const ended = (state.value === 'cancelled' || state.value === 'error') && run.result.value !== null
    holdEndedRun(ended ? run.snapshot() : null)
    heldWindow = ended ? gaugeWindow.value : null
  })
}
