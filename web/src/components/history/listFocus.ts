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

// History's rows as the focus reaches them (ui/i18n-a11y.md section 2.3): the table's rows on
// wider screens, the cards' links on narrow ones, whichever this width shows.

const ROWS = ['[data-testid="history-row"]', '[data-testid="history-card"] a']

/** The row at `index`, or the last one when the list is shorter; none for a negative index. */
export function historyRow(index: number): Element | undefined {
  if (index < 0) {
    return undefined
  }
  const sets = ROWS.map((selector) => [...document.querySelectorAll(selector)])
  const rows = sets.find((set) => set.some((row) => row.getClientRects().length > 0)) ?? sets[0] ?? []
  return rows[Math.min(index, rows.length - 1)]
}
