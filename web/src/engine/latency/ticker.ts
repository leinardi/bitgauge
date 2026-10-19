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

import type { Clock, ProbeTiming, TimerId, Transport } from '@/engine/types'

// The 300 ms probe cadence of the loaded-latency paths (measurement.md sections 11.2 and 12.3), on
// the injected clock, and the HTTP probe each tick sends: the loop path A's HTTP fallback runs,
// single-outstanding, and path B reuses.

/** The interval between two ticks. */
const PROBE_INTERVAL_MS = 300

/** Runs `tick` at start and every interval after it until stopped; a stopped ticker stays stopped. */
export class Ticker {
  private readonly clock: Clock
  private readonly tick: () => void
  private timer: TimerId | null = null
  private stopped = false

  constructor(clock: Clock, tick: () => void) {
    this.clock = clock
    this.tick = tick
  }

  start(): void {
    if (this.stopped) {
      return
    }
    this.timer = this.clock.setTimer(PROBE_INTERVAL_MS, () => this.start())
    this.tick()
  }

  stop(): void {
    this.stopped = true
    if (this.timer !== null) {
      this.clock.clearTimer(this.timer)
      this.timer = null
    }
  }
}

/**
 * Sends one HTTP probe to `path`. `settled` gets the probe once it is answered, or null when it
 * fails or is aborted; the returned controller aborts it. The caller keeps it the only one
 * outstanding.
 */
export function sendProbe(transport: Pick<Transport, 'probe'>, path: string, settled: (probe: ProbeTiming | null) => void): AbortController {
  const controller = new AbortController()
  transport.probe(path, controller.signal).then(settled, () => settled(null))
  return controller
}
