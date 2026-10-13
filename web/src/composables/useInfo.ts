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
import { readBasePath } from '@/router/base'

// The server info for display (frontend.md section 4): GET /api/v1/info once, again on Retry. The
// header shows the server's name and whether it answered; the Test screen configures the engine
// from its defaults.

/** Unknown until the first answer, then whether the last request succeeded. */
type Reachability = 'unknown' | 'connected' | 'unreachable'

const info = shallowRef<Info | null>(null)
const reachability = shallowRef<Reachability>('unknown')
let pending: Promise<void> | null = null

async function request(fetcher: typeof fetch): Promise<void> {
  try {
    info.value = await getInfo(readBasePath(document), fetcher)
    reachability.value = 'connected'
  } catch {
    reachability.value = 'unreachable'
  } finally {
    pending = null
  }
}

/** The shared server info; `refresh` asks again, joining a request already on its way. */
export function useInfo() {
  return {
    info: computed(() => info.value),
    reachability: computed(() => reachability.value),
    refresh(fetcher: typeof fetch = (input, init) => fetch(input, init)): Promise<void> {
      pending ??= request(fetcher)
      return pending
    },
  }
}
