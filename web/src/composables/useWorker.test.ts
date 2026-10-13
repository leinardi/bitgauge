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

// The Worker bridge over a stubbed Worker global: typed commands posted, events delivered to the
// handlers, and the Worker ended with the scope that started it.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { useWorker } from '@/composables/useWorker'
import type { EngineCommand, EngineEvent, TestSettings } from '@/engine/messages'

class StubWorker extends EventTarget {
  static started: { url: string; options: WorkerOptions | undefined; worker: StubWorker }[] = []
  readonly posted: unknown[] = []
  terminated = false

  constructor(url: URL | string, options?: WorkerOptions) {
    super()
    StubWorker.started.push({ url: String(url), options, worker: this })
  }

  postMessage(message: unknown): void {
    this.posted.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  emit(event: EngineEvent): void {
    this.dispatchEvent(new MessageEvent('message', { data: event }))
  }
}

const SETTINGS = { preset: 'standard', phases: ['idle', 'download', 'upload'] } as TestSettings

afterEach(() => {
  StubWorker.started = []
  vi.unstubAllGlobals()
})

describe('useWorker', () => {
  it('starts the engine Worker as a module and posts configure', () => {
    vi.stubGlobal('Worker', StubWorker)
    const bridge = useWorker()
    const command: EngineCommand = { type: 'configure', settings: SETTINGS, basePath: '/speed' }
    bridge.post(command)
    const [started] = StubWorker.started
    expect(started?.url).toMatch(/engine\/worker\.ts$/)
    expect(started?.options).toEqual({ type: 'module' })
    expect(started?.worker.posted).toEqual([command])
    bridge.dispose()
  })

  it('delivers events to the handlers until they stop', () => {
    vi.stubGlobal('Worker', StubWorker)
    const bridge = useWorker()
    const seen: EngineEvent[] = []
    const stop = bridge.onEvent((event) => seen.push(event))
    const worker = StubWorker.started[0]?.worker
    const event: EngineEvent = { type: 'phase', phase: 'info', state: 'started', notices: [] }
    worker?.emit(event)
    stop()
    worker?.emit(event)
    expect(seen).toEqual([event])
    bridge.dispose()
  })

  it('ends the Worker on dispose and with its scope', () => {
    vi.stubGlobal('Worker', StubWorker)
    const bridge = useWorker()
    bridge.dispose()
    expect(StubWorker.started[0]?.worker.terminated).toBe(true)

    const scope = effectScope()
    scope.run(() => useWorker())
    const scoped = StubWorker.started[1]?.worker
    expect(scoped?.terminated).toBe(false)
    scope.stop()
    expect(scoped?.terminated).toBe(true)
  })
})
