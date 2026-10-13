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

// The Worker's busy fraction (measurement.md section 16, edge-cases.md section 10): the time it
// spends executing its own tasks, as the Clock measures it, divided by the elapsed time. Above 90 %
// over a direction's steady window, the browser rather than the link limits the number.

const CPU_BOUND_FRACTION = 0.9

/** The busy time sampled on the housekeeping tick. */
export class BusyTrack {
  private readonly samples: { at: number; busyMs: number }[] = []

  record(at: number, busyMs: number): void {
    const last = this.samples.at(-1)
    if (last === undefined || at > last.at) {
      this.samples.push({ at, busyMs })
    }
  }

  /** The busy fraction over [from, to], clamped to the sampled span; null without a span. */
  fraction(from: number, to: number): number | null {
    const first = this.samples[0]
    const last = this.samples.at(-1)
    if (first === undefined || last === undefined) {
      return null
    }
    const start = Math.max(from, first.at)
    const end = Math.min(to, last.at)
    if (end <= start) {
      return null
    }
    return (this.busyAt(end) - this.busyAt(start)) / (end - start)
  }

  /** The busy time at `at`, linear between the two samples around it. */
  private busyAt(at: number): number {
    let before = this.samples[0] ?? { at, busyMs: 0 }
    for (const sample of this.samples) {
      if (sample.at >= at) {
        const span = sample.at - before.at
        return span === 0 ? sample.busyMs : before.busyMs + ((sample.busyMs - before.busyMs) * (at - before.at)) / span
      }
      before = sample
    }
    return before.busyMs
  }
}

/** Whether a busy fraction makes the direction `cpu-bound`. */
export function cpuBound(fraction: number | null): boolean {
  return fraction !== null && fraction > CPU_BOUND_FRACTION
}
