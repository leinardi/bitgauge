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

// The message contract is types only, so these tests are checked by the type checker (vue-tsc
// covers test files): the unions carry exactly the members architecture.md section 4 and
// measurement.md section 16 list, and narrowing on `type` is exhaustive.

import { describe, expect, expectTypeOf, it } from 'vitest'

import type { EngineCommand, EngineErrorCode, EngineEvent, NoticeCode, PhaseName } from '@/engine/messages'

function unreachable(value: never): never {
  throw new Error(`unhandled message ${JSON.stringify(value)}`)
}

// A union member handled nowhere fails the type check here rather than being dropped at run time.
function commandName(command: EngineCommand): string {
  switch (command.type) {
    case 'configure':
    case 'start':
    case 'stop':
    case 'visibility':
    case 'network':
      return command.type
    default:
      return unreachable(command)
  }
}

function eventName(event: EngineEvent): string {
  switch (event.type) {
    case 'phase':
    case 'sample':
    case 'settings':
    case 'idle':
    case 'result':
    case 'error':
      return event.type
    default:
      return unreachable(event)
  }
}

describe('message contract', () => {
  it('has the commands of architecture.md section 4', () => {
    expectTypeOf<EngineCommand['type']>().toEqualTypeOf<'configure' | 'start' | 'stop' | 'visibility' | 'network'>()
    expect(commandName({ type: 'visibility', visible: false })).toBe('visibility')
    expect(commandName({ type: 'network', event: 'offline' })).toBe('network')
  })

  it('has the events of architecture.md section 4', () => {
    expectTypeOf<EngineEvent['type']>().toEqualTypeOf<'phase' | 'sample' | 'settings' | 'idle' | 'result' | 'error'>()
    expect(eventName({ type: 'phase', phase: 'info', state: 'started', notices: [] })).toBe('phase')
  })

  it('names the phases of measurement.md section 1', () => {
    expectTypeOf<PhaseName>().toEqualTypeOf<'info' | 'idle' | 'download' | 'upload'>()
  })

  it('carries a sample value as bytes or null, never anything else', () => {
    type Sample = Extract<EngineEvent, { type: 'sample' }>
    expectTypeOf<Sample['values']>().toEqualTypeOf<(number | null)[]>()
  })

  it('has the v0.1 notice codes of measurement.md section 16', () => {
    expectTypeOf<NoticeCode>().toEqualTypeOf<
      | 'slow-link-extended'
      | 'low-confidence'
      | 'data-cap-reached'
      | 'stream-limit'
      | 'insufficient-data'
      | 'url-parameter-ignored'
      | 'stopped-early'
      | 'server-restarted'
      | 'server-unreachable'
      | 'proxy-buffering-suspected'
      | 'browser-upload-limit'
      | 'upload-interrupted'
      | 'response-compression-detected'
      | 'overhead-compensation'
      | 'timer-throttling-detected'
      | 'page-hidden'
      | 'network-changed'
      | 'websocket-reopened'
      | 'websocket-unavailable'
      | 'base-path-mismatch'
    >()
  })

  it('has the error codes of architecture.md section 4, each with its catalog key', () => {
    expectTypeOf<EngineErrorCode>().toEqualTypeOf<
      'invalid-settings' | 'requests-failed' | 'network-changed' | 'server-restarted' | 'server-unreachable'
    >()

    type ErrorEvent = Extract<EngineEvent, { type: 'error' }>
    expectTypeOf<ErrorEvent['messageKey']>().toEqualTypeOf<`errors.${EngineErrorCode}`>()
  })
})
