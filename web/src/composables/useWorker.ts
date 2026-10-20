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
// of the engine but its messages. A demo build starts the demo's Worker instead (section 9), from a
// module imported only behind import.meta.env.VITE_DEMO: Vite bundles a Worker for every
// constructor it finds, even in a dead branch, so the demo's constructor cannot sit here.

/** The part of a Worker the bridge uses. */
interface EngineWorker {
  postMessage(command: EngineCommand): void
  addEventListener(type: 'message' | 'error', listener: (event: Event) => void): void
  terminate(): void
}

/**
 * A Worker still loading: commands wait for it, and the listeners added meanwhile reach it. One
 * that fails to load is reported to the error listeners, as a Worker's uncaught error would be.
 */
function loadingWorker(loading: Promise<Worker>): EngineWorker {
  const commands: EngineCommand[] = []
  const listeners: ['message' | 'error', (event: Event) => void][] = []
  let worker: Worker | null = null
  let ended = false
  loading.then(
    (loaded) => {
      if (ended) {
        loaded.terminate()
        return
      }
      worker = loaded
      listeners.forEach(([type, listener]) => loaded.addEventListener(type, listener))
      commands.splice(0).forEach((command) => loaded.postMessage(command))
    },
    () => {
      commands.length = 0
      if (!ended) {
        listeners.forEach(([type, listener]) => (type === 'error' ? listener(new Event('error')) : undefined))
      }
    },
  )
  return {
    postMessage: (command) => (worker === null ? commands.push(command) : worker.postMessage(command)),
    addEventListener: (type, listener) => (worker === null ? listeners.push([type, listener]) : worker.addEventListener(type, listener)),
    terminate: () => {
      ended = true
      worker?.terminate()
    },
  }
}

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

/** How often a hidden page, which gets no animation frames, still takes a demo's paced updates. */
const HIDDEN_FRAME_MS = 100

/** Runs `update` at the next animation frame, or after HIDDEN_FRAME_MS when none comes. */
function nextFrame(update: () => void): void {
  let done = false
  const run = () => {
    if (!done) {
      done = true
      update()
    }
  }
  requestAnimationFrame(run)
  setTimeout(run, HIDDEN_FRAME_MS)
}

/** Starts the engine's Worker; inside a component it ends with the component. */
export function useWorker(): WorkerBridge {
  const worker: EngineWorker = import.meta.env.VITE_DEMO
    ? loadingWorker(import('@/demo/start').then(({ startDemoWorker }) => startDemoWorker(nextFrame)))
    : new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' })
  const handlers = new Set<(event: EngineEvent) => void>()
  const failures = new Set<() => void>()
  worker.addEventListener('message', (message) => {
    handlers.forEach((handler) => handler((message as MessageEvent<EngineEvent>).data))
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
