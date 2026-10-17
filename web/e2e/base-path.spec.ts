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

// A sub-path deployment and the base-path mismatch (edge-cases.md section 20, ui/flows.md
// section 1): a BitGauge configured for /speed runs a test with every request under /speed, answers
// 404 at the bare origin, and its page served at another path shows the mismatch screen and sends
// no request.

import { type Server, startServer } from './fixtures/server'
import { expectAccessible } from './fixtures/axe'
import { expect, test } from './fixtures/test'

let server: Server

test.beforeEach(async () => {
  server = await startServer({ BITGAUGE_SERVER__BASE_PATH: '/speed' })
})

test.afterEach(async () => {
  await server.kill()
})

test('runs a test under /speed, every request under the base path', async ({ page }) => {
  test.setTimeout(120_000)
  const paths: string[] = []
  page.on('request', (request) => paths.push(new URL(request.url()).pathname))
  // A WebSocket handshake is not a request event; its URL is built apart from the HTTP base.
  const sockets: string[] = []
  page.on('websocket', (socket) => sockets.push(new URL(socket.url()).pathname))

  await page.goto(`${server.url}/?run=1&preset=quick`)
  await expect(page.getByTestId('result-bar')).toContainText('Saved to history', { timeout: 90_000 })
  expect(paths.length).toBeGreaterThan(0)
  expect(paths.filter((path) => !path.startsWith('/speed/'))).toEqual([])
  expect(sockets).toContain('/speed/api/v1/ws')
  expect(sockets.filter((path) => !path.startsWith('/speed/'))).toEqual([])
})

test('answers 404 at the bare origin', async ({ request }) => {
  const origin = new URL(server.url).origin
  expect((await request.get(`${origin}/`)).status()).toBe(404)
  expect((await request.get(`${origin}/api/v1/info`)).status()).toBe(404)
})

test('shows the mismatch screen for its page served at /, and sends no request', async ({ page }) => {
  // A proxy that forwards the bare path to the /speed instance, as well as its assets.
  const origin = new URL(server.url).origin
  await page.route(`${origin}/`, async (route) => route.fulfill({ response: await route.fetch({ url: `${server.url}/` }) }))
  const api: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/api/')) {
      api.push(request.url())
    }
  })

  await page.goto(`${origin}/`)
  await expect(page.getByRole('heading', { name: "The base path doesn't match this URL" })).toBeVisible()
  const screen = page.getByRole('alert')
  await expect(screen).toContainText('BitGauge is configured for /speed but this page was served at /.')
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Deployment docs' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start test' })).toHaveCount(0)
  await expectAccessible(page)
  expect(api).toEqual([])
})
