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

// Focus that loses its control moves to the one that takes its place, never to the page body
// (ui/i18n-a11y.md section 2.3).

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
