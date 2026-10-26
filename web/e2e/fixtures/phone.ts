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

// The phone the narrow-layout specs run at, the design kit's mobile frame, and the checks they
// share: no sideways scroll (ui/screens.md section 1) and a control that a tap really reaches.

import type { Locator, Page } from '@playwright/test'

import { expect } from './test'

export const PHONE = { width: 390, height: 844 }

/** The page does not scroll sideways. */
export async function expectNoSideScroll(page: Page): Promise<void> {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(scroll, 'the page scrolls sideways').toBeLessThanOrEqual(client)
}

/** The element can never grow past the viewport's bottom: its top plus its maximum height fit. */
export async function expectFitsViewport(element: Locator): Promise<void> {
  const bottom = await element.evaluate((node) => node.getBoundingClientRect().top + Number.parseFloat(getComputedStyle(node).maxHeight))
  expect(bottom, 'the element can grow past the viewport').toBeLessThanOrEqual(PHONE.height)
}

/** A tap at the control's center lands on it, not on something drawn over it, and it lies within the viewport. */
export async function expectTappable(control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded()
  const box = await control.boundingBox()
  expect(box, 'the control has a box').not.toBeNull()
  if (box === null) {
    return
  }
  const viewport = control.page().viewportSize()
  expect(box.y + box.height, 'the control ends within the viewport').toBeLessThanOrEqual(viewport?.height ?? Infinity)
  // A modal dialog turns pointer events off on the body, which elementFromPoint skips; turned back
  // on for the test, the topmost element drawn at the point is the one that answers.
  const hit = await control.evaluate((element, [x, y]) => {
    const before = document.body.style.pointerEvents
    document.body.style.pointerEvents = 'auto'
    const top = document.elementFromPoint(x, y)
    document.body.style.pointerEvents = before
    return top !== null && (element === top || element.contains(top))
  }, [box.x + box.width / 2, box.y + box.height / 2] as const)
  expect(hit, 'a tap at the control center lands on it').toBe(true)
}
