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

// The OpenSpeedTest UI check of the harness's compatibility step (testing.md section 5): the pinned
// OpenSpeedTest UI container is opened with its documented ?Host= parameter pointing at BitGauge
// through the proxy, and runs one test (compatibility.md section 1). The driver records the
// download and upload values the UI shows, in Mbit/s as it shows them, with the status line it
// ended on, into openspeedtest.json in HARNESS_EXPORT_DIR; the Go runner judges them. Only the UI's
// own origin and BitGauge's are reachable: every other request the page makes is aborted, so its
// results link is never followed.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'

const uiURL = process.env.HARNESS_OPENSPEEDTEST_URL ?? 'http://openspeedtest:3000'
const exportDir = process.env.HARNESS_EXPORT_DIR ?? 'test-results/harness-export'

// The status lines the UI ends a test on: done, or its network error.
const DONE = 'All done'
const NETWORK_ERROR = 'Check your network connection status.'

test('run the OpenSpeedTest UI against BitGauge', async ({ page, baseURL }, testInfo) => {
  if (baseURL === undefined) throw new Error('BITGAUGE_HARNESS_URL is not set')
  const allowed = new Set([new URL(uiURL).origin, new URL(baseURL).origin])
  await page.route('**/*', (route) => (allowed.has(new URL(route.request().url()).origin) ? route.continue() : route.abort('blockedbyclient')))

  // Run starts the test as the page loads; the UI lower-cases the whole query.
  const params = new URLSearchParams({ Host: baseURL, Run: '1' })
  await page.goto(`${uiURL}/?${params.toString()}`)

  const status = page.locator('#oDoLiveStatus')
  await expect(status).toHaveText(new RegExp(`^(${DONE}|${NETWORK_ERROR.replaceAll('.', '\\.')})$`), { timeout: testInfo.timeout })

  const outcome = {
    status: (await status.textContent()) ?? '',
    downloadMbps: (await page.locator('#downResult').textContent()) ?? '',
    uploadMbps: (await page.locator('#upRestxt').textContent()) ?? '',
  }
  await mkdir(exportDir, { recursive: true })
  await writeFile(path.join(exportDir, 'openspeedtest.json'), `${JSON.stringify(outcome, null, 2)}\n`)
})
