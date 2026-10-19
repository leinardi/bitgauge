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

import { type DemoConfidence, isDemoConfidence } from '@/demo/confidence'
import { type DemoHistory, isDemoHistory } from '@/demo/history'
import { DEFAULT_SCENARIO, DEMO_SCENARIOS, type DemoCommand, type DemoErrorKind, type DemoScenarioName, isScenarioName } from '@/demo/scenarios'

// The demo panel's choice (frontend.md section 9): kept in the page's localStorage under
// `bitgauge-demo`, each field checked as it is read back, anything unknown falling back to its
// default; and the demo Worker's command it makes. The panel passes the storage in.

const STORAGE_KEY = 'bitgauge-demo'
export const SPEEDS = [1, 2, 4] as const
export const ERROR_KINDS: readonly DemoErrorKind[] = ['requests', 'unreachable', 'restarted', 'network']
export const RESOLUTIONS = [0.1, 1] as const
export const NAMES = Object.keys(DEMO_SCENARIOS) as DemoScenarioName[]

export interface Choice {
  open: boolean
  scenario: DemoScenarioName
  speed: (typeof SPEEDS)[number]
  /** A state to hold, or '' to follow the run. */
  forceState: DemoScenarioName | ''
  cpuBound: boolean
  errorKind: DemoErrorKind
  timerResolutionMs: (typeof RESOLUTIONS)[number]
  /** The History variant the page's history starts from, or '' for the browser's own. */
  history: DemoHistory
  /** Each direction's confidence on the run's result; 'normal' leaves the engine's. */
  downloadConfidence: DemoConfidence
  uploadConfidence: DemoConfidence
}

export const DEFAULTS: Choice = { open: false, scenario: DEFAULT_SCENARIO, speed: 1, forceState: '', cpuBound: false, errorKind: 'requests', timerResolutionMs: 0.1, history: '', downloadConfidence: 'normal', uploadConfidence: 'normal' }

type ChoiceStorage = Pick<Storage, 'getItem' | 'setItem'>

/** The stored choice, each field checked; anything unknown falls back to its default. */
export function restore(storage: ChoiceStorage): Choice {
  let stored: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')
    stored = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    // Unreadable storage: the defaults.
  }
  const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback)
  return {
    open: stored.open === true,
    scenario: typeof stored.scenario === 'string' && isScenarioName(stored.scenario) ? stored.scenario : DEFAULTS.scenario,
    speed: pick(stored.speed, SPEEDS, DEFAULTS.speed),
    forceState: typeof stored.forceState === 'string' && isScenarioName(stored.forceState) ? stored.forceState : '',
    cpuBound: stored.cpuBound === true,
    errorKind: pick(stored.errorKind, ERROR_KINDS, DEFAULTS.errorKind),
    timerResolutionMs: pick(stored.timerResolutionMs, RESOLUTIONS, DEFAULTS.timerResolutionMs),
    history: isDemoHistory(stored.history) ? stored.history : DEFAULTS.history,
    downloadConfidence: isDemoConfidence(stored.downloadConfidence) ? stored.downloadConfidence : DEFAULTS.downloadConfidence,
    uploadConfidence: isDemoConfidence(stored.uploadConfidence) ? stored.uploadConfidence : DEFAULTS.uploadConfidence,
  }
}

export function save(storage: ChoiceStorage, choice: Choice): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(choice))
  } catch {
    // Storage refused: the choice lasts until the page loads again.
  }
}

/** The demo Worker's command for a choice: a forced state is that state's scenario, held. */
export function commandOf(choice: Choice): DemoCommand {
  return {
    type: 'demo',
    scenario: choice.forceState === '' ? choice.scenario : choice.forceState,
    speed: choice.speed,
    cpuBound: choice.cpuBound,
    timerResolutionMs: choice.timerResolutionMs,
    errorKind: choice.errorKind,
    hold: choice.forceState !== '',
    confidence: { download: choice.downloadConfidence, upload: choice.uploadConfidence },
  }
}
