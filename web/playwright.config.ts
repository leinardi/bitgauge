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

// End-to-end tests (testing.md section 4) on Chromium, Firefox and WebKit, against a running
// BitGauge. make e2e builds the binary on the host, starts it and points BITGAUGE_E2E_URL at it.

import { availableParallelism } from 'node:os'

import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.BITGAUGE_E2E_URL ?? 'http://127.0.0.1:8080'

// Playwright's default, half the logical CPUs, but at most ten: the server make e2e starts has room
// for ten runs of six streams from one address (.mk/e2e.mk).
const workers = Math.min(10, Math.max(1, Math.floor(availableParallelism() / 2)))

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results/e2e',
  // A test that only passes on a second try is a bug to fix, not a result.
  retries: 0,
  forbidOnly: true,
  fullyParallel: true,
  workers,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]],
  // A trace of every failed test (DOM snapshots, network, console), kept with the report CI
  // uploads, so an intermittent failure can be diagnosed from the run that hit it.
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
