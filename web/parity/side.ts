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

// What the shared parity code needs to know of each side, the design kit's prototype and the Vue
// demo: where it starts and how its markup marks the parts of a page the comparison reads.

import type { BrowserContext } from '@playwright/test'

import type { Region } from './compare/content.ts'

export type Side = 'proto' | 'vue'

// The two local servers of playwright.parity.config.ts: the demo build on 5180 and the export's
// directory on 5181.
export const VUE_ORIGIN = 'http://127.0.0.1:5180'
export const PROTO_ORIGIN = 'http://127.0.0.1:5181'

export interface SideDriver {
  side: Side
  startUrl: string
  // Modal content: a dialog, an alert dialog, or the prototype's own wrapper around one.
  overlaySelector: string
  // Transient toasts, which neither the notices nor the dialogs read: they come and go on a timer.
  // Null for a side that has none.
  toastSelector: string | null
  // Each region's root element on this side, for the style layer, first match wins: an element
  // inside an overlay belongs to the overlay, and one inside main to main.
  styleRegions: [Region, string][]
  // Readies a fresh context before its first page loads, such as the product defaults a side keeps
  // in storage.
  prepare: (context: BrowserContext) => Promise<void>
}
