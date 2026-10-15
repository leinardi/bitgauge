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

// The demo parity harness (web/parity/): the design kit's prototype and the Vue demo, driven through
// the same scenarios and compared. Never part of CI.

import { defineConfig } from '@playwright/test'

import { SCENARIOS } from './parity/scenarios.ts'
import { assertNoPlaywrightFilters, selectionFromEnv, type ParityProject } from './parity/selection.ts'
import { PROTO_ORIGIN, PROTO_PORT, VUE_ORIGIN, VUE_PORT } from './parity/side.ts'

assertNoPlaywrightFilters(process.argv)
const selection = selectionFromEnv(process.env, SCENARIOS)

export default defineConfig<{ project: ParityProject }>({
  testDir: './parity',
  testMatch: '**/*.parity.ts',
  outputDir: './test-results/parity',
  globalSetup: './parity/globalSetup.ts',
  // A scenario that only passes on a second try is a harness bug to fix, not a result.
  retries: 0,
  forbidOnly: true,
  fullyParallel: true,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }], ['./parity/reporter.ts']],
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: selection.projects.map((project) => ({ name: project.name, use: { project } })),
  webServer: [
    {
      // A production build of the demo, not the dev server: Vite's dev server can reload the page
      // when it discovers a dependency, which would change a page between two reads.
      command: 'npm run parity:serve:demo',
      env: { PARITY_DEMO_PORT: String(VUE_PORT) },
      url: `${VUE_ORIGIN}/`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // Rooted at docs/design_system because the kit reaches ../../colors_and_type.css.
      command: 'npm run parity:serve:prototype',
      env: { PARITY_PROTO_PORT: String(PROTO_PORT) },
      url: `${PROTO_ORIGIN}/ui_kits/app/index.html`,
      reuseExistingServer: false,
    },
  ],
})
