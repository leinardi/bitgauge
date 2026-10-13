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

// The negative control of the CSP guard (fixtures/test.ts): a request the policy blocks, made once
// from the page and once from the engine's Worker, is reported by both listeners. The target is
// another port of the loopback interface, which connect-src 'self' blocks before anything is sent.

import { expect, test, WORKER_GUARD } from './fixtures/test'

const BLOCKED = 'http://127.0.0.1:9/'

test('reports a violation in the page and in the engine Worker', async ({ page, cspViolations }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Start test' })).toBeEnabled()
  const [worker] = page.workers()
  if (worker === undefined) {
    throw new Error('the Test screen started no Worker')
  }
  await expect.poll(() => worker.evaluate((flag) => flag in self, WORKER_GUARD)).toBe(true)

  await page.evaluate((url) => fetch(url).catch(() => undefined), BLOCKED)
  await worker.evaluate((url) => fetch(url).catch(() => undefined), BLOCKED)

  const reported = (scope: string) => [...cspViolations].some((violation) => violation.startsWith(`${scope}: connect-src blocked ${BLOCKED}`))
  await expect.poll(() => reported('page')).toBe(true)
  await expect.poll(() => reported('worker')).toBe(true)
  // The control's own violations are the expected ones; the guard checks for any other.
  cspViolations.clear()
})
