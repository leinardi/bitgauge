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
// Flow 7, Continuous mode, short (ui/flows.md section 7, testing.md section 4.1): a Continuous
// download with the shortest run length, 60 s, runs to a complete result saved in History; another,
// with idle latency left out in the stored settings since a link cannot leave it out, is stopped
// right after warm-up, before 3 fully known 1 s cells, and is partial with insufficient data and
// Keep in history offered. axe scans the live view and both endings. The spec runs a BitGauge of
// its own, so a 60 s run neither shares the shared server's per-client limits nor competes with
// the other specs. The stopped run goes through a 100 Mbit/s link: over loopback, WebKit on a
// two-CPU runner spends its main thread on a multi-Gbit download, so the page shows the 3 s before
// the first rate only between updates seconds apart, and the Stop click lands after it.

import { readFile } from 'node:fs/promises'

import { validateResult } from '@/engine/messages'

import { expectAccessible } from './fixtures/axe'
import { type Server, startServer } from './fixtures/server'
import { expect, test } from './fixtures/test'
import { type Throttle, throttle } from './fixtures/throttle'

let server: Server
let link: Throttle | null = null

test.beforeEach(async () => {
  server = await startServer()
})

test.afterEach(async () => {
  await link?.close()
  link = null
  await server.kill()
})

test('runs a Continuous download for its 60 s run length to a complete result, saved in History', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(`${server.url}/?preset=continuous&test=download&duration=60`)
  await page.getByRole('button', { name: 'Start test' }).click()

  // The live view, in place of the tiles, once the download runs: the elapsed time against the run length.
  const live = page.getByTestId('continuous-view')
  await expect(live).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('phase-indicator')).toContainText('Download · continuous')
  await expect(page.getByTestId('phase-indicator')).toContainText(/\d+:\d{2} of 1:00/)
  await expect(live.getByTestId('metric-tile').filter({ hasText: 'Average' }).getByTestId('tile-number')).toHaveText(/\d/, { timeout: 30_000 })
  await expectAccessible(page)

  await expect(page.getByTestId('result-bar')).toContainText('Saved to history', { timeout: 90_000 })
  await expect(live.getByTestId('metric-tile').filter({ hasText: 'Minimum' }).getByTestId('tile-number')).toHaveText(/\d/)
  await expectAccessible(page)
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download JSON' }).click()])
  const [result] = (JSON.parse(await readFile(await file.path(), 'utf8')) as { results: unknown[] }).results
  expect(validateResult(result)).toEqual([])
  expect(result).toMatchObject({ status: 'complete', settings: { preset: 'continuous', continuousDirection: 'download', runLengthMs: 60_000 }, download: { status: 'measured' }, upload: { status: 'skipped' } })

  const nav = page.getByRole('navigation', { name: 'Primary' })
  await nav.getByRole('link', { name: 'History' }).click()
  await expect(page.getByTestId('history-count')).toContainText('1 of 1 matching')
  await expect(page.getByTestId('history-row')).toHaveCount(1)
})

test('stops a Continuous download right after warm-up: partial, insufficient data, Keep in history', async ({ page }) => {
  test.setTimeout(180_000)
  // Idle latency left out, as the user's stored phases say.
  await page.addInitScript(() => {
    localStorage.setItem('bitgauge.settings.v1', JSON.stringify({ phases: ['download', 'upload'] }))
  })
  link = await throttle(server.url, 100_000_000)
  await page.goto(`${link.url}/?preset=continuous&test=download`)
  await expect(page.getByTestId('phase-indicator').getByRole('listitem')).toHaveCount(1)
  await page.getByRole('button', { name: 'Start test' }).click()

  // Warm-up has ended once the rates wait for 3 fully known 1 s cells, which take 3 s more.
  const average = page.getByTestId('continuous-view').getByTestId('metric-tile').filter({ hasText: 'Average' })
  await expect(average).toContainText('after 3 s of fully known data', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Stop test' }).click()

  await expect(page.getByTestId('result-bar')).toContainText('Partial results are not saved', { timeout: 30_000 })
  await expect(page.getByTestId('keep-in-history')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download JSON' })).toBeVisible()
  await expectAccessible(page)
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download JSON' }).click()])
  const [result] = (JSON.parse(await readFile(await file.path(), 'utf8')) as { results: { settings: { phases: string[] } }[] }).results
  expect(validateResult(result)).toEqual([])
  expect(result).toMatchObject({ status: 'partial', settings: { preset: 'continuous' }, download: { status: 'insufficient-data' }, upload: { status: 'skipped' } })
  expect(result).not.toHaveProperty('idle')
})
