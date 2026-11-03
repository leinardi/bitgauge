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

import { inject, type InjectionKey, onBeforeUnmount } from 'vue'

import type { Result } from '@/engine/messages'

// The Result detail's edits in progress (ui/screens.md section 2): the label and the note save as
// they change, and Download JSON first saves every edit typed and waits for its write, then exports
// the result as history holds it, so the file carries the note just typed.

export interface ResultEdits {
  /** Registers a field's flush, which saves its edit at once; returns its removal. */
  register(flush: () => Promise<unknown> | void): () => void
  /** Tracks a write to history until it ends. */
  track(write: Promise<unknown>): void
  /** Saves every edit typed, waits for every write, then reads the stored result again. */
  flushEdits(): Promise<Result | null>
}

export const RESULT_EDITS: InjectionKey<ResultEdits> = Symbol('result-edits')

const settled = (): void => undefined

/** The edits of a Result detail whose stored result is `latest`. */
export function createResultEdits(latest: () => Result | null): ResultEdits {
  const flushes = new Set<() => Promise<unknown> | void>()
  const writes = new Set<Promise<void>>()
  return {
    register(flush) {
      flushes.add(flush)
      return () => flushes.delete(flush)
    },
    track(write) {
      const tracked = write.then(settled, settled)
      writes.add(tracked)
      void tracked.then(() => writes.delete(tracked))
    },
    async flushEdits() {
      await Promise.all([...flushes].map(async (flush) => flush()))
      await Promise.all(writes)
      return latest()
    },
  }
}

/** Registers a field's flush with the Result detail around it, if any, for the field's life. */
export function useResultEdit(flush: () => Promise<unknown> | void): void {
  const edits = inject(RESULT_EDITS, null)
  if (edits !== null) {
    onBeforeUnmount(edits.register(flush))
  }
}

/** The Result detail's edits, where a component sits inside one. */
export function useResultEdits(): ResultEdits | null {
  return inject(RESULT_EDITS, null)
}
