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

// GET /api/v1/info for the application, under the base path.

import { describe, expect, it } from 'vitest'

import { getInfo, type Info } from '@/api/info'

const INFO = { server: { name: 'home', epoch: 'e' } } as Info

/** A fetch that records each call and answers with `status`. */
function fetcher(status = 200) {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fake = (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return Promise.resolve(new Response(JSON.stringify(INFO), { status }))
  }
  return { calls, fake: fake as typeof fetch }
}

describe('getInfo', () => {
  it.each([
    ['/', '/api/v1/info'],
    ['/speed', '/speed/api/v1/info'],
    ['/speed/', '/speed/api/v1/info'],
  ])('asks under the base path %s, uncached', async (basePath, url) => {
    const { calls, fake } = fetcher()
    expect(await getInfo(basePath, fake)).toEqual(INFO)
    expect(calls).toEqual([{ url, init: { cache: 'no-store', headers: { Accept: 'application/json' } } }])
  })

  it('throws on any answer but a success', async () => {
    await expect(getInfo('/', fetcher(503).fake)).rejects.toThrow('503')
  })
})
