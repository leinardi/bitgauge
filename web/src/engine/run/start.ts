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

import { IdleLatency, type IdleOutcome } from '@/engine/latency/idle'
import type { EngineEvent, IdleResult } from '@/engine/messages'
import { Connection } from '@/engine/run/connection'
import type { RunErrorCode, RunReport } from '@/engine/run/report'
import type { RunSettings } from '@/engine/settings'
import type { Clock, InfoResult, ProbeTiming, Transport } from '@/engine/types'

// The run's first two phases (measurement.md sections 1 and 4): the info phase, which reads GET
// /info, opens the WebSocket or its fallback and records the protocol, and idle latency, which
// starts over when the page was hidden or the echo reconnected. The run owns the state; these
// read and report it through a narrow context.

/** The info phase's one idle request, which records the protocol and is path B's capability check. */
const SMALL_PATH = '/api/v1/small'

/** What the info and idle phases read and report of their run. */
export interface StartContext {
  readonly clock: Clock
  readonly transport: Transport
  readonly settings: RunSettings
  emit(event: EngineEvent): void
  /** Settles with `promise`, or with null once the run is interrupted. */
  guard<T>(promise: Promise<T>): Promise<T | null>
  /** The run's interruption so far. */
  interrupted(): 'stop' | 'error' | null
  fail(code: RunErrorCode): void
  /** A protocol a request reported. */
  record(protocol: string | null | undefined): void
  /** Path B's capability check: the idle request's answer, null when it failed (measurement.md section 12.3). */
  capability(probe: ProbeTiming | null): void
  /** The info phase's connection, adopted as soon as it exists so the run can dispose of it. */
  opened(connection: Connection): void
  /** The idle median the connection's close sequence compares with. */
  medianMs(): number | null
  /** The echo reconnected on a new path. */
  reconnected(): void
  /** The idle latency now running, or null once it ended; a new one clears a pending restart. */
  running(idle: IdleLatency | null): void
  /** Whether idle latency must start over: the page was hidden or the echo reconnected. */
  restarting(): boolean
  /** When the current phase was entered. */
  enteredAt(): number
  /** A phase event of idle latency. */
  idleEvent(state: 'finished' | 'failed', idle?: IdleResult): void
}

/** GET /info for the epoch and limits, the WebSocket or its fallback, and one idle request. */
export async function infoPhase(context: StartContext): Promise<Pick<RunReport, 'info' | 'browser'> | null> {
  let start: InfoResult | null
  try {
    start = await context.guard(context.transport.info())
  } catch {
    context.fail('server-unreachable')
    return null
  }
  if (start === null) {
    return null
  }
  const connection = new Connection({
    clock: context.clock,
    transport: context.transport,
    epoch: start.info.server.epoch,
    medianMs: () => context.medianMs(),
    decided: (verdict) => (verdict.kind === 'error' ? context.fail(verdict.code) : context.reconnected()),
  })
  context.opened(connection)
  await context.guard(connection.open())
  try {
    const probe = await context.guard(context.transport.probe(SMALL_PATH))
    context.record(probe?.timing?.nextHopProtocol)
    if (probe !== null) {
      context.capability(probe)
    }
  } catch {
    // A failed idle request records no protocol and rules path B out; the rest is the phases' to meet.
    context.capability(null)
  }
  if (context.interrupted() !== null) {
    return null
  }
  return { info: start.info, browser: start.browser }
}

/** Idle latency over the connection's pinger, started over until it ends without a restart. */
export async function idlePhase(context: StartContext, connection: Connection | null): Promise<IdleOutcome | null> {
  for (;;) {
    const { clock, settings } = context
    const idle = new IdleLatency(clock, connection?.pinger ?? unreachable(), settings.pingCount, (progress) => context.emit({ type: 'idle', ...progress, phaseMs: clock.now() - context.enteredAt() }))
    context.running(idle)
    // A user stop keeps the samples so far when there are enough; an error keeps nothing.
    const outcome = (await idle.run()) ?? (context.interrupted() === 'stop' ? idle.partial() : null)
    context.running(null)
    const interrupt = context.interrupted()
    if (interrupt === 'error' || (interrupt !== null && outcome === null)) {
      if (interrupt === 'error') context.idleEvent('failed')
      return null
    }
    if (outcome === null) {
      if (context.restarting()) {
        continue
      }
      return null
    }
    if (outcome.unreachable) {
      context.idleEvent('failed')
      context.fail('server-unreachable')
      return null
    }
    return outcome
  }
}

function unreachable(): never {
  throw new Error('idle latency runs after the info phase opened its connection')
}
