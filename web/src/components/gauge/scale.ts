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

// The gauge's geometry (measurement.md section 14, design_system/components/gauge.md): a 270°
// arc that starts at 135° (lower left) and turns clockwise, mapped logarithmically onto a window
// of decades, with 1, 2 and 5 ticks per decade. Angles are in degrees, clockwise from 3 o'clock,
// as SVG draws them.

export const START_ANGLE = 135
export const SWEEP = 270

/** A logarithmic range shown on the arc. */
export interface Scale {
  lo: number
  hi: number
}

/** The fixed idle-latency scale, 1–1000 ms, which never shifts. */
export const MS_SCALE: Scale = { lo: 1, hi: 1000 }

/** The rate window [10^k, 10^(k+4)). */
export function rateScale(k: number): Scale {
  return { lo: 10 ** k, hi: 10 ** (k + 4) }
}

/** Where `value` sits on the arc, 0 at the start and 1 at the end; outside the scale it pins. */
export function fraction(value: number, scale: Scale): number {
  if (!(value > scale.lo)) {
    return 0
  }
  if (value >= scale.hi) {
    return 1
  }
  return Math.log10(value / scale.lo) / Math.log10(scale.hi / scale.lo)
}

/** The angle of a fraction of the arc. */
export function angle(at: number): number {
  return START_ANGLE + SWEEP * at
}

/** The point at `degrees` on a circle. */
export function point(cx: number, cy: number, r: number, degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) }
}

/** The SVG path of the arc between two fractions; empty when they enclose nothing. */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const start = Math.min(Math.max(from, 0), 1)
  const end = Math.min(Math.max(to, 0), 1)
  if (end <= start) {
    return ''
  }
  const a = point(cx, cy, r, angle(start))
  const b = point(cx, cy, r, angle(end))
  const large = SWEEP * (end - start) > 180 ? 1 : 0
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)}A${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

export interface Tick {
  value: number
  at: number
  /** The decade's 1, which carries a label. */
  major: boolean
}

/** The 1, 2 and 5 of every decade inside the scale, ends included. */
export function ticks(scale: Scale): Tick[] {
  const result: Tick[] = []
  const first = Math.floor(Math.log10(scale.lo))
  const last = Math.ceil(Math.log10(scale.hi))
  for (let decade = first; decade <= last; decade++) {
    for (const step of [1, 2, 5]) {
      const value = step * 10 ** decade
      // A relative tolerance keeps the floating-point ends of the scale.
      if (value >= scale.lo * (1 - 1e-9) && value <= scale.hi * (1 + 1e-9)) {
        result.push({ value, at: fraction(value, scale), major: step === 1 })
      }
    }
  }
  return result
}
