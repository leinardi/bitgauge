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

import type { DurationBounds, NoBounds, TestSettings } from '@/engine/messages'
import { DEFAULT_AUTO_START, MB, same, type StoredSettings, storedOver, streamsShown } from '@/lib/settingsStorage'
import { SECOND, type Test, testPhases } from '@/lib/urlValues'

// The Settings screen's shareable URL (ui/url-params.md section 3): the parameters whose value
// differs from what the link's server would apply, in the table order of section 2, `run=1` when
// asked, `lang` and `theme` only when stored, `label` when set, each value percent-encoded. Under
// Continuous, `test=upload` carries its direction and `duration` its run length. What no parameter
// can carry is named instead, for the "Not in the link" line.

/** A changed setting the link cannot carry, in the order the Settings screen shows them. */
export type NotInLink = 'phases' | 'durations' | 'countdown' | 'warmup' | 'pingCount' | 'overhead'

export interface SettingsLink {
  url: string
  notInLink: NotInLink[]
}

const TESTS: readonly Test[] = ['all', 'download', 'upload', 'latency']

/** The bounds with the `duration` parameter: the maximum is it, the minimum at most it. */
function capped(bounds: DurationBounds | NoBounds, durationMs: number): DurationBounds | NoBounds {
  return bounds.minMs === null ? bounds : { minMs: Math.min(bounds.minMs, durationMs), maxMs: durationMs }
}

/** A data cap as the `cap` parameter writes it: `none`, whole megabytes, or bytes. */
function capValue(bytes: number | null): string {
  if (bytes === null) {
    return 'none'
  }
  return bytes % MB === 0 ? `${bytes / MB}MB` : String(bytes)
}

/**
 * The link to `base` (the page's origin and base path) that opens BitGauge with `current`, the
 * settings stored over `defaults`; `stored` gives the language, theme, label and countdown.
 */
export function buildSettingsUrl(base: string, current: TestSettings & { label?: string }, defaults: TestSettings, stored: StoredSettings, run: boolean): SettingsLink {
  const parameters: [string, string][] = []
  const notInLink: NotInLink[] = []
  // What the link's server applies once the link's preset is resolved.
  const linked = storedOver(defaults, { preset: current.preset })

  const continuous = current.preset === 'continuous'

  if (run) {
    parameters.push(['run', '1'])
  }
  if (continuous) {
    // `test` picks the direction, download unless it says upload. Of the phases only idle latency
    // applies, which no parameter leaves out or adds.
    if (current.continuousDirection === 'upload') {
      parameters.push(['test', 'upload'])
    }
    if (current.phases.includes('idle') !== defaults.phases.includes('idle')) {
      notInLink.push('phases')
    }
  } else if (!same(current.phases, defaults.phases)) {
    const test = TESTS.find((value) => same(testPhases(value, defaults.phases), current.phases))
    if (test === undefined) {
      notInLink.push('phases')
    } else {
      parameters.push(['test', test])
    }
  }
  if (current.preset !== defaults.preset) {
    parameters.push(['preset', current.preset])
  }
  if (continuous) {
    if (current.runLengthMs !== undefined) {
      parameters.push(['duration', String(current.runLengthMs / SECOND)])
    }
  } else if (!same(current.download, linked.download) || !same(current.upload, linked.upload)) {
    const durationMs = current.download.maxMs
    if (durationMs !== null && same(capped(linked.download, durationMs), current.download) && same(capped(linked.upload, durationMs), current.upload)) {
      parameters.push(['duration', String(durationMs / SECOND)])
    } else {
      notInLink.push('durations')
    }
  }
  const streams = streamsShown(current.streams)
  if (!same(streams, streamsShown(linked.streams))) {
    parameters.push(['streams', streams.fixed === undefined ? streams.mode : String(streams.fixed)])
  }
  if (current.dataCapBytes !== defaults.dataCapBytes) {
    parameters.push(['cap', capValue(current.dataCapBytes)])
  }
  if (current.units !== defaults.units) {
    parameters.push(['units', current.units])
  }
  if (stored.lang !== undefined) {
    parameters.push(['lang', stored.lang])
  }
  if (stored.theme !== undefined && stored.theme !== 'system') {
    parameters.push(['theme', stored.theme])
  }
  const label = current.label ?? stored.label ?? ''
  if (label !== '') {
    parameters.push(['label', label])
  }

  if ((stored.autoStart?.countdownS ?? DEFAULT_AUTO_START.countdownS) !== DEFAULT_AUTO_START.countdownS) {
    notInLink.push('countdown')
  }
  if (current.warmup !== linked.warmup) {
    notInLink.push('warmup')
  }
  if (current.pingCount !== linked.pingCount) {
    notInLink.push('pingCount')
  }
  if (current.overheadCompensationPercent !== linked.overheadCompensationPercent) {
    notInLink.push('overhead')
  }

  const query = parameters.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&')
  return { url: query === '' ? base : `${base}?${query}`, notInLink }
}
