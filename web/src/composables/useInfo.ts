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

import { computed, shallowRef } from 'vue'

import { getInfo, type Info } from '@/api/info'
import { apiMismatch, type BasePathMismatch, pageMismatch } from '@/lib/basePath'
import { readBasePath } from '@/router/base'

// The server info for display (frontend.md section 4, ui/flows.md section 1): GET /api/v1/info on
// load and on Retry. It drives the header's reachability, the connection info, the offline state
// and the About screen, and the Test screen configures the engine from its defaults. Before the
// first request the page's own path is checked against the base path (edge-cases.md section 20):
// a mismatch shows the error screen and nothing else loads.

/** Unknown until the first answer, then whether the last request succeeded. */
type Reachability = 'unknown' | 'connected' | 'unreachable'

const info = shallowRef<Info | null>(null)
const reachability = shallowRef<Reachability>('unknown')
const mismatch = shallowRef<BasePathMismatch | null>(null)
let pagePath = '/'
let pending: Promise<void> | null = null

async function request(): Promise<void> {
  const basePath = readBasePath(document)
  try {
    const answer = await getInfo(basePath)
    mismatch.value = apiMismatch(pagePath, basePath, answer.server.basePath)
    info.value = answer
    reachability.value = 'connected'
  } catch {
    reachability.value = 'unreachable'
  } finally {
    pending = null
  }
}

/** Asks GET /api/v1/info again, joining a request already on its way. */
function refresh(): Promise<void> {
  pending ??= request()
  return pending
}

/** The shared server info. */
export function useInfo() {
  return {
    info: computed(() => info.value),
    reachability: computed(() => reachability.value),
    mismatch: computed(() => mismatch.value),
    /**
     * The first load: the page's path, as it was before the router rewrote the address, is checked
     * against the base path and the SPA's fixed routes (`isRoute`), then GET /api/v1/info is asked
     * unless the path already failed.
     */
    load(path: string, isRoute: (route: string) => boolean): Promise<void> {
      pagePath = path
      mismatch.value = pageMismatch(path, readBasePath(document), isRoute)
      return mismatch.value === null ? refresh() : Promise.resolve()
    },
    refresh,
  }
}
