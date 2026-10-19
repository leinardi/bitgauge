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

// The accuracy harness's browser driver (testing.md section 5.1). The Go runners in test/harness
// start this inside the client container, one browser and one profile at a time, and read the
// result JSON it downloads from HARNESS_EXPORT_DIR. Runs are serial: a second browser on the same
// shaped link would measure the other one. Each invocation selects one spec with a file filter:
// run.spec.ts measures BitGauge on every profile, and openspeedtest.spec.ts drives the
// OpenSpeedTest UI on the profiles that run the compatibility clients, in Chromium only.

import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.BITGAUGE_HARNESS_URL ?? 'http://bitgauge:8080'

export default defineConfig({
  testDir: './harness',
  testMatch: ['run.spec.ts', 'openspeedtest.spec.ts'],
  outputDir: process.env.HARNESS_OUTPUT_DIR ?? './test-results/harness',
  retries: 0,
  forbidOnly: true,
  workers: 1,
  fullyParallel: false,
  // The Extended preset on the 600 ms floor profile runs for minutes.
  timeout: 15 * 60 * 1000,
  reporter: [['list']],
  // The Caddy profile serves TLS from Caddy's internal CA, which no browser trusts; the runner
  // sets HARNESS_IGNORE_HTTPS_ERRORS=1 for that profile only.
  use: { baseURL, acceptDownloads: true, ignoreHTTPSErrors: process.env.HARNESS_IGNORE_HTTPS_ERRORS === '1' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
