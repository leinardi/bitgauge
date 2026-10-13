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

// The accuracy harness's browser driver (testing.md section 5.1). It uses only what a user has:
// the documented URL parameters start a run of the requested preset (ui/url-params.md), and the
// Test screen's Download JSON action saves the finished result (ui/screens.md section 1). The Go
// runner reads the file from HARNESS_EXPORT_DIR; nothing here judges the numbers.

import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'

const preset = process.env.HARNESS_PRESET ?? 'standard'
const exportDir = process.env.HARNESS_EXPORT_DIR ?? 'test-results/harness-export'

test('run the preset and download its result', async ({ page }, testInfo) => {
  const params = new URLSearchParams({ run: '1', test: 'all', preset, label: `harness-${testInfo.project.name}` })
  await page.goto(`/?${params.toString()}`)

  // Download JSON appears once the run has a result: complete, partial or error (ui/screens.md
  // section 1). The report carries the result's status, so a partial or error run is never read as
  // a complete one; a run that ends with no result at all fails on the timeout.
  const download = page.getByRole('button', { name: 'Download JSON' })
  await expect(download).toBeVisible({ timeout: testInfo.timeout })

  const [file] = await Promise.all([page.waitForEvent('download'), download.click()])

  await mkdir(exportDir, { recursive: true })
  await file.saveAs(path.join(exportDir, `${testInfo.project.name}.json`))
})
