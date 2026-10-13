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

// The test every spec imports: Playwright's, with a Content-Security-Policy guard on every page
// (testing.md section 4). A securitypolicyviolation listener in the page, added before any of its
// own scripts, and one in each Worker it starts, where the engine's fetch, XHR and WebSocket run,
// report each violation on the console, which outlives a navigation; a test that saw one fails
// when it ends, whatever it asserted. csp-guard.spec.ts proves that both listeners report.

import { type ConsoleMessage, expect, test as base } from '@playwright/test'

const MARK = '[bitgauge-e2e csp] '

/** Set on a Worker's global scope once its listener is in place. */
export const WORKER_GUARD = '__bitgaugeCspGuard'

export const test = base.extend<{ cspViolations: Set<string> }>({
  cspViolations: [
    async ({ page }, use) => {
      const violations = new Set<string>()
      const collect = (message: ConsoleMessage) => {
        const text = message.text()
        if (text.startsWith(MARK)) {
          violations.add(text.slice(MARK.length))
        }
      }
      page.on('console', collect)
      page.on('worker', (worker) => {
        worker.on('console', collect)
        // A Worker that ends before the listener is in place can no longer violate anything.
        void worker
          .evaluate(
            ([mark, flag]) => {
              self.addEventListener('securitypolicyviolation', (event) => {
                console.error(`${mark}worker: ${event.violatedDirective} blocked ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}`)
              })
              Object.assign(self, { [flag]: true })
            },
            [MARK, WORKER_GUARD] as const,
          )
          .catch(() => undefined)
      })
      await page.addInitScript((mark) => {
        document.addEventListener('securitypolicyviolation', (event) => {
          console.error(`${mark}page: ${event.violatedDirective} blocked ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}`)
        })
      }, MARK)
      await use(violations)
      expect([...violations], 'Content-Security-Policy violations').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
