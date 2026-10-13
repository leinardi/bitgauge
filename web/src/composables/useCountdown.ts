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

import { onScopeDispose, type ShallowRef, shallowRef } from 'vue'

// The auto-start countdown of ui/flows.md section 2: 3 s before a run the link asked for, which
// Cancel or Escape stops and Start now ends at once. While the page is hidden it pauses, and it
// carries on once the page is visible again.

const COUNTDOWN_MS = 3000
const TICK_MS = 100

export function useCountdown(totalMs = COUNTDOWN_MS) {
  /** The time left, or null when no countdown is running. */
  const remainingMs = shallowRef<number | null>(null)
  let timer: ReturnType<typeof setInterval> | null = null
  let done: (() => void) | null = null

  function clear(): void {
    if (timer !== null) {
      clearInterval(timer)
    }
    timer = null
    done = null
    remainingMs.value = null
  }

  function tick(): void {
    const left = remainingMs.value
    if (left === null || document.visibilityState === 'hidden') {
      return
    }
    if (left - TICK_MS <= 0) {
      now()
    } else {
      remainingMs.value = left - TICK_MS
    }
  }

  /** Ends the countdown and starts the run at once. */
  function now(): void {
    const start = done
    clear()
    start?.()
  }

  onScopeDispose(clear)

  return {
    remainingMs: remainingMs as Readonly<ShallowRef<number | null>>,
    totalMs,

    /** Counts down, then calls `onDone`; a countdown already running starts over. */
    start(onDone: () => void): void {
      clear()
      done = onDone
      remainingMs.value = totalMs
      timer = setInterval(tick, TICK_MS)
    },

    /** Stops the countdown; nothing starts. */
    cancel: clear,

    now,
  }
}
