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

// Reads a settled page into the regions the content layer compares, keeping the raw snapshots so the
// report can show exactly what each side said.

import type { Locator, Page } from '@playwright/test'

import { parseAriaSnapshot, type AriaNode } from './compare/ariaTree.ts'
import type { Region, RegionTrees } from './compare/content.ts'
import { collectStyles, type StyledElement } from './compare/style.ts'
import { normalizeTree } from './normalize.ts'
import type { SideDriver } from './side.ts'

// The header region: the page's top bar and, on a narrow window, the tab bar at the bottom, which is
// a navigation landmark of its own outside the top bar. A header or a navigation inside the main
// content (the About page has one) belongs to main.
const HEADER = 'header, nav'

// A notice: an alert or a status outside every landmark. A main element that is itself an alert
// (the base-path error page) is a landmark, so it is the main region and not a notice.
const NOTICES = '[role=alert], [role=status]'

// Landmarks a notice sits outside of: anything inside them belongs to that region already.
const REGION_ROOTS = 'main, header, nav, aside, [role=dialog], [role=alertdialog]'

export interface Capture {
  trees: RegionTrees
  raw: Record<Region, string>
  styles: StyledElement[]
}

// By element, not by role: a page whose main element carries role=alert is still the main content.
async function snapshot(locator: Locator): Promise<string> {
  return (await locator.count()) === 0 ? '' : locator.first().ariaSnapshot()
}

// Indexes of the rendered elements matching `selector` that neither match `outside` nor sit inside
// it (nor inside another match), in document order. A hidden element (the desktop header on a narrow
// window) is left out: it is not on the page a person sees.
async function topLevelIndexes(page: Page, selector: string, outside: string): Promise<number[]> {
  return page.evaluate(
    ({ selector, outside }) => {
      const all = [...document.querySelectorAll(selector)]
      return all
        .map((el, index) => ({ el, index }))
        .filter(({ el }) => el.closest(outside) === null && el.parentElement?.closest(selector) === null && el.checkVisibility())
        .map(({ index }) => index)
    },
    { selector, outside },
  )
}

async function snapshotAll(page: Page, selector: string, outside: string): Promise<string> {
  const indexes = await topLevelIndexes(page, selector, outside)
  const parts = await Promise.all(indexes.map((i) => page.locator(selector).nth(i).ariaSnapshot()))
  return parts.filter((part) => part.trim() !== '').join('\n')
}

// A region snapshot is one landmark node; the comparison reads its children, so the landmark's own
// role and name never count as a difference.
function contents(yaml: string): AriaNode[] {
  const nodes = parseAriaSnapshot(yaml)
  return nodes.length === 1 && nodes[0] !== undefined ? nodes[0].children : nodes
}

export async function capture(driver: SideDriver, page: Page): Promise<Capture> {
  // A selector that matches nothing, for a side without toasts.
  const toasts = driver.toastSelector ?? ':not(*)'
  const raw: Record<Region, string> = {
    header: await snapshotAll(page, HEADER, `main, ${driver.overlaySelector}`),
    main: await snapshot(page.locator('main')),
    notices: await snapshotAll(page, NOTICES, `${REGION_ROOTS}, ${toasts}`),
    dialogs: await snapshotAll(page, driver.overlaySelector, toasts),
  }
  const trees: RegionTrees = {
    header: normalizeTree(parseAriaSnapshot(raw.header), driver.pageHost),
    main: normalizeTree(contents(raw.main), driver.pageHost),
    notices: normalizeTree(parseAriaSnapshot(raw.notices), driver.pageHost),
    dialogs: normalizeTree(parseAriaSnapshot(raw.dialogs), driver.pageHost),
  }
  return { trees, raw, styles: await collectStyles(page, driver.styleRegions) }
}
