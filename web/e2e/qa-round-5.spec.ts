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

import { startServer } from './fixtures/server'
import { expect, test } from './fixtures/test'

for (const direction of ['download', 'upload'] as const) {
  test(`a cap-ended Continuous ${direction} is not an idle cancellation (QA-137)`, async ({ page }) => {
    const server = await startServer()
    try {
      await page.goto(`${server.url}/?preset=continuous&test=${direction}&cap=50MB`)
      await page.getByRole('button', { name: 'Start test' }).click()
      await expect(page.getByTestId('keep-in-history')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByTestId('result-bar')).toContainText('Partial results are not saved')
      await expect(page.getByTestId('result-summary')).toContainText('Data cap reached')
      await expect(page.getByText('Data cap reached', { exact: true })).toBeVisible()
      await expect(page.getByText('Test cancelled during latency', { exact: true })).toHaveCount(0)
      await expect(page.getByTestId('result-summary')).not.toContainText('cancelled during latency')
      const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download JSON' }).click()])
      const result = (JSON.parse(await readFile(await file.path(), 'utf8')) as { results: Result[] }).results[0]!
      expect(result.status).toBe('partial')
      expect(result[direction]?.status).toBe('insufficient-data')
      expect(result[direction]?.events).toContainEqual(expect.objectContaining({ code: 'data-cap' }))
      expect(result.notices).toContainEqual({ code: 'data-cap-reached', direction })
      expect(result.notices.some((notice) => notice.code === 'stopped-early')).toBe(false)
      await page.getByTestId('result-details').click()
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
      await expect(page.getByTestId('keep-in-history')).toBeVisible()
      await expect(page.getByText('Data cap reached', { exact: true })).toBeVisible()
      await page.goBack()
      await expect(page.getByTestId('result-bar')).toBeVisible()
      await expect(page.getByTestId('keep-in-history')).toBeVisible()
      await expect(page.getByText('Test cancelled during latency', { exact: true })).toHaveCount(0)
    } finally {
      await server.kill()
    }
  })
}

for (const view of [{ width: 390, height: 844, theme: 'light' }, { width: 1440, height: 900, theme: 'dark' }]) {
  test(`effective linked settings reset at ${view.width}px in ${view.theme} (QA-139)`, async ({ page }) => {
    const server = await startServer({ BITGAUGE_TEST_DEFAULTS__PRESET: 'quick', BITGAUGE_TEST_DEFAULTS__UNITS: 'bytes' })
    try {
      await page.setViewportSize({ width: view.width, height: view.height })
      await page.goto(`${server.url}/settings?preset=extended&streams=2&cap=200MB&units=bits&label=FromURL&theme=${view.theme}`)
      const changed = page.locator('section[aria-labelledby="settings-changed"]')
      await expect(changed.getByTestId('changed-preset')).toContainText('Extended')
      await expect(changed.getByTestId('changed-label')).toContainText('FromURL')
      await expect(changed.getByTestId('changed-download')).toHaveCount(0)
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bitgauge.settings.v1') ?? '{}'))).toEqual({})
      await page.getByTestId('changed-dataCapBytes').getByRole('button').click()
      await expect(page.getByTestId('changed-dataCapBytes')).toHaveCount(0)
      await expect(page.getByTestId('changed-units').getByRole('button')).toBeFocused()
      await expect(page.getByTestId('share-url')).not.toHaveValue(/cap=/)
      await expect(page.getByTestId('share-url')).toHaveValue(/label=FromURL/)
      await page.getByRole('button', { name: 'Reset all to defaults' }).click()
      await expect(page.getByRole('alertdialog')).toContainText('Result label')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(page.getByTestId('changed-label')).toBeVisible()
      // A stored edit alongside remaining URL overrides must appear in the same reset scope.
      await page.getByLabel('Result label', { exact: true }).fill('Stored')
      await page.getByLabel('Result label', { exact: true }).blur()
      await expect(page.getByTestId('changed-label')).toContainText('Stored')
      await page.reload()
      await expect(page.getByTestId('changed-label')).toContainText('Stored')
      await page.getByRole('button', { name: 'Reset all to defaults' }).click()
      await page.getByRole('button', { name: 'Reset all', exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
      await expect(page.getByTestId('preset-quick')).toHaveAttribute('aria-checked', 'true')
      await expect(changed).toContainText('Everything is at its default')
      expect(new URL(page.url()).search).toBe('')
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bitgauge.settings.v1') ?? '{}'))).toEqual({})
      await page.reload()
      await expect(changed).toContainText('Everything is at its default')
    } finally {
      await server.kill()
    }
  })
}
