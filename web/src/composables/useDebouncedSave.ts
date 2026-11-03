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

import { useEventListener } from '@vueuse/core'
import { onBeforeUnmount } from 'vue'

// A field saved as it changes (ui/screens.md sections 1 and 2: the label and the note): the value,
// with whatever names what it belongs to, is saved a moment after the last change, and at once when
// the field asks, when the component unmounts or when the page leaves or is hidden, so nothing
// typed is lost to a navigation. A save is awaitable: flush starts the one pending and resolves once
// it and every save already running have finished, so a reader after it sees the saved value. A
// page closed while a save runs may still lose it; the browser does not wait for an asynchronous
// write.

const SAVE_DELAY_MS = 300

const settled = (): void => undefined

export function useDebouncedSave<T>(save: (value: T) => Promise<unknown> | void) {
  let pending: { value: T; timer: ReturnType<typeof setTimeout> } | null = null
  const running = new Set<Promise<void>>()

  function start(value: T): void {
    // Tracked to its end whatever its outcome; the save reports its own failure.
    const saving = Promise.resolve(save(value)).then(settled, settled)
    running.add(saving)
    void saving.then(() => running.delete(saving))
  }

  /** Starts the pending save, if any; resolves once it and every running save have finished. */
  async function flush(): Promise<void> {
    if (pending !== null) {
      clearTimeout(pending.timer)
      const { value } = pending
      pending = null
      start(value)
    }
    await Promise.all(running)
  }

  function schedule(value: T): void {
    if (pending !== null) {
      clearTimeout(pending.timer)
    }
    pending = { value, timer: setTimeout(() => void flush(), SAVE_DELAY_MS) }
  }

  const flushNow = () => void flush()
  onBeforeUnmount(flushNow)
  useEventListener(window, 'pagehide', flushNow)
  // Best effort: a phone's browser may end a hidden page without pagehide.
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushNow()
    }
  })
  return { schedule, flush }
}
