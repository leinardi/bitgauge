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

/** A control below its target size: what it is, by role or tag and name, and its effective box. */
export interface SmallTarget {
  control: string
  width: number
  height: number
}

/**
 * The visible controls of the page whose effective target is below `min` px either way
 * (ui/i18n-a11y.md section 2.9). The target is the control's own box, or for a checkbox or radio
 * with a label the label's, which a click toggles it from (expectLabelToggles checks one); a link
 * inside a sentence is exempt, as WCAG 2.2 SC 2.5.8 allows, and so is a visually hidden control
 * such as the skip link before it has focus.
 */
export async function smallTargets(page: Page, min = 24): Promise<SmallTarget[]> {
  return page.evaluate((least) => {
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"]'
    const name = (element: Element) => `${element.getAttribute('role') ?? element.tagName.toLowerCase()} "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)}"`
    const inSentence = (element: Element) => {
      const parent = element.parentElement
      return element.tagName === 'A' && getComputedStyle(element).display === 'inline' && parent !== null && (parent.textContent ?? '').trim().length > (element.textContent ?? '').trim().length
    }
    const hidden = (element: Element) => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return box.width <= 1 || box.height <= 1 || style.visibility === 'hidden' || element.closest('[aria-hidden="true"], [inert]') !== null
    }
    return [...document.querySelectorAll(selector)].flatMap((element) => {
      if (hidden(element) || inSentence(element)) {
        return []
      }
      const own = element.getBoundingClientRect()
      const toggle = (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) || element.getAttribute('role') === 'checkbox' || element.getAttribute('role') === 'radio'
      const labels = element instanceof HTMLInputElement || element instanceof HTMLButtonElement ? element.labels : null
      const label = toggle ? (labels?.[0] ?? null) : null
      const box = label === null ? own : label.getBoundingClientRect()
      return box.width < least || box.height < least ? [{ control: name(element), width: Math.round(box.width), height: Math.round(box.height) }] : []
    })
  }, min)
}

/** A click on the checkbox's label, away from the box, toggles it, so the label counts as its target. */
export async function expectLabelToggles(checkbox: Locator): Promise<void> {
  const before = await checkbox.getAttribute('aria-checked')
  const label = checkbox.page().locator(`label[for="${await checkbox.getAttribute('id')}"]`).or(checkbox.locator('xpath=ancestor::label[1]'))
  await label.first().scrollIntoViewIfNeeded()
  const own = await checkbox.boundingBox()
  expect(own).not.toBeNull()
  if (own === null) {
    return
  }
  // The label's text, clear of the box itself.
  const text = await label.first().evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0)
    const last = rects.at(-1)
    return last === undefined ? null : { x: last.x + last.width / 2, y: last.y + last.height / 2 }
  })
  expect(text !== null && (text.x > own.x + own.width || text.y > own.y + own.height)).toBe(true)
  if (text === null) {
    return
  }
  await checkbox.page().mouse.click(text.x, text.y)
  await expect(checkbox).not.toHaveAttribute('aria-checked', before ?? '')
}
