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

import { BrowserClock } from '@/engine/clock'
import type { EngineCommand, EngineEvent, TestSettings } from '@/engine/messages'
import { Run } from '@/engine/run'
import { plainSettings, type RunSettings, resolveSettings } from '@/engine/settings'
import { BrowserTransport } from '@/engine/transport'

// The engine's Worker: the message loop of architecture.md section 4 and nothing else. Each
// command goes to the settings resolution or to the one run in progress; every rule lives in the
// modules behind them.

/** What the loop asks of a run. */
export interface RunHandle {
  start(): Promise<unknown>
  stop(): void
  visibility(visible: boolean): void
  network(): void
}

export interface RunRequest {
  settings: RunSettings
  basePath: string
  visible: boolean
  emit: (event: EngineEvent) => void
}

/**
 * The loop: `configure` stores validated settings, `start` begins a run with them unless one is in
 * progress, and `stop`, `visibility` and `network` reach the run in progress. A `start` before a
 * valid `configure` fails with invalid-settings. A run that fails inside the engine goes to
 * `fail`, and the next `start` may begin another.
 */
export function messageLoop(
  emit: (event: EngineEvent) => void,
  createRun: (request: RunRequest) => RunHandle,
  fail: (error: unknown) => void,
): (command: EngineCommand) => void {
  let configured: { settings: TestSettings; basePath: string } | null = null
  let current: RunHandle | null = null
  const invalid = () => emit({ type: 'error', code: 'invalid-settings', messageKey: 'errors.invalid-settings', partial: false })

  return (command) => {
    switch (command.type) {
      case 'configure': {
        const resolution = resolveSettings(command.settings, command.override)
        if (resolution.ok) {
          // A configure carries settings only: a label or ignored parameters would belong to a run.
          configured = { settings: plainSettings(resolution.settings), basePath: command.basePath }
          emit({ type: 'settings', scope: 'configured', settings: configured.settings })
        } else {
          invalid()
        }
        return
      }
      case 'start': {
        if (current !== null) {
          return
        }
        const resolution = configured === null ? null : resolveSettings(configured.settings, command.override)
        if (configured === null || resolution === null || !resolution.ok) {
          invalid()
          return
        }
        emit({ type: 'settings', scope: 'run', settings: plainSettings(resolution.settings) })
        const run = createRun({ settings: resolution.settings, basePath: configured.basePath, visible: command.visible, emit })
        current = run
        run.start().then(
          () => {
            current = null
          },
          (error: unknown) => {
            current = null
            fail(error)
          },
        )
        return
      }
      case 'stop':
        current?.stop()
        return
      case 'visibility':
        current?.visibility(command.visible)
        return
      case 'network':
        current?.network()
    }
  }
}

/** Runs in a dedicated Worker only: the global scope there has no document. */
function inWorker(): boolean {
  return typeof self !== 'undefined' && typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope
}

if (inWorker()) {
  const clock = new BrowserClock()
  const post = (event: EngineEvent) => self.postMessage(event)
  const create = ({ settings, basePath, visible, emit }: RunRequest) => new Run({ clock, transport: new BrowserTransport(clock, basePath), settings, visible, emit })
  // An engine failure is the Worker's uncaught error, which reaches the page's Worker object.
  const handle = messageLoop(post, create, (error) => self.reportError(error))
  self.addEventListener('message', (event: MessageEvent<EngineCommand>) => clock.task(() => handle(event.data)))
}
