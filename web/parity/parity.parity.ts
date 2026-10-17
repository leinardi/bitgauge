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

// One test per selected scenario: drive both sides through the same steps, read both pages, compare
// them and judge the differences against .parity-baseline. Every test leaves a record of what it
// compared, which is what the reporter's coverage check and the baseline merge read.

import { test as base, type Browser, type Page } from '@playwright/test'

import { judgePair, loadBaseline, type BaselineEntry } from './baseline.ts'
import { capture } from './capture.ts'
import { compareContent, isContentRegion } from './compare/content.ts'
import { compareLayout } from './compare/layout.ts'
import { compareStyles } from './compare/style.ts'
import { attachVisual } from './compare/visual.ts'
import * as drivers from './drivers.ts'
import { numberDuplicates, type Finding } from './findings.ts'
import { writeRecord, type RecordStatus } from './records.ts'
import { SCENARIOS, type Scenario, type Step } from './scenarios.ts'
import { ALL_PROJECTS, DEFAULT_PROJECT, selectionFromEnv, type ParityProject } from './selection.ts'
import { openSide, waitForSettled } from './settle.ts'
import type { Side } from './side.ts'

const test = base.extend<{ project: ParityProject }>({
  // Overridden per project by playwright.parity.config.ts.
  project: [ALL_PROJECTS.find((p) => p.name === DEFAULT_PROJECT) as ParityProject, { option: true }],
})

const selection = selectionFromEnv(process.env, SCENARIOS)

// A step that cannot reach its target is the harness's failure, not a difference between the sides:
// it must never be compared, recorded as a finding, or accepted into the baseline.
class HarnessError extends Error {
  constructor(side: Side, scenario: string, step: number, cause: unknown) {
    const what = cause instanceof Error ? cause.message.split('\n')[0] : String(cause)
    super(`harness: ${side} ${scenario} step ${step}: ${what ?? 'unknown error'}`)
    this.name = 'HarnessError'
  }
}

async function runStep(driver: drivers.Driver, page: Page, step: Step): Promise<void> {
  if ('forceState' in step) await driver.forceState(page, step.forceState)
  else if ('serverUnreachable' in step) await driver.serverUnreachable(page)
  else if ('openDemo' in step) await driver.openDemo(page)
  else if ('historyVariant' in step) await driver.historyVariant(page, step.historyVariant)
  else await drivers.goto(page, step.goto)
}

async function drive(browser: Browser, driver: drivers.Driver, project: ParityProject, scenario: Scenario) {
  let opened: Awaited<ReturnType<typeof openSide>>
  try {
    opened = await openSide(browser, driver, project)
  } catch (error) {
    throw new HarnessError(driver.side, scenario.id, 0, error)
  }
  for (const [index, step] of scenario.steps.entries()) {
    try {
      await runStep(driver, opened.page, step)
      await waitForSettled(opened.page)
    } catch (error) {
      await opened.context.close()
      throw new HarnessError(driver.side, scenario.id, index + 1, error)
    }
  }
  return opened
}

async function readSide(driver: drivers.Driver, page: Page, scenario: Scenario) {
  try {
    return await capture(driver, page)
  } catch (error) {
    throw new HarnessError(driver.side, scenario.id, scenario.steps.length + 1, error)
  }
}

function describeFinding(f: Finding): string {
  return `  ${f.layer} ${f.kind}  ${f.path}\n      ${f.detail}`
}

function verdictMessage(unexpected: readonly Finding[], stale: readonly BaselineEntry[]): string {
  const parts: string[] = []
  if (unexpected.length > 0) {
    parts.push(`${unexpected.length} difference(s) not in .parity-baseline:\n${unexpected.map(describeFinding).join('\n')}`)
  }
  if (stale.length > 0) {
    parts.push(
      `${stale.length} baseline entr${stale.length === 1 ? 'y' : 'ies'} no longer found (fixed? run make demo-parity-update):\n` +
        stale.map(describeFinding).join('\n'),
    )
  }
  return parts.join('\n\n')
}

for (const scenario of selection.scenarios) {
  test(scenario.id, async ({ browser, project }, testInfo) => {
    const pair = { project: project.name, scenario: scenario.id }
    const runId = process.env['PARITY_RUN_ID'] ?? ''
    let status: RecordStatus = 'harness-error'
    let findings: Finding[] = []
    let error: string | null = null
    const opened: Awaited<ReturnType<typeof drive>>[] = []
    try {
      const sides = await Promise.allSettled([
        drive(browser, drivers.proto, project, scenario),
        drive(browser, drivers.vue, project, scenario),
      ])
      for (const side of sides) if (side.status === 'fulfilled') opened.push(side.value)
      const [protoSide, vueSide] = sides
      if (protoSide.status === 'rejected') throw protoSide.reason
      if (vueSide.status === 'rejected') throw vueSide.reason
      // Read before the screenshots: a full-page screenshot resizes the viewport for a moment, and a
      // resize can rebuild part of a page (the prototype's header loses its announcement).
      const protoCapture = await readSide(drivers.proto, protoSide.value.page, scenario)
      const vueCapture = await readSide(drivers.vue, vueSide.value.page, scenario)
      await attachVisual(protoSide.value.page, vueSide.value.page, testInfo)
      for (const [side, cap] of [['proto', protoCapture], ['vue', vueCapture]] as const) {
        for (const [region, yaml] of Object.entries(cap.raw)) {
          await testInfo.attach(`${side}-${region}.yaml`, { body: yaml, contentType: 'text/yaml' })
        }
      }
      const contentFindings = compareContent(protoCapture.trees, vueCapture.trees, scenario.regions.filter(isContentRegion))
      const styleFindings =
        scenario.style === false ? [] : compareStyles(protoCapture.styles, vueCapture.styles, scenario.regions)
      const layoutFindings =
        scenario.layout === false ? [] : compareLayout(protoCapture.layout, vueCapture.layout, scenario.regions)
      findings = numberDuplicates([...contentFindings, ...styleFindings, ...layoutFindings])
      status = 'compared'
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
      throw cause
    } finally {
      writeRecord({ ...pair, runId, status, findings, error })
      await Promise.all(opened.map((side) => side.context.close()))
    }

    await testInfo.attach('findings.json', { body: JSON.stringify(findings, null, 2), contentType: 'application/json' })
    if (selection.mode !== 'check') return
    const { unexpected, stale } = judgePair(pair, findings, loadBaseline())
    if (unexpected.length > 0 || stale.length > 0) throw new Error(verdictMessage(unexpected, stale))
  })
}
