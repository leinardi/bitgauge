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

// Flow 1, first run (ui/flows.md section 1): the Test screen with the server's defaults, Start, the
// live phases, and the complete result, saved to history, whose Download JSON holds one result that
// validates, and whose Result detail draws it and keeps its note. The spec runs a BitGauge of its
// own: on the shared server the parallel runs from one address can exceed its four WebSockets per
// client (wire-protocol.md section 9) and fall back to HTTP, and here the idle latency must come
// over the WebSocket, which the CSP's connect-src has to allow.

import { readFile } from 'node:fs/promises'

import { validateResult } from '@/engine/messages'

import { expectAccessible } from './fixtures/axe'
import { type Server, startServer } from './fixtures/server'
import { expect, test } from './fixtures/test'

let server: Server

test.beforeEach(async () => {
  server = await startServer()
})

test.afterEach(async () => {
  await server.kill()
})

test('runs the server defaults to a complete result and downloads it', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(`${server.url}/`)

  // Step 2: the server, the connection and the preset of the server's defaults.
  await expect(page.getByTestId('connection-ip')).toContainText('127.0.0.1')
  await expect(page.getByTestId('settings-summary')).toContainText('Standard preset')
  const start = page.getByRole('button', { name: 'Start test' })
  await expect(start).toBeEnabled()

  // Steps 3 and 4: the run goes through its phases live, Stop in place of Start.
  await start.click()
  await expect(page.getByRole('button', { name: 'Stop test' })).toBeVisible()
  await expect(page.getByTestId('gauge-label')).toHaveText('Download', { timeout: 30_000 })
  await expect(page.getByTestId('gauge-label')).toHaveText(/Upload/, { timeout: 60_000 })

  // Step 5: the result, saved to history automatically, and its export.
  await expect(page.getByTestId('result-bar')).toContainText('Saved to history', { timeout: 90_000 })
  await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible()
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download JSON' }).click()])
  expect(file.suggestedFilename()).toMatch(/^bitgauge-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
  const exported = JSON.parse(await readFile(await file.path(), 'utf8')) as { format: string; results: { notices: { code: string }[] }[] }
  expect(exported.format).toBe('bitgauge.history')
  expect(exported.results).toHaveLength(1)
  const [result] = exported.results
  expect(validateResult(result)).toEqual([])
  expect(result).toMatchObject({ status: 'complete', idle: { path: 'websocket' }, download: { status: 'measured' }, upload: { status: 'measured' } })
  expect(result?.notices.map((notice) => notice.code)).not.toContain('websocket-unavailable')

  // The done state, with its tiles and result bar, passes axe too.
  await expectAccessible(page)

  // Details opens its Result detail: both directions' charts with their loaded latency, and the parameters.
  await page.getByTestId('result-details').click()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
  await expect(page.getByTestId('phase-chart-download')).toBeVisible()
  await expect(page.getByTestId('phase-chart-upload')).toBeVisible()
  await expect(page.getByTestId('load-row')).toHaveCount(2)
  await expect(page.getByTestId('parameter-ip')).toContainText('127.0.0.1')

  // The saved result is in History, and the Test screen's idle state links to it.
  const nav = page.getByRole('navigation', { name: 'Primary' })
  await nav.getByRole('link', { name: 'History' }).click()
  await expect(page.getByTestId('history-count')).toContainText('1 of 1 shown')
  await nav.getByRole('link', { name: 'Test' }).click()
  await expect(page.getByTestId('last-result')).toContainText('Last test')

  // The note is saved with the result as it is typed, and is there after a reload.
  await page.getByTestId('last-result').click()
  await page.getByTestId('note-field').fill('Desk, 5 GHz')
  await page.waitForTimeout(500)
  await expect(async () => {
    await page.reload()
    await expect(page.getByTestId('note-field')).toHaveValue('Desk, 5 GHz', { timeout: 1000 })
  }).toPass({ timeout: 10_000 })
})
