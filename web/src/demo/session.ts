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

import { DemoClock } from '@/demo/clock'
import { Link, type LinkProfile } from '@/demo/link'
import type { DemoCommand, DemoErrorKind, DemoScenario, ScriptPoint } from '@/demo/scenarios'
import { DemoTransport } from '@/demo/transport'
import { messageLoop } from '@/engine/loop'
import type { EngineCommand, EngineEvent, PhaseName } from '@/engine/messages'
import { Run } from '@/engine/run'
import type { BrowserIdentity, Clock, Info } from '@/engine/types'

// One demo scenario in the demo Worker (frontend.md section 9): the engine's own message loop and
// Run, on the demo clock, against a fresh simulated link for each run. The scenario's script acts
// at its instants, measured from the start of a phase as the run's own events report it: a user
// stop, a failure of the selected kind, a WebSocket a proxy drops, or a hold that keeps the screen
// in one state.

/** The busy share a CPU-bound demo reports, above measurement.md section 16's threshold. */
const CPU_BOUND_BUSY = 0.95

export interface SessionOptions {
  /** The real-time clock the demo clock runs on. */
  base: Clock
  /** The panel's choices; the scenario it names is resolved by the caller into the next three. */
  command: DemoCommand
  scenario: DemoScenario
  profile: LinkProfile
  /** GET /info as the scenario's server answers it. */
  info: Info
  /** The browser's own identity: the demo does not pretend to be another browser. */
  browser: BrowserIdentity
  emit: (event: EngineEvent) => void
  fail: (error: unknown) => void
  /** Asks the page to press Stop, at a scripted stop: the page, not the session, stops the run. */
  pressStop: () => void
}

export class DemoSession {
  readonly clock: DemoClock
  private readonly options: SessionOptions
  private readonly scenario: DemoScenario
  private readonly command: DemoCommand
  private readonly handle: (command: EngineCommand) => void
  private link: Link | null = null
  private runs = 0
  private ended = false

  constructor(options: SessionOptions) {
    const { command } = options
    this.options = options
    this.command = command
    this.scenario = options.scenario
    this.clock = new DemoClock(options.base, {
      speed: command.speed,
      resolutionMs: command.timerResolutionMs,
      busyFraction: command.cpuBound ? CPU_BOUND_BUSY : null,
    })
    const emit = (event: EngineEvent) => {
      if (this.ended) {
        return
      }
      if (event.type === 'phase' && event.state === 'started') {
        this.script(event.phase)
      }
      options.emit(event)
    }
    // The page's wall clock, as far as it is from the Worker's when the command arrived.
    const offsetMs = command.wallClockMs === undefined ? 0 : command.wallClockMs - Date.now()
    this.handle = messageLoop(
      emit,
      ({ settings, visible, emit: post }) => {
        const transport = new DemoTransport(this.clock, this.newLink(), options.info, options.browser)
        return new Run({ clock: this.clock, transport, settings, visible, emit: post, wallClock: () => Date.now() + offsetMs })
      },
      options.fail,
    )
  }

  /** An engine command from the page. */
  receive(command: EngineCommand): void {
    this.handle(command)
  }

  /** Ends the session for good: its clock holds, so a run in progress goes quiet where it is. */
  end(): void {
    this.ended = true
    this.clock.hold()
  }

  /** Each run meets the link as the scenario describes it, with its own draws. */
  private newLink(): Link {
    const profile = { ...this.options.profile, ...(this.scenario.webSocket === false ? { webSocket: false } : {}) }
    const link = new Link(profile, this.options.info.server.epoch, ++this.runs)
    if (this.scenario.offline === true) {
      link.unreachable(Number.NEGATIVE_INFINITY)
    }
    this.link = link
    return link
  }

  /** Schedules what the script does once `phase` has started. */
  private script(phase: PhaseName): void {
    const { stop, fault, hold, webSocketCloses } = this.scenario
    const after = (point: ScriptPoint | undefined, action: () => void) => {
      if (point?.phase === phase) {
        this.clock.setTimer(point.afterMs, action)
      }
    }
    after(stop, () => this.options.pressStop())
    after(fault, () => this.fault(fault?.kind ?? this.command.errorKind, fault?.uploads))
    after(webSocketCloses, () => this.link?.closeWebSocket(this.clock.now(), webSocketCloses?.reopen))
    if (this.command.hold) {
      after(hold, () => this.clock.hold())
    }
  }

  private fault(kind: DemoErrorKind, uploads?: number): void {
    const link = this.link
    const now = this.clock.now()
    switch (kind) {
      case 'requests':
        if (uploads === undefined) link?.failFrom(now)
        else link?.failUploads(now, uploads)
        return
      case 'unreachable':
        link?.unreachable(now)
        return
      case 'restarted':
        link?.restart(now)
        return
      case 'network':
        this.handle({ type: 'network', event: 'type-changed' })
    }
  }
}
