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

// The gauge's window rule (measurement.md section 14): four log decades [10^k, 10^(k+4)) that
// follow the gauge value, one decade down after 2 s in the bottom decade, one up after 2 s in the
// top one. It is a pure function of the value stream and the clock, and presentation only: no
// number is derived from it. Values are in the display unit, bit/s or B/s.

/** What the gauge shows: a rate in bits or bytes, or the fixed milliseconds scale. */
export type GaugeUnit = 'bits' | 'bytes' | 'ms'

/** How long a value must stay in the bottom or top decade before the window moves. */
export const DWELL_MS = 2000

const LIMITS = {
  bits: { min: 4, max: 6, start: 6 },
  bytes: { min: 3, max: 6, start: 5 },
} as const

export interface WindowState {
  /** The window's lowest decade: it shows [10^k, 10^(k+4)). */
  k: number
  /** The decade the value is held in, -1 bottom, 1 top, 0 neither. */
  zone: -1 | 0 | 1
  /** When the value entered that zone. */
  since: number
}

/** The window a run's first direction starts in: 1 Mbit/s–10 Gbit/s, or 100 kB/s–1 GB/s. */
export function startK(unit: Exclude<GaugeUnit, 'ms'>): number {
  return LIMITS[unit].start
}

/** A window at `k`, with no value held yet. */
export function windowAt(k: number): WindowState {
  return { k, zone: 0, since: 0 }
}

/**
 * The window after `value` arrives at `now` (milliseconds). Leaving a zone restarts its hold; a
 * window already at the floor or the ceiling has no zone below or above, so the needle pins.
 */
export function stepWindow(state: WindowState, value: number, now: number, unit: GaugeUnit): WindowState {
  if (unit === 'ms') {
    return state
  }
  const zone = zoneOf(value, state.k, unit)
  if (zone !== state.zone) {
    return { k: state.k, zone, since: now }
  }
  if (zone !== 0 && now - state.since >= DWELL_MS) {
    // The new window's own hold starts now, with the same value.
    const k = state.k + zone
    return { k, zone: zoneOf(value, k, unit), since: now }
  }
  return state
}

function zoneOf(value: number, k: number, unit: Exclude<GaugeUnit, 'ms'>): -1 | 0 | 1 {
  const { min, max } = LIMITS[unit]
  if (value < 10 ** (k + 1) && k > min) {
    return -1
  }
  return value > 10 ** (k + 3) && k < max ? 1 : 0
}

/**
 * The window after each value of a stream, `values[i]` arriving at `clock[i]` milliseconds,
 * starting from `startK` (the start window for a run's first direction, the first direction's last
 * window for the second).
 */
export function trackWindow(values: readonly number[], clock: readonly number[], options: { unit: GaugeUnit; startK: number }): number[] {
  let state = windowAt(options.startK)
  return values.map((value, index) => {
    state = stepWindow(state, value, clock[index] ?? 0, options.unit)
    return state.k
  })
}
