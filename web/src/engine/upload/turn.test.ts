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

// The preparation turn of measurement.md section 7.2 on its own: who waits, the order of the
// turn, the three ways a hold ends, and the browser without upload progress dropping it.

import { describe, expect, it } from 'vitest'

import { FakeClock } from '@/engine/test/fakeClock'
import { PreparationTurn, TURN_MAX_MS, TURN_MIN_BYTES, type TurnHold } from '@/engine/upload/turn'

/** Takes the turn and records when the hold arrives. */
function taking(turn: PreparationTurn): { hold: () => TurnHold | undefined } {
  let hold: TurnHold | undefined
  void turn.take().then((value) => {
    hold = value
  })
  return { hold: () => hold }
}

describe('PreparationTurn', () => {
  it('makes only requests of at least 1 MiB wait', () => {
    const turn = new PreparationTurn(new FakeClock())
    expect(turn.waits(TURN_MIN_BYTES - 1)).toBe(false)
    expect(turn.waits(TURN_MIN_BYTES)).toBe(true)
  })

  it('gives the turn in the order it was asked for, on the first byte reported sent', async () => {
    const clock = new FakeClock()
    const turn = new PreparationTurn(clock)
    const first = taking(turn)
    const second = taking(turn)
    const third = taking(turn)
    await clock.advance(0)
    first.hold()?.sent()
    first.hold()?.progress(0)
    await clock.advance(10)
    expect(second.hold()).toBeUndefined()
    first.hold()?.progress(1)
    await clock.advance(0)
    expect(second.hold()).toBeDefined()
    expect(third.hold()).toBeUndefined()
  })

  it('passes the turn at the end of a request', async () => {
    const clock = new FakeClock()
    const turn = new PreparationTurn(clock)
    const first = taking(turn)
    const second = taking(turn)
    await clock.advance(0)
    first.hold()?.sent()
    first.hold()?.release()
    first.hold()?.release()
    await clock.advance(0)
    expect(second.hold()).toBeDefined()
    expect(clock.pending).toBe(0)
  })

  it('passes the turn 1 s after the send at the latest', async () => {
    const clock = new FakeClock()
    const turn = new PreparationTurn(clock)
    const first = taking(turn)
    const second = taking(turn)
    await clock.advance(0)
    first.hold()?.sent()
    await clock.advance(TURN_MAX_MS - 1)
    expect(second.hold()).toBeUndefined()
    await clock.advance(1)
    expect(second.hold()).toBeDefined()
    expect(clock.pending).toBe(0)
  })

  it('is dropped by a confirmed request of at least 1 MiB with no byte reported sent', () => {
    const turn = new PreparationTurn(new FakeClock())
    turn.confirmed(TURN_MIN_BYTES - 1, 0)
    turn.confirmed(TURN_MIN_BYTES, TURN_MIN_BYTES)
    expect(turn.waits(TURN_MIN_BYTES)).toBe(true)
    turn.confirmed(TURN_MIN_BYTES, 0)
    expect(turn.waits(TURN_MIN_BYTES)).toBe(false)
  })
})
