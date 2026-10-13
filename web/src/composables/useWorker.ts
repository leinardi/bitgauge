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

import { getCurrentScope, onScopeDispose } from 'vue'

import type { EngineCommand, EngineEvent } from '@/engine/messages'

// The bridge to the engine's Worker (frontend.md section 3): typed commands in, typed events out.
// The Worker is started by URL, which is not an import, so the application still imports nothing
// of the engine but its messages.

export interface WorkerBridge {
  post(command: EngineCommand): void
  /** Calls `handler` with every event; returns the function that stops it. */
  onEvent(handler: (event: EngineEvent) => void): () => void
  /**
   * Calls `handler` when the engine fails with an uncaught error, a defect rather than an error
   * code (architecture.md section 4); returns the function that stops it.
   */
  onError(handler: () => void): () => void
  /** Ends the Worker and drops every handler. */
  dispose(): void
}

/** Starts the engine's Worker; inside a component it ends with the component. */
export function useWorker(): WorkerBridge {
  const worker = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' })
  const handlers = new Set<(event: EngineEvent) => void>()
  const failures = new Set<() => void>()
  worker.addEventListener('message', (message: MessageEvent<EngineEvent>) => {
    handlers.forEach((handler) => handler(message.data))
  })
  worker.addEventListener('error', () => {
    failures.forEach((handler) => handler())
  })
  const bridge: WorkerBridge = {
    post: (command) => worker.postMessage(command),
    onEvent(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    onError(handler) {
      failures.add(handler)
      return () => failures.delete(handler)
    },
    dispose() {
      handlers.clear()
      failures.clear()
      worker.terminate()
    },
  }
  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => bridge.dispose())
  }
  return bridge
}
