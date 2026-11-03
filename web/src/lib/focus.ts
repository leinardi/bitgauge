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

import { nextTick } from 'vue'

// Focus that loses its control moves to the one that takes its place, never to the page body
// (ui/i18n-a11y.md section 2.3).

type Target = Element | null | undefined

/** Moves focus to `target`, which a heading or another element that is no control takes from script. */
export function moveFocus(target: Element | null | undefined): void {
  if (!(target instanceof HTMLElement)) {
    return
  }
  if (!target.hasAttribute('tabindex') && target.tabIndex < 0) {
    target.tabIndex = -1
  }
  target.focus()
}

/**
 * Notes whether `leaving`, the control or the part about to go, holds the focus, and returns what
 * hands it on: awaited after the change, it moves the focus to `next()` when the focus is still in
 * `leaving` (gone, hidden or disabled) or fell to the page body. A focus the change did not touch,
 * or that something else already moved, stays where it is; so does one that was on the page body
 * to begin with.
 */
export function focusHandOff(leaving: Target): (next: () => Target) => Promise<void> {
  const active = document.activeElement
  const held = leaving instanceof Element && leaving !== document.body && active !== null && active !== document.body && leaving.contains(active)
  return async (next) => {
    if (!held) {
      return
    }
    await nextTick()
    const now = document.activeElement
    if (now === null || now === document.body || !now.isConnected || leaving.contains(now)) {
      moveFocus(next())
    }
  }
}

const CONTROL = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** The control `element` is, or the first one inside it. */
export function controlIn(element: Target): Element | null {
  return element instanceof Element ? (element.matches(CONTROL) ? element : element.querySelector(CONTROL)) : null
}

/** The first of `elements` still on the page, as the control it is or holds. */
export function firstConnected(...elements: Target[]): Element | undefined {
  return elements.map((element) => (element?.isConnected === true ? controlIn(element) : null)).find((control): control is Element => control !== null)
}
