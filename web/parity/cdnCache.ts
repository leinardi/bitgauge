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

// The prototype loads React, ReactDOM and Babel from unpkg.com, each pinned by an integrity hash;
// its fonts are local. Serving the scripts from a local cache (web/parity/.cache/cdn/, fetched once)
// keeps a CDN hiccup from failing a comparison and keeps runs fast. Anything else off the two local
// servers is refused, so nothing outside the repository can change a result.

import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BrowserContext, Route } from '@playwright/test'

// Resolved when a script is first served, not on import: the module's own URL is a file only under
// Node, and the unit tests that load it in a DOM environment never serve one.
function defaultCacheDir(): string {
  return fileURLToPath(new URL('./.cache/cdn/', import.meta.url))
}

const CDN_HOSTS = new Set(['unpkg.com'])
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])

interface CachedMeta {
  url: string
  contentType: string
}

async function writeAtomically(file: string, data: string | Buffer): Promise<void> {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temp, data)
  await rename(temp, file)
}

async function readCached(bodyFile: string, metaFile: string): Promise<{ body: Buffer; meta: CachedMeta } | null> {
  try {
    const meta = JSON.parse(await readFile(metaFile, 'utf8')) as CachedMeta
    return { body: await readFile(bodyFile), meta }
  } catch {
    return null
  }
}

// Scripts load with crossorigin and an integrity hash, which needs a CORS response.
async function fulfill(route: Route, body: Buffer, meta: CachedMeta): Promise<void> {
  await route.fulfill({ status: 200, body, headers: { 'content-type': meta.contentType, 'access-control-allow-origin': '*' } })
}

async function serveFromCache(route: Route, url: string, cacheDir: string): Promise<void> {
  const key = createHash('sha256').update(url).digest('hex')
  const bodyFile = path.join(cacheDir, key)
  const metaFile = `${bodyFile}.json`
  const cached = await readCached(bodyFile, metaFile)
  if (cached !== null) {
    await fulfill(route, cached.body, cached.meta)
    return
  }
  const response = await route.fetch()
  if (!response.ok()) {
    await route.fulfill({ response })
    return
  }
  const body = await response.body()
  const meta: CachedMeta = { url, contentType: response.headers()['content-type'] ?? 'application/octet-stream' }
  await mkdir(cacheDir, { recursive: true })
  // Body first, metadata last: a cache entry exists only once both halves are in place.
  await writeAtomically(bodyFile, body)
  await writeAtomically(metaFile, JSON.stringify(meta))
  await fulfill(route, body, meta)
}

export async function routeThroughCdnCache(context: BrowserContext, cacheDir?: string): Promise<void> {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (LOCAL_HOSTS.has(url.hostname) || url.protocol === 'data:' || url.protocol === 'blob:') {
      await route.continue()
    } else if (CDN_HOSTS.has(url.hostname)) {
      await serveFromCache(route, url.href, cacheDir ?? defaultCacheDir())
    } else {
      await route.abort('blockedbyclient')
    }
  })
}
