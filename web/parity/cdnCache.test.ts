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
// @vitest-environment node

import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { BrowserContext, Route } from '@playwright/test'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { routeThroughCdnCache } from './cdnCache.ts'

type Handler = (route: Route) => Promise<void>

interface Outcome {
  action: 'continue' | 'abort' | 'fulfill'
  body?: string
  headers?: Record<string, string>
}

/** A context that keeps the one handler routeThroughCdnCache installs, and a network that counts fetches. */
async function routed(cacheDir: string, fetched: string[]): Promise<(url: string) => Promise<Outcome>> {
  let handler: Handler | undefined
  const context = {
    route: (_pattern: string, fn: Handler) => {
      handler = fn
      return Promise.resolve()
    },
  } as unknown as BrowserContext
  await routeThroughCdnCache(context, cacheDir)
  return async (url) => {
    let outcome: Outcome | undefined
    const route = {
      request: () => ({ url: () => url }),
      continue: () => {
        outcome = { action: 'continue' }
        return Promise.resolve()
      },
      abort: () => {
        outcome = { action: 'abort' }
        return Promise.resolve()
      },
      fetch: () => {
        fetched.push(url)
        return Promise.resolve({
          ok: () => true,
          body: () => Promise.resolve(Buffer.from(`body of ${url}`)),
          headers: () => ({ 'content-type': 'application/javascript' }),
        })
      },
      fulfill: (options: { body: Buffer; headers: Record<string, string> }) => {
        outcome = { action: 'fulfill', body: options.body.toString(), headers: options.headers }
        return Promise.resolve()
      },
    } as unknown as Route
    await handler?.(route)
    if (outcome === undefined) throw new Error(`${url}: the route was left unanswered`)
    return outcome
  }
}

const REACT = 'https://unpkg.com/react@18.3.1/umd/react.development.js'

describe('routeThroughCdnCache', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'parity-cdn-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('lets the two local servers and inline data through, and refuses every other host', async () => {
    const fetched: string[] = []
    const request = await routed(dir, fetched)
    expect(await request('http://127.0.0.1:5181/ui_kits/app/index.html')).toEqual({ action: 'continue' })
    expect(await request('http://localhost:5180/')).toEqual({ action: 'continue' })
    expect(await request('data:image/png;base64,AAAA')).toEqual({ action: 'continue' })
    expect(await request('https://fonts.googleapis.com/css2?family=Inter')).toEqual({ action: 'abort' })
    expect(await request('https://cdn.jsdelivr.net/npm/react')).toEqual({ action: 'abort' })
    expect(fetched).toEqual([])
  })

  it('fetches an unpkg.com script once and serves it from the cache after, with CORS for its integrity check', async () => {
    const fetched: string[] = []
    const first = await routed(dir, fetched)
    const expected = { action: 'fulfill', body: `body of ${REACT}`, headers: { 'content-type': 'application/javascript', 'access-control-allow-origin': '*' } }
    expect(await first(REACT)).toEqual(expected)
    // A later run, with a fresh context, reads the same entry.
    const later = await routed(dir, fetched)
    expect(await later(REACT)).toEqual(expected)
    expect(fetched).toEqual([REACT])
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })
})
