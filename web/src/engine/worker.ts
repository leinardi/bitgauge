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
import { messageLoop, type RunRequest } from '@/engine/loop'
import type { EngineCommand, EngineEvent } from '@/engine/messages'
import { Run } from '@/engine/run'
import { BrowserTransport } from '@/engine/transport'

// The engine's Worker: the message loop of loop.ts, wired to the Worker's messages with the
// production Clock and Transport.

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
