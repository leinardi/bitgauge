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

import { readFile } from 'node:fs/promises'

import type { Result } from '@/engine/messages'

import { DEMO_RESULTS, historyExport, importHistory } from './fixtures/history'
import { startServer } from './fixtures/server'
import { expect, test } from './fixtures/test'

test('an early real HTTP/1.1 refusal offers no larger preset (QA-122)', async ({ page }) => {
  const server = await startServer({
    BITGAUGE_LIMITS__REQUESTS_PER_MINUTE: '60',
    BITGAUGE_LIMITS__MAX_STREAMS_PER_CLIENT: '64',
    BITGAUGE_LIMITS__MAX_UPLOAD_BYTES: '64KiB',
    BITGAUGE_TEST_DEFAULTS__PRESET: 'quick',
    BITGAUGE_TEST_DEFAULTS__PHASES: 'upload',
    BITGAUGE_TEST_DEFAULTS__STREAMS__MODE: 'fixed',
    BITGAUGE_TEST_DEFAULTS__STREAMS__FIXED: '1',
  })
  try {
    await page.goto(server.url)
    await expect(page.getByRole('button', { name: 'Start test' })).toBeEnabled()
    // Spend the real limiter's burst on tiny downloads from the same client IP. Even if a token
    // refills, the next upload fails well before a three-second confirmed window.
    await Promise.all(Array.from({ length: 60 }, () => page.request.get(`${server.url}/api/v1/download?bytes=1`)))
    await page.getByRole('button', { name: 'Start test' }).click()
    await expect(page.getByRole('button', { name: 'Download JSON' })).toBeVisible({ timeout: 20_000 })
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download JSON' }).click()])
    const exported = JSON.parse(await readFile(await file.path(), 'utf8')) as { results: Result[] }
    expect(exported.results[0]?.upload?.status).toBe('insufficient-data')
    expect(exported.results[0]?.notices).toContainEqual({ code: 'insufficient-data', direction: 'upload', offer: null })
    await expect(page.getByText('Upload reached its', { exact: false })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Try (Standard|Extended)/ })).toHaveCount(0)
    await expect(page.getByText('Upload was interrupted by a failed request', { exact: false })).toHaveCount(2)
    const uploadTile = page.getByTestId('metric-tile').filter({ hasText: 'Upload' }).first()
    await expect(uploadTile).toContainText('Upload was interrupted by a failed request')
    await expect(page.getByText(/no steady window within the .* max/)).toHaveCount(0)
    await page.getByTestId('result-details').click()
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
    await expect(page.getByTestId('metric-tile').filter({ hasText: 'Upload' }).first()).toContainText('Upload was interrupted by a failed request')
    await expect(page.getByText(/no steady window within the .* max/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Try (Standard|Extended)/ })).toHaveCount(0)
  } finally {
    await server.kill()
  }
})

test('the Settings link carries active overrides without persisting them (QA-136)', async ({ page }) => {
  await page.goto('/settings?preset=extended&streams=2&cap=200MB&units=bytes&label=FromURL')
  const link = page.getByTestId('share-url')
  await expect(link).toHaveValue(/label=FromURL/)
  const url = new URL(await link.inputValue())
  expect(Object.fromEntries(url.searchParams)).toMatchObject({ preset: 'extended', streams: '2', cap: '200MB', units: 'bytes', label: 'FromURL' })
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bitgauge.settings.v1') ?? '{}'))).not.toMatchObject({ label: 'FromURL' })
})

test('hostile import records reject individually without blanking valid details (QA-120)', async ({ page }) => {
  const valid = DEMO_RESULTS[0]!
  await page.goto('/history')
  const bad = { ...valid, notices: [{ code: 'constructor' }] }
  const extent = structuredClone(valid)
  extent.download!.series!.endMs = Number.MAX_SAFE_INTEGER
  const confidence = structuredClone(valid)
  confidence.download!.confidence = { level: 'normal', reasons: ['unstable'] }
  const skipped = structuredClone(valid)
  skipped.upload = { status: 'skipped', streams: 0, bytes: 0, events: [], confirmedRequests: 12, responsiveness: { state: 'measured', protocol: 'h2', samples: 20, rpm: 1200, tm95Ms: 50, trimmed: 1, totalMedianMs: 50 } }
  await page.getByTestId('import-input').setInputFiles({ name: 'hostile.json', mimeType: 'application/json', buffer: Buffer.from(historyExport([bad, extent, confidence, skipped, valid])) })
  await expect(page.getByTestId('history-count')).toContainText('1 of 1 matching')
  await page.goto(`/result/${valid.id}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(valid.label)
})

test('a valid far-future date cannot project a trend label outside the phone (QA-123)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await importHistory(page, [{ ...DEMO_RESULTS[0]!, startedAt: '9999-12-31T23:59:59.999Z' }])
  await expect(page.getByTestId('history-card')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
