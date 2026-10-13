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

// Flow 5, error mid-test (ui/flows.md section 5): the server stops answering during download. The
// spec runs a BitGauge of its own, so that killing it leaves the other specs' server alone; the
// Test screen shows what failed and in which phase, and Retry, which runs again once the server
// answers. Which of two causes ends the run is a race: the WebSocket closes, GET /info fails and
// the engine concludes the network changed (edge-cases.md section 6, step 3), unless three
// download requests fail in a row first (measurement.md section 5).

import { type Server, startServer } from './fixtures/server'
import { expectAccessible } from './fixtures/axe'
import { expect, test } from './fixtures/test'

let server: Server

test.beforeEach(async () => {
  server = await startServer()
})

test.afterEach(async () => {
  await server.kill()
})

test('a server killed mid-download gives the error state, and Retry runs again', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(`${server.url}/`)
  await page.getByRole('button', { name: 'Start test' }).click()
  await expect(page.getByTestId('gauge-label')).toHaveText('Download', { timeout: 30_000 })
  await server.kill()

  const failure = page.getByTestId('run-failure')
  await expect(failure).toContainText('Test failed during download', { timeout: 60_000 })
  await expect(failure).toContainText(/The network changed during the test\.|Three requests in a row failed\./)
  await expect(failure).toContainText('The phases that finished before the error are kept.')
  const retry = page.getByRole('button', { name: 'Retry test' })
  await expect(retry).toBeVisible()
  await expectAccessible(page)

  // Once the server answers again, Retry starts a new run with the same settings.
  await server.restart()
  await retry.click()
  await expect(page.getByRole('button', { name: 'Stop test' })).toBeVisible()
  await expect(failure).toBeHidden()
  await page.keyboard.press('Escape')
})
