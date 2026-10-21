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

// Puts both sides in the same state before anything is read: the same frozen instant, the same
// media, and a page that has finished rendering.

import type { Browser, BrowserContext, Page } from '@playwright/test'

import { routeThroughCdnCache } from './cdnCache.ts'
import { VIEWPORTS, type ParityProject } from './selection.ts'
import type { SideDriver } from './side.ts'

// The wall clock both pages read: a fixed instant shortly after the demo server's start
// (src/demo/fixtures.ts), so a date or a time of day on the page reads the same on every run.
const FIXED_NOW = '2026-09-30T08:20:00.000Z'

// A page is settled once its DOM has not changed for this long. Long enough to outlast a framework's
// follow-up render, short enough that a one-second countdown cannot keep it unsettled.
const QUIET_MS = 300

// Both sides name the browser on the Test and Session cards. The kit is seeded with Chrome
// (drivers.ts), and headless Chromium's own agent says HeadlessChrome, which the demo's parser does
// not recognize, so both pages read this desktop Chrome instead.
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
// Long enough for the demo's longest run at real speed, a complete Standard test on the LAN (about
// 28 s), to finish and go quiet.
const SETTLE_TIMEOUT_MS = 60_000

export async function openSide(browser: Browser, driver: SideDriver, project: ParityProject): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: VIEWPORTS[project.viewport],
    colorScheme: project.theme,
    reducedMotion: 'reduce',
    timezoneId: 'UTC',
    locale: 'en-US',
    userAgent: USER_AGENT,
  })
  await routeThroughCdnCache(context)
  // Fixed, not installed: Date reads the fixed instant, while timers still run, so the prototype's
  // timers and the demo's run go on by themselves. Theme is left on System, and both sides follow
  // the emulated color scheme.
  await context.clock.setFixedTime(new Date(FIXED_NOW))
  await driver.prepare(context)
  const page = await context.newPage()
  await page.goto(driver.startUrl)
  await waitForSettled(page)
  return { context, page }
}

/** Waits until the page shows its main content and has not changed for `quietMs`. */
export async function waitForSettled(page: Page, quietMs = QUIET_MS): Promise<void> {
  // By element, not by role: a modal hides <main> from the accessibility tree while it is open.
  await page.locator('main').first().waitFor({ state: 'visible', timeout: SETTLE_TIMEOUT_MS })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.evaluate(
    ({ quietMs, timeoutMs }) =>
      new Promise<void>((resolve, reject) => {
        let quiet: ReturnType<typeof setTimeout> | undefined
        const observer = new MutationObserver(() => {
          clearTimeout(quiet)
          quiet = setTimeout(done, quietMs)
        })
        const deadline = setTimeout(() => {
          observer.disconnect()
          clearTimeout(quiet)
          reject(new Error(`the page kept changing for ${timeoutMs} ms`))
        }, timeoutMs)
        function done(): void {
          observer.disconnect()
          clearTimeout(deadline)
          resolve()
        }
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
        quiet = setTimeout(done, quietMs)
      }),
    { quietMs, timeoutMs: SETTLE_TIMEOUT_MS },
  )
}
