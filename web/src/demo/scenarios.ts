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

import type { DemoConfidence } from '@/demo/confidence'
import type { DemoLinkName } from '@/demo/fixtures'
import type { DemoResponsiveness } from '@/demo/responsiveness'
import type { Direction, PhaseName } from '@/engine/messages'
import type { Info } from '@/engine/types'

// The demo's scenarios (frontend.md section 9): one per state of the UI kit's Test screen (its
// TEST_STATES, the four Continuous ones included), one per loaded-latency case of its v0.2 panel
// (the WebSocket closing after idle latency, and each reason the upload's loaded latency can be
// unavailable for), and the run its Result detail shows, each a link and a script that the real
// engine plays out. The instants follow the kit's own
// defaults: its `cancelled` stops 3.1 s into upload, its `download` shows 7.5 s into download, and
// so on.

/** An instant of a run: `afterMs` of demo time after `phase` started. */
export interface ScriptPoint {
  phase: PhaseName
  afterMs: number
}

/** The failure the demo panel's error kind selects, as ui/flows.md section 5 names them. */
export type DemoErrorKind = 'requests' | 'unreachable' | 'restarted' | 'network'

/** A scripted failure: of the panel's kind, unless the scenario fixes its own. */
export interface ScriptFault extends ScriptPoint {
  kind?: DemoErrorKind
  /** For kind `requests`: only this many upload requests fail, rather than every request. */
  uploads?: number
}

export interface DemoScenario {
  link: DemoLinkName
  /** Whether the run starts once the scenario is chosen; otherwise the screen waits for Start. */
  start: boolean
  /** URL parameters the page applies, as a query string without its `?`. */
  query?: string
  /** A user stop. */
  stop?: ScriptPoint
  /** A failure, of the kind the demo panel selects unless it names its own. */
  fault?: ScriptFault
  /** The point where the run is held, so that its screen stays in that state. */
  hold?: ScriptPoint
  /** The server does not answer at all. */
  offline?: boolean
  /** A reverse proxy that refuses the WebSocket upgrade. */
  webSocket?: false
  /**
   * A reverse proxy that drops the open WebSocket and from then on refuses a new one, or leaves it
   * unanswered.
   */
  webSocketCloses?: ScriptPoint & { reopen?: 'refused' | 'unanswered' }
  /** The server's base path, which the page's own path does not match. */
  basePath?: string
  /**
   * How many times faster than the panel's speed the scenario plays, so a Continuous state the kit
   * shows after tens of minutes is reached in about a minute (frontend.md section 9).
   */
  fastForward?: number
  /** The Continuous direction the page's URL parameters ask for: preset=continuous&test=<direction>. */
  continuous?: Direction
  /** Instants at which one upload request fails, which over HTTP/2 leaves its time unknown, a gap. */
  gaps?: readonly ScriptPoint[]
}

const at = (phase: PhaseName, afterMs: number): ScriptPoint => ({ phase, afterMs })

/** The kit's Continuous elapsed time, 42:18, half a second in so the screen reads it whole. */
const CONTINUOUS_AT_MS = 2_538_500

export const DEMO_SCENARIOS = {
  idle: { link: 'lan', start: false },
  countdown: { link: 'lan', start: false, query: 'run=1' },
  'param-ignored': { link: 'lan', start: false, query: 'streams=12' },
  connecting: { link: 'lan', start: true, hold: at('info', 0) },
  // Pings go out every 100 ms, so the instants of the kit's latency states fall between two: the
  // kit's ping 14 of 20 at 1.4 s, and 12 of 20 at its early error at 1.2 s.
  latency: { link: 'lan', start: true, hold: at('idle', 1350) },
  download: { link: 'lan', start: true, hold: at('download', 7500) },
  // The proxy that refuses the WebSocket speaks HTTP/1.1, so the HTTP latency fallback runs
  // reserved, on five streams (measurement.md section 11.2).
  'ws-fallback': { link: 'lan-http1', start: true, webSocket: false, hold: at('download', 7500) },
  upload: { link: 'lan', start: true, hold: at('upload', 12_000) },
  complete: { link: 'lan', start: true },
  error: { link: 'lan', start: true, fault: at('download', 6400) },
  // The kit's early error is the server going away during idle latency, whatever the panel says.
  'error-early': { link: 'lan', start: true, fault: { ...at('idle', 1150), kind: 'unreachable' } },
  // Over HTTP/1.1 the first failed upload request ends the upload, not the run: the result is
  // complete, with the upload's window up to the failure (measurement.md section 7.5). The kit fails
  // at 8.2 s, before its own 9.5 s warm-up ends; the demo fails at 12 s, after a window of at least
  // 3 s, so that upload keeps a value as the kit's does.
  'upload-interrupted': { link: 'lan-http1', start: true, fault: { ...at('upload', 12_000), kind: 'requests' } },
  // The kit's Result detail (ResultDetail.jsx): a complete LAN run whose upload lost one request
  // 10.4 s in and, over HTTP/2, carried on, with that request's time left out as unknown.
  'upload-gap': { link: 'lan', start: true, fault: { ...at('upload', 10_400), kind: 'requests', uploads: 1 } },
  cancelled: { link: 'lan', start: true, stop: at('upload', 3100) },
  'cancelled-late': { link: 'lan', start: true, stop: at('upload', 14_000) },
  // The kit's stop after 12 of 20 pings at 1.2 s, between two pings as for the latency state.
  'cancelled-latency': { link: 'lan', start: true, stop: at('idle', 1150) },
  'cancelled-download': { link: 'lan', start: true, stop: at('download', 5200) },
  // The kit stops at 8 s with a 3.5 s steady window; on the demo's VPN warm-up ends later, so it
  // stops at 8.8 s for the same window and a partial download.
  'cancelled-slow': { link: 'vpn', start: true, stop: at('download', 8800) },
  'cancelled-slow-up': { link: 'vpn', start: true, stop: at('upload', 8000) },
  slow: { link: 'vpn', start: true, hold: at('upload', 12_100) },
  slowdone: { link: 'vpn', start: true },
  offline: { link: 'lan', start: false, offline: true },
  basepath: { link: 'lan', start: false, basePath: '/speed' },
  insufficient: { link: 'insufficient', start: true, hold: at('upload', 11_250) },
  // The kit's loaded-latency cases. The WebSocket closes during download and cannot be reopened:
  // idle latency stays on it, loaded latency carries on over the HTTP/2 probe.
  'ws-close': { link: 'lan', start: true, webSocketCloses: at('download', 3000) },
  // Over HTTP/1.1 a close during upload leaves it two sources (measurement.md section 11.4).
  'll-reservation-broken': { link: 'lan-http1', start: true, webSocketCloses: at('upload', 3000) },
  // A close a second before the upload's 15 s minimum leaves the later source a handful of samples.
  'll-insufficient-samples': { link: 'lan', start: true, webSocketCloses: at('upload', 14_000) },
  // A complete result has a steady window in each direction and no direction as short as the close
  // sequence, so these two end stopped: the kit's 3.1 s stop, before the upload's window; and a stop
  // while the close sequence, whose reopening is never answered, covers the whole upload (the LAN
  // download ends at its 10 s minimum).
  'll-no-steady-window': { link: 'lan', start: true, stop: at('upload', 3100) },
  'll-no-probe-path': { link: 'lan', start: true, webSocketCloses: { ...at('download', 9700), reopen: 'unanswered' }, stop: at('upload', 800) },
  // The kit's Continuous states (TestScreen.jsx) on its 921 Mbit/s LAN: a download and an upload
  // running at 42:18, the upload with the two gaps of two failed requests over HTTP/2; a download
  // stopped 6.2 s in, during its warm-up; and a download stopped by the page at 42:18. The long
  // ones play 60 times faster, so 42:18 comes in about 42 s.
  continuous: { link: 'lan-921', start: true, fastForward: 60, continuous: 'download', hold: at('download', CONTINUOUS_AT_MS) },
  'cont-upload': { link: 'lan-921', start: true, fastForward: 60, continuous: 'upload', gaps: [at('upload', 1_210_000), at('upload', 2_100_000)], hold: at('upload', CONTINUOUS_AT_MS) },
  'cont-warmup': { link: 'lan-921', start: true, continuous: 'download', stop: at('download', 6200) },
  'cont-done': { link: 'lan-921', start: true, fastForward: 60, continuous: 'download', stop: at('download', CONTINUOUS_AT_MS) },
} as const satisfies Record<string, DemoScenario>

export type DemoScenarioName = keyof typeof DEMO_SCENARIOS

/** The scenario a demo build starts with: the LAN, waiting for Start. */
export const DEFAULT_SCENARIO: DemoScenarioName = 'idle'

export function isScenarioName(name: string): name is DemoScenarioName {
  return Object.hasOwn(DEMO_SCENARIOS, name)
}

/**
 * What the demo Worker sends the page when its script stops the run: press Stop, as the user would,
 * so the page's own stop path sends the engine's `stop`.
 */
export interface DemoPressStop {
  type: 'demo-press-stop'
}

/** What the demo panel sends the demo Worker besides the engine's own commands: the next scenario. */
export interface DemoCommand {
  type: 'demo'
  scenario: DemoScenarioName
  /** How many demo milliseconds pass per real one. */
  speed: number
  /** Report the Worker as busy 95 % of the time. */
  cpuBound: boolean
  /** A coarser timer, in milliseconds; null keeps the browser's. */
  timerResolutionMs: number | null
  errorKind: DemoErrorKind
  /** Whether the scenario's hold applies; without it the run plays on past its state. */
  hold: boolean
  /** Each direction's confidence on the run's result (demo/confidence.ts); absent leaves the engine's. */
  confidence?: Record<Direction, DemoConfidence>
  /** The path B case the link plays (demo/responsiveness.ts); absent, `ok`. */
  responsiveness?: DemoResponsiveness
  /** The compatibility layers the scenario's GET /info reports on; absent, all of them. */
  compat?: Info['compat']
  /**
   * The page's wall clock when it sent the command, which the Worker's runs are dated from, so a
   * page whose clock is fixed dates them from it; the Worker's own first command has none.
   */
  wallClockMs?: number
}
