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

import { getCurrentScope, onScopeDispose, type Ref, shallowRef, watch } from 'vue'

// The gauge's window shift (design_system/components/gauge.md, rule 8): the window's decade k
// tweens over the --dur-slow token (280 ms) on the --ease-out curve in log space, so the ticks,
// their labels and the needle, all placed on the tweened scale, move together; under
// prefers-reduced-motion it jumps.

/** The --dur-slow token in milliseconds, 280 when the page does not define it. */
function shiftMs(): number {
  const token = getComputedStyle(document.documentElement).getPropertyValue('--dur-slow').trim()
  const ms = Number.parseFloat(token)
  return token.endsWith('ms') && ms > 0 ? ms : 280
}

// The --ease-out token, cubic-bezier(0.22, 1, 0.36, 1).
const EASE = { x1: 0.22, y1: 1, x2: 0.36, y2: 1 }

function bezier(t: number, p1: number, p2: number): number {
  const u = 1 - t
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t
}

/** The eased progress at time fraction `x`: solves the curve's x(t) = x by bisection, then y(t). */
function ease(x: number): number {
  let low = 0
  let high = 1
  for (let step = 0; step < 30; step++) {
    const middle = (low + high) / 2
    if (bezier(middle, EASE.x1, EASE.x2) < x) {
      low = middle
    } else {
      high = middle
    }
  }
  return bezier((low + high) / 2, EASE.y1, EASE.y2)
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** The decade the gauge draws, following `target` with the shift tween; `shifting` while it runs. */
export function useWindowTween(target: Readonly<Ref<number>>) {
  const shown = shallowRef(target.value)
  const shifting = shallowRef(false)
  let frame: number | null = null

  function cancel(): void {
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
    shifting.value = false
  }

  watch(target, (to) => {
    cancel()
    if (reducedMotion()) {
      shown.value = to
      return
    }
    const from = shown.value
    const duration = shiftMs()
    let start: number | null = null
    shifting.value = true
    const step = (now: number) => {
      start ??= now
      const progress = Math.min(1, (now - start) / duration)
      shown.value = progress < 1 ? from + (to - from) * ease(progress) : to
      if (progress < 1) {
        frame = requestAnimationFrame(step)
      } else {
        frame = null
        shifting.value = false
      }
    }
    frame = requestAnimationFrame(step)
  })

  if (getCurrentScope() !== undefined) {
    onScopeDispose(cancel)
  }
  return { shown, shifting }
}
