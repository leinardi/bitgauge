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

// The axe check of every screen (testing.md section 4) against the target of ui/i18n-a11y.md
// section 2, WCAG 2.2 AA: once the page's transitions have settled, every violation axe finds fails
// the test, listed with the node it found it on and why.

import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

import { expect } from './test'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

export async function expectAccessible(page: Page): Promise<void> {
  // A transition still running, such as a button changing variant or a tile's number fading in,
  // would be measured halfway. Two frames let one that Vue has just scheduled start; an endless
  // animation, a pulse or a spinner, never settles and is not waited for.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running' || animation.effect?.getComputedTiming().iterations === Infinity),
  )
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const found = violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id} at ${node.target.join(' ')}: ${node.failureSummary ?? violation.help}`),
  )
  expect(found, 'axe violations').toEqual([])
}
