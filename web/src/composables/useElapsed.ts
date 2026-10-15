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

import { type Ref, shallowRef, watch, type WatchSource } from 'vue'

// How long the current run has gone on, on the page's own clock: read again at each change of the
// run's progress while it runs, held where the run ended, and started over with the next run
// (ui/screens.md section 1, the Test card's duration). It moves with what the engine reports, so a
// run the demo holds still holds its duration too. It is display only: the result's is the engine's.

export function useElapsed(running: Readonly<Ref<boolean>>, progress: WatchSource, now: () => number = () => performance.now()): Readonly<Ref<number | null>> {
  const elapsed = shallowRef<number | null>(null)
  let startedAt: number | null = null

  function read(): void {
    if (startedAt !== null) {
      elapsed.value = now() - startedAt
    }
  }

  watch(
    running,
    (value) => {
      if (value) {
        startedAt = now()
        elapsed.value = 0
        return
      }
      read()
      startedAt = null
    },
    { immediate: true },
  )
  watch(progress, read)
  return elapsed
}
