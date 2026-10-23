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

import type { Notice } from '@/engine/messages'

// What a throughput phase raises live (architecture.md section 4): the `extended` and `data-cap`
// events with their notices, held until the next sample carries them, each exactly once.

/** The events and notices a phase raised since they were last drained. */
export class LiveQueue<E> {
  private events: E[] = []
  private notices: Notice[] = []

  /** Holds `event` and its `notice` for the next sample. */
  push(event: E, notice: Notice): void {
    this.events.push(event)
    this.notices.push(notice)
  }

  /** What was raised since the last drain, which it empties. */
  drain(): { events: E[]; notices: Notice[] } {
    const drained = { events: this.events, notices: this.notices }
    this.events = []
    this.notices = []
    return drained
  }

  /** Whether something waits for a sample. */
  get pending(): boolean {
    return this.events.length > 0
  }
}
