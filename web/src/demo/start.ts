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

import { attachWorker, type FrameScheduler } from '@/demo/control'

// The demo build's Worker (frontend.md section 9), started in place of the engine's. Vite bundles a
// Worker for every `new Worker(new URL(..., import.meta.url))` it finds in a module it loads, dead
// branch or not, so this constructor lives here, in a module the page imports only behind
// import.meta.env.VITE_DEMO, which a production build never loads.

/** Starts the demo Worker and hands it the scenario the demo panel chose; `frame` paces a fast-forward's page updates. */
export function startDemoWorker(frame?: FrameScheduler): Worker {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  attachWorker(worker, frame)
  return worker
}
