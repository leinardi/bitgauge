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

// Safari and every iOS browser, all WebKit (edge-cases.md section 17), may delete a site's storage
// after seven days of browsing without a visit, so the History screen recommends export there. The
// page recognizes them by Apple's navigator.vendor; the engine never asks.

export function isSafari(nav: Pick<Navigator, 'vendor'> = navigator): boolean {
  return nav.vendor === 'Apple Computer, Inc.'
}
