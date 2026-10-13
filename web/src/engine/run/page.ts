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

import type { PhaseName } from '@/engine/messages'

// The page's visibility over a run, and what a housekeeping tick more than 1 s late meant
// (edge-cases.md section 5).

export class PageState {
  /** The page was hidden at some point of the run: the page-hidden notice. */
  hidden: boolean
  /** A tick was more than 1 s late while the page stayed visible: timer-throttling-detected. */
  throttled = false
  private visible: boolean
  /** When the page last became visible again. */
  private shownAt: number | null = null
  private hiddenDuringIdle = false

  constructor(visible: boolean) {
    this.visible = visible
    this.hidden = !visible
  }

  /** Idle latency begins: a page hidden since before it also restarts it once visible. */
  idleStarted(): void {
    this.hiddenDuringIdle = !this.visible
  }

  /** A visibility change; true when idle latency, hidden while it ran, must start over. */
  change(visible: boolean, now: number, phase: PhaseName): boolean {
    this.visible = visible
    if (!visible) {
      this.hidden = true
      this.hiddenDuringIdle ||= phase === 'idle'
      return false
    }
    this.shownAt = now
    const restart = phase === 'idle' && this.hiddenDuringIdle
    this.hiddenDuringIdle = false
    return restart
  }

  /**
   * A tick more than 1 s late after the on-time tick at `lastTick`: true when the browser paused
   * the hidden page. The page counts as hidden when it was at any point since that tick, whichever
   * of the late tick and the visibility message the resumed Worker handles first; otherwise the
   * browser throttled a visible page.
   */
  paused(lastTick: number): boolean {
    const paused = !this.visible || (this.shownAt !== null && this.shownAt > lastTick)
    this.throttled ||= !paused
    return paused
  }
}
