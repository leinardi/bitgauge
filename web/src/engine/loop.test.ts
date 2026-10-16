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

// The Worker's message loop (architecture.md section 4) with an injected run factory: configure,
// start, the commands a run in progress receives, and the invalid-settings answers.

import { describe, expect, it } from 'vitest'

import type { EngineCommand, EngineEvent, TestSettings } from '@/engine/messages'
import { messageLoop, type RunHandle, type RunRequest } from '@/engine/loop'

const SETTINGS: TestSettings = {
  preset: 'standard',
  phases: ['idle', 'download', 'upload'],
  streams: { mode: 'auto', fixed: 3, max: 6 },
  download: { minMs: 10_000, maxMs: 20_000 },
  upload: { minMs: 15_000, maxMs: 25_000 },
  dataCapBytes: null,
  units: 'bits',
  warmup: 'auto',
  pingCount: 20,
  overheadCompensationPercent: 0,
}

const INVALID = { type: 'error', code: 'invalid-settings', messageKey: 'errors.invalid-settings', partial: false }

/** A run that records what reaches it and ends when the test says so. */
class FakeRun implements RunHandle {
  readonly calls: string[] = []
  readonly request: RunRequest
  end: () => void = () => undefined
  fail: (error: Error) => void = () => undefined

  constructor(request: RunRequest) {
    this.request = request
  }

  start(): Promise<unknown> {
    this.calls.push('start')
    return new Promise((resolve, reject) => {
      this.end = () => resolve(null)
      this.fail = reject
    })
  }

  stop(): void {
    this.calls.push('stop')
  }

  visibility(visible: boolean): void {
    this.calls.push(`visibility:${visible}`)
  }

  network(): void {
    this.calls.push('network')
  }
}

function loop() {
  const events: EngineEvent[] = []
  const runs: FakeRun[] = []
  const failures: unknown[] = []
  const handle = messageLoop(
    (event) => events.push(event),
    (request) => {
      const run = new FakeRun(request)
      runs.push(run)
      return run
    },
    (error) => failures.push(error),
  )
  const send = (...commands: EngineCommand[]) => commands.forEach(handle)
  return { events, runs, failures, send }
}

describe('the message loop', () => {
  it('starts a run with the configured settings, the override, the base path and the visibility', () => {
    const { events, runs, send } = loop()
    send({ type: 'configure', settings: SETTINGS, basePath: '/speed' }, { type: 'start', override: { preset: 'quick', label: 'VPN', ignoredParameters: [{ parameter: 'streams', value: '12' }] }, visible: false })
    expect(runs).toHaveLength(1)
    const { settings, basePath, visible } = runs[0]?.request ?? {}
    expect({ basePath, visible }).toEqual({ basePath: '/speed', visible: false })
    // The override takes Quick's durations, ping count and fixed streams (measurement.md section 8.5).
    expect(settings).toMatchObject({ preset: 'quick', label: 'VPN', pingCount: 10, streams: { mode: 'fixed', fixed: 3 }, download: { minMs: 5000, maxMs: 10_000 }, ignoredParameters: [{ parameter: 'streams', value: '12' }] })
    expect(runs[0]?.calls).toEqual(['start'])
    // Each answered with the settings resolved: the configured ones, then the run's, without its labels.
    const { label: _label, ignoredParameters: _ignored, ...plain } = runs[0]?.request.settings ?? { ...SETTINGS, label: '' }
    expect(events).toEqual([
      { type: 'settings', scope: 'configured', settings: SETTINGS },
      { type: 'settings', scope: 'run', settings: plain },
    ])
  })

  it('resolves the URL parameters a configure carries, and keeps them for every run', () => {
    const { events, runs, send } = loop()
    send({ type: 'configure', settings: SETTINGS, override: { preset: 'extended', durationMs: 30_000, units: 'bytes' }, basePath: '/' }, { type: 'start', visible: true })
    const resolved = { ...SETTINGS, preset: 'extended', units: 'bytes', pingCount: 50, download: { minMs: 20_000, maxMs: 30_000 }, upload: { minMs: 20_000, maxMs: 30_000 } }
    expect(events).toEqual([
      { type: 'settings', scope: 'configured', settings: resolved },
      { type: 'settings', scope: 'run', settings: resolved },
    ])
    expect(runs[0]?.request.settings).toEqual(resolved)
  })

  it('keeps a label or ignored parameters out of the configured settings', () => {
    const { events, send } = loop()
    send({ type: 'configure', settings: SETTINGS, override: { label: 'VPN', ignoredParameters: [{ parameter: 'cap', value: '1kB' }] } as never, basePath: '/' })
    expect(events).toEqual([{ type: 'settings', scope: 'configured', settings: SETTINGS }])
  })

  it('passes stop, visibility and network to the run in progress', () => {
    const { runs, send } = loop()
    send({ type: 'configure', settings: SETTINGS, basePath: '/' }, { type: 'start', visible: true })
    send({ type: 'visibility', visible: false }, { type: 'network', event: 'offline' }, { type: 'stop' })
    expect(runs[0]?.calls).toEqual(['start', 'visibility:false', 'network', 'stop'])
  })

  it('ignores a start while a run is in progress, and starts the next once it has ended', async () => {
    const { runs, send } = loop()
    send({ type: 'configure', settings: SETTINGS, basePath: '/' }, { type: 'start', visible: true }, { type: 'start', visible: true })
    expect(runs).toHaveLength(1)
    runs[0]?.end()
    await Promise.resolve()
    await Promise.resolve()
    send({ type: 'start', visible: true })
    expect(runs).toHaveLength(2)
  })

  it('reports a run that fails inside the engine, and starts the next', async () => {
    const { events, runs, failures, send } = loop()
    send({ type: 'configure', settings: SETTINGS, basePath: '/' }, { type: 'start', visible: true })
    const error = new Error('engine failure')
    runs[0]?.fail(error)
    await Promise.resolve()
    await Promise.resolve()
    expect(failures).toEqual([error])
    expect(events.map((event) => event.type)).toEqual(['settings', 'settings'])
    send({ type: 'start', visible: true })
    expect(runs).toHaveLength(2)
  })

  it('ignores the run commands with no run in progress', () => {
    const { events, runs, send } = loop()
    send({ type: 'stop' }, { type: 'visibility', visible: true }, { type: 'network', event: 'type-changed' })
    expect(events).toEqual([])
    expect(runs).toEqual([])
  })

  it('answers invalid settings, an invalid override and a start before configure with invalid-settings', () => {
    const { events, runs, send } = loop()
    send({ type: 'start', visible: true })
    send({ type: 'configure', settings: { ...SETTINGS, pingCount: 0 }, basePath: '/' }, { type: 'start', visible: true })
    send({ type: 'configure', settings: SETTINGS, basePath: '/' }, { type: 'start', override: { durationMs: 1000 }, visible: true })
    send({ type: 'start', override: { ignoredParameters: [{ parameter: 'server', value: 'x' }] }, visible: true }, { type: 'start', override: { ignoredParameters: [{ parameter: 'cap', value: '1' }, { parameter: 'cap', value: '2' }] }, visible: true })
    send({ type: 'start', override: { ignoredParameters: [{ parameter: 'label', value: 'x'.repeat(65) }] }, visible: true })
    send({ type: 'configure', settings: SETTINGS, override: { streams: { mode: 'fixed', fixed: 7, max: 6 } }, basePath: '/' })
    expect(events.filter((event) => event.type !== 'settings')).toEqual([INVALID, INVALID, INVALID, INVALID, INVALID, INVALID, INVALID, INVALID])
    expect(runs).toEqual([])
  })

  it('keeps the last valid configuration when a later one is invalid', () => {
    const { events, runs, send } = loop()
    send({ type: 'configure', settings: SETTINGS, basePath: '/a' }, { type: 'configure', settings: { ...SETTINGS, units: 'nibbles' as 'bits' }, basePath: '/b' })
    send({ type: 'start', visible: true })
    expect(events.map((event) => event.type)).toEqual(['settings', 'error', 'settings'])
    expect(runs[0]?.request.basePath).toBe('/a')
  })
})
