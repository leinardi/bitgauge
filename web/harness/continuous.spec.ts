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

// The Continuous memory check's browser driver (testing.md section 5, accuracy-harness.md section
// 7), Chromium only. The documented URL parameters start a Continuous download a little longer than
// the minutes sampled (ui/url-params.md). From the steady start, when the download's hint turns from
// "warming up" to measuring, it forces a garbage collection on the engine Worker every 60 s and
// reads its heap through the Chrome DevTools Protocol, and writes the samples to
// HARNESS_EXPORT_DIR/continuous.json, which the Go runner judges; nothing here judges them.
//
// Playwright cannot address a Worker's flattened DevTools session (newCDPSession takes a page or a
// frame, and send has no session id), so the page's session auto-attaches unflattened and talks to
// the Worker through Target.sendMessageToTarget, reading its replies from
// Target.receivedMessageFromTarget.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { type CDPSession, expect, test } from '@playwright/test'

const minutes = Number(process.env.HARNESS_CONTINUOUS_MINUTES ?? '60')
const exportDir = process.env.HARNESS_EXPORT_DIR ?? 'test-results/harness-export'

const MINUTE_MS = 60_000
/** The run's length past the last sample, so the last one still reads a running download. */
const TAIL_S = 30
/** The page load, idle latency and warm-up before the steady start, and the run's tail. */
const SETUP_MS = 9 * MINUTE_MS
/** The engine Worker's script in the built SPA (web/src/engine/worker.ts, bundled by Vite). */
const ENGINE_WORKER = /\/assets\/worker-[\w-]+\.js$/u

interface HeapSample {
  minute: number
  atMs: number
  usedSize: number
  totalSize: number
}

interface Reply {
  id: number
  result?: unknown
  error?: { message: string }
}

/** The engine Worker's DevTools target, reached through the page's session. */
class WorkerTarget {
  private next = 1
  private readonly pending = new Map<number, (reply: Reply) => void>()

  constructor(
    private readonly session: CDPSession,
    private readonly sessionId: string,
    readonly url: string,
  ) {
    session.on('Target.receivedMessageFromTarget', (event) => {
      if (event.sessionId !== this.sessionId) return
      const reply = JSON.parse(event.message) as Reply
      this.pending.get(reply.id)?.(reply)
      this.pending.delete(reply.id)
    })
  }

  async call<T>(method: string): Promise<T> {
    const id = this.next++
    const replied = new Promise<Reply>((resolve) => this.pending.set(id, resolve))
    await this.session.send('Target.sendMessageToTarget', { sessionId: this.sessionId, message: JSON.stringify({ id, method, params: {} }) })
    const reply = await replied
    if (reply.error !== undefined) throw new Error(`${method}: ${reply.error.message}`)
    return reply.result as T
  }
}

test('sample the engine Worker heap through a Continuous download', async ({ page }, testInfo) => {
  expect(Number.isInteger(minutes) && minutes >= 6, 'HARNESS_CONTINUOUS_MINUTES is a whole number of at least 6').toBe(true)
  // The minutes bind it, not the configuration's 15 minutes.
  test.setTimeout(minutes * MINUTE_MS + SETUP_MS)

  const session = await page.context().newCDPSession(page)
  const attached = new Promise<WorkerTarget>((resolve) => {
    session.on('Target.attachedToTarget', (event) => {
      if (event.targetInfo.type === 'worker' && ENGINE_WORKER.test(new URL(event.targetInfo.url).pathname)) {
        resolve(new WorkerTarget(session, event.sessionId, event.targetInfo.url))
      }
    })
  })
  await session.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false })

  const params = new URLSearchParams({ run: '1', preset: 'continuous', test: 'download', duration: String(minutes * 60 + TAIL_S), label: 'harness-continuous' })
  await page.goto(`/?${params.toString()}`)
  const worker = await attached

  // The steady start: the gauge's note leaves "warming up" for the run-wide average.
  await expect(page.getByTestId('gauge-note')).toHaveText(/^avg so far/u, { timeout: SETUP_MS })
  const steadyAt = Date.now()
  const download = page.getByTestId('phase-indicator').locator('> li').filter({ hasText: 'Download' })

  const samples: HeapSample[] = []
  for (let minute = 0; minute <= minutes; minute++) {
    const wait = steadyAt + minute * MINUTE_MS - Date.now()
    if (wait > 0) await page.waitForTimeout(wait)
    await expect(download, `the download still runs at minute ${minute}`).toHaveAttribute('data-state', 'active')
    await worker.call('HeapProfiler.collectGarbage')
    const usage = await worker.call<{ usedSize: number; totalSize: number }>('Runtime.getHeapUsage')
    samples.push({ minute, atMs: Date.now() - steadyAt, usedSize: usage.usedSize, totalSize: usage.totalSize })
    testInfo.annotations.push({ type: 'heap', description: `minute ${minute}: ${usage.usedSize} bytes used` })
  }

  await mkdir(exportDir, { recursive: true })
  await writeFile(path.join(exportDir, 'continuous.json'), `${JSON.stringify({ workerUrl: worker.url, samples }, null, 2)}\n`)
})
