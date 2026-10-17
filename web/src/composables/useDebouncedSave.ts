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
// the field asks, when the component unmounts or when the page leaves, so nothing typed is lost to a
// navigation.

const SAVE_DELAY_MS = 300

export function useDebouncedSave<T>(save: (value: T) => void) {
  let pending: { value: T; timer: ReturnType<typeof setTimeout> } | null = null

  function flush(): void {
    if (pending !== null) {
      clearTimeout(pending.timer)
      const { value } = pending
      pending = null
      save(value)
    }
  }

  function schedule(value: T): void {
    if (pending !== null) {
      clearTimeout(pending.timer)
    }
    pending = { value, timer: setTimeout(flush, SAVE_DELAY_MS) }
  }

  onBeforeUnmount(flush)
  useEventListener(window, 'pagehide', flush)
  return { schedule, flush }
}
