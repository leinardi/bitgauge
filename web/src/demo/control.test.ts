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

// The page's side of a fast-forward (frontend.md section 9): the demo Worker's messages reach the
// page's listeners once per frame, in their order, while a scripted stop is pressed at once.

import { describe, expect, it, vi } from 'vitest'

import { commandOf, DEFAULTS } from '@/demo/choice'
import { attachWorker, chooseScenario, onScriptedStop } from '@/demo/control'

/** A demo Worker as the page sees it: messages it receives, and the commands posted to it. */
function fakeWorker() {
  const target = new EventTarget()
  const posted: unknown[] = []
  return Object.assign(target, { postMessage: (command: unknown) => posted.push(command), posted })
}

describe('a fast-forward on the page', () => {
  it('replays the Worker’s messages once per frame, in order, and presses a scripted stop at once', async () => {
    chooseScenario(commandOf({ ...DEFAULTS, scenario: 'continuous' }))
    const worker = fakeWorker()
    const frames: (() => void)[] = []
    attachWorker(worker as unknown as Worker, (update) => frames.push(update))
    const seen: unknown[] = []
    worker.addEventListener('message', (event) => seen.push((event as MessageEvent).data))
    const pressed = vi.fn()
    onScriptedStop(pressed)
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1))
    for (const n of [1, 2, 3]) {
      worker.dispatchEvent(new MessageEvent('message', { data: { type: 'sample', n } }))
    }
    worker.dispatchEvent(new MessageEvent('message', { data: { type: 'demo-press-stop' } }))
    expect(pressed).toHaveBeenCalledOnce()
    // One frame asked for the three samples, none seen yet.
    expect(frames).toHaveLength(1)
    expect(seen).toEqual([])
    frames[0]?.()
    expect(seen).toEqual([1, 2, 3].map((n) => ({ type: 'sample', n })))
    worker.dispatchEvent(new MessageEvent('message', { data: { type: 'phase' } }))
    expect(frames).toHaveLength(2)
  })
})
