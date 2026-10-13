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

// The injected interfaces are types only, so these tests are checked by the type checker: they
// hold the interfaces to frontend.md section 2 and to the generated API types.

import { describe, expectTypeOf, it } from 'vitest'

import type { components } from '@/api/types.gen'
import type { BrowserIdentity, Clock, Info, InfoResult, Transport, UploadResponse, WsEcho } from '@/engine/types'

describe('injected interfaces', () => {
  it('gives the clock now, timers, the busy time, the resolution and cross-origin isolation', () => {
    expectTypeOf<Clock['now']>().toEqualTypeOf<() => number>()
    expectTypeOf<Clock['setTimer']>().parameters.toEqualTypeOf<[number, () => void]>()
    expectTypeOf<Clock['clearTimer']>().parameters.toEqualTypeOf<[number]>()
    expectTypeOf<Clock['busyMs']>().toEqualTypeOf<() => number>()
    expectTypeOf<Clock['resolutionMs']>().toEqualTypeOf<number>()
    expectTypeOf<Clock['crossOriginIsolated']>().toEqualTypeOf<boolean>()
  })

  it('types the server answers with the API contract', () => {
    expectTypeOf<Info>().toEqualTypeOf<components['schemas']['Info']>()
    expectTypeOf<UploadResponse['telemetry']>().toEqualTypeOf<components['schemas']['UploadTelemetry'] | null>()
    expectTypeOf<ReturnType<Transport['info']>>().toEqualTypeOf<Promise<InfoResult>>()
    expectTypeOf<InfoResult>().toEqualTypeOf<{ info: Info; browser: BrowserIdentity }>()
  })

  it('takes an abort signal for every transfer', () => {
    expectTypeOf<Transport['download']>().parameter(1).toEqualTypeOf<AbortSignal>()
    expectTypeOf<Transport['upload']>().parameter(2).toEqualTypeOf<AbortSignal>()
    expectTypeOf<ReturnType<Transport['ws']>>().toEqualTypeOf<Promise<WsEcho>>()
  })
})
