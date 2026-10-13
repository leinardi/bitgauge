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

import type { components } from '@/api/types.gen'

// GET /api/v1/info for the application's own display: the connection info and the About screen
// (wire-protocol.md section 5). The engine fetches its own at the start of each run and never
// receives this one (architecture.md section 4).

export type Info = components['schemas']['Info']

/** The info document under the base path; `/`, `/speed` and `/speed/` all name one prefix. */
export async function getInfo(basePath: string, fetcher: typeof fetch = fetch): Promise<Info> {
  // A demo build answers from its scenario's server (frontend.md section 9); a production build
  // drops the branch as dead code.
  if (import.meta.env.VITE_DEMO) {
    const { demoInfo } = await import('@/demo/control')
    return demoInfo()
  }
  const prefix = `/${basePath.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')
  const response = await fetcher(`${prefix}api/v1/info`, { cache: 'no-store', headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`GET /api/v1/info answered ${response.status}`)
  }
  return (await response.json()) as Info
}
