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

import { presetName } from '@/components/settings/changes'
import type { Wording } from '@/components/test/wording'
import type { Direction, Result } from '@/engine/messages'
import { runPhases } from '@/lib/continuous'
import { formatBytes, formatDuration, formatPercent, formatSpan, rateParts } from '@/lib/format'
import { protocolLabel } from '@/lib/protocol'

// The Result detail's test parameters (ui/screens.md section 2, kit ResultDetail.jsx): the preset,
// the phases in their order, the stream mode with each direction's count and plateau reason on one
// row, each direction's duration with its configured bounds, the data cap with the data used, the
// units the page shows, the warm-up mode with where it ended, the ping count, overhead compensation
// and protocol, then the server, the browser, the client IP, the timer resolution and whether the
// page was cross-origin isolated. A Continuous run lists its one direction and its run length.

/** An overhead compensation as the parameters word it: "+5.0 %", or none. */
export function overheadText(percent: number, { t, locale }: Wording): string {
  return percent > 0 ? `+${formatPercent(percent, locale)}` : t('result.parameters.overheadNone')
}

export interface ParameterRow {
  key: string
  label: string
  value: string
}

export interface ParameterGroup {
  key: 'test' | 'limits' | 'measurement' | 'environment'
  title: string
  rows: ParameterRow[]
}

const row = (key: string, label: string, value: string): ParameterRow => ({ key, label, value })

const DASH = '—'

/** The browser's family, major version and operating system, or a dash for an unrecognized family (ui/screens.md section 6). */
export function browserText(browser: Result['client']['browser'], { t }: Pick<Wording, 't'>): string {
  return browser.name === 'unknown' ? DASH : t('result.parameters.browserValue', { name: browser.name, major: browser.major, os: browser.os })
}

/** The directions the run reached: a Continuous run's one, and none the run ended before. */
export function directions(result: Result): Direction[] {
  return runPhases(result.settings).filter((phase): phase is Direction => phase !== 'idle' && result[phase] !== undefined && result[phase].status !== 'skipped')
}

function directionName(direction: Direction, { t }: Wording): string {
  return direction === 'download' ? t('result.parameters.download') : t('result.parameters.upload')
}

/** One row for the streams, as the kit has it: the mode, then the count and plateau reason, per direction where they differ. */
function streams(result: Result, wording: Wording): string {
  const { t, locale } = wording
  const { mode } = result.settings.streams
  const name = mode === 'auto' ? t('result.parameters.streamsAuto') : mode === 'fixed' ? t('result.parameters.streamsFixed') : t('result.parameters.streamsSingle')
  const parts = directions(result).map((direction) => {
    const n = result[direction]?.streams ?? 0
    const plateau = result[direction]?.plateau
    return { direction, count: plateau === undefined ? String(n) : t('result.parameters.streamCount', { n, plateau }) }
  })
  const [first] = parts
  if (first === undefined) {
    return name
  }
  if (parts.every((part) => part.count === first.count)) {
    return t('result.parameters.streamsValue', { mode: name, streams: first.count })
  }
  const each = parts.map((part) => t('result.parameters.streamsDirection', { direction: directionName(part.direction, wording).toLocaleLowerCase(locale), streams: part.count }))
  return t('result.parameters.streamsValue', { mode: name, streams: each.join(t('result.parameters.streamsJoin')) })
}

/** When the user stopped the direction, on its phase timeline; undefined when it was not stopped. */
function stoppedAt(result: Result, direction: Direction): number | undefined {
  const stop = result[direction]?.events.find((event) => event.code === 'cancelled')
  return stop?.code === 'cancelled' ? stop.atMs : undefined
}

/**
 * A direction's duration with its configured bounds in seconds, when the result records them: the
 * stop, the instant the Test screen named, when the user stopped it; else its series' end; without
 * a series (no steady window), the instant its error or the data cap ended it, or its maximum when
 * it ran to it insufficient (ui/screens.md section 2).
 */
function duration(result: Result, direction: Direction, { t, locale }: Wording): string | null {
  const stopped = stoppedAt(result, direction)
  const bounds = result.settings[direction]
  const outcome = result[direction]
  const ended = outcome?.events.flatMap((event) => (event.code === 'error' || event.code === 'data-cap' ? [event.atMs] : [])).at(0)
  const ranToMax = outcome?.status === 'insufficient-data' && bounds !== undefined && bounds.maxMs !== null ? bounds.maxMs : undefined
  const endMs = stopped ?? outcome?.series?.endMs ?? ended ?? ranToMax
  if (endMs === undefined) {
    return null
  }
  const value = formatDuration(endMs, locale)
  // A Continuous result's bounds are null: it has a duration and no bounds.
  if (bounds === undefined || bounds.minMs === null) {
    return stopped === undefined ? t('result.parameters.durationOnly', { duration: value }) : t('result.parameters.durationOnlyStopped', { duration: value })
  }
  const seconds = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const limits = { duration: value, min: seconds.format(bounds.minMs / 1000), max: seconds.format(bounds.maxMs / 1000) }
  return stopped === undefined ? t('result.parameters.duration', limits) : t('result.parameters.durationStopped', limits)
}

/** A Continuous run's length, or none, then how long its direction ran when that differs. */
function runLength(result: Result, wording: Wording): string {
  const { t, locale } = wording
  const ran = directions(result).map((direction) => result[direction]?.series?.endMs).find((ms) => ms !== undefined)
  const length = result.settings.runLengthMs
  if (length === undefined) {
    return ran === undefined ? t('result.parameters.runLengthNone') : t('result.parameters.runLengthNoneRan', { ran: formatSpan(ran, locale) })
  }
  const value = formatSpan(length, locale)
  // A run that reached its run length ran it; one stopped or ended sooner says how long it ran.
  return ran === undefined || ran >= length ? value : t('result.parameters.runLengthRan', { length: value, ran: formatSpan(ran, locale) })
}

function warmup(result: Result, wording: Wording): string {
  const { t, locale } = wording
  const mode = result.settings.warmup === 'auto' ? t('result.parameters.warmupAuto') : t('result.parameters.warmupFixed', { s: formatDuration(result.settings.warmup, locale) })
  const name = (direction: Direction): string => directionName(direction, wording).toLocaleLowerCase(locale)
  const ends = directions(result).flatMap((direction) => {
    const series = result[direction]?.series
    return series === undefined ? [] : [t('result.parameters.warmupEnd', { at: formatDuration(series.warmupEndMs, locale), direction: name(direction) })]
  })
  // A direction without a series never ended its warm-up; one the user stopped says so.
  const stopped = directions(result).flatMap((direction) => (result[direction]?.series === undefined && stoppedAt(result, direction) !== undefined ? [t('result.parameters.warmupStopped', { direction: name(direction) })] : []))
  const list = (items: string[]): string => new Intl.ListFormat(locale, { type: 'unit', style: 'short' }).format(items)
  if (ends.length === 0) {
    return stopped.length === 0 ? mode : t('result.parameters.warmupStoppedOnly', { mode, stopped: list(stopped) })
  }
  return stopped.length === 0 ? t('result.parameters.warmupEnded', { mode, ends: list(ends) }) : t('result.parameters.warmupEndedStopped', { mode, ends: list(ends), stopped: list(stopped) })
}

export function parameterGroups(result: Result, units: 'bits' | 'bytes', wording: Wording): ParameterGroup[] {
  const { t, locale } = wording
  const { settings, client, server } = result
  const continuous = settings.preset === 'continuous'
  const phases = runPhases(settings).map((phase) => {
    if (phase === 'idle') {
      return t('result.parameters.idle')
    }
    return continuous ? t('result.parameters.continuousPhase', { direction: directionName(phase, wording) }) : directionName(phase, wording)
  })
  // A Continuous run has a run length in place of the durations.
  const durations = continuous
    ? [row('run-length', t('result.parameters.runLength'), runLength(result, wording))]
    : directions(result).flatMap((direction) => {
        const value = duration(result, direction, wording)
        return value === null ? [] : [row(`duration-${direction}`, directionName(direction, wording), value)]
      })
  const cap = settings.dataCapBytes === null ? t('result.parameters.capOff') : formatBytes(settings.dataCapBytes, locale)
  const unit = rateParts(1e6, units, locale).unit
  const protocol = protocolLabel(client.protocol) ?? t('result.parameters.protocolNotReported')
  const isolated = client.crossOriginIsolated ? t('result.parameters.yes') : t('result.parameters.no')
  return [
    {
      key: 'test',
      title: t('result.parameters.test'),
      rows: [row('preset', t('result.parameters.preset'), presetName(settings.preset, t)), row('phases', t('result.parameters.phases'), phases.join(t('result.parameters.then'))), row('streams', t('result.parameters.streams'), streams(result, wording))],
    },
    {
      key: 'limits',
      title: t('result.parameters.limits'),
      rows: [
        ...durations,
        row('cap', t('result.parameters.dataCap'), t('result.parameters.dataCapValue', { cap, used: formatBytes(result.dataUsedBytes, locale) })),
      ],
    },
    {
      key: 'measurement',
      title: t('result.parameters.measurement'),
      rows: [
        row('units', t('result.parameters.units'), units === 'bits' ? t('result.parameters.bits', { unit }) : t('result.parameters.bytes', { unit })),
        row('warmup', t('result.parameters.warmup'), warmup(result, wording)),
        row('pings', t('result.parameters.pingCount'), String(settings.pingCount)),
        row('overhead', t('result.parameters.overhead'), overheadText(settings.overheadCompensationPercent, wording)),
        row('protocol', t('result.parameters.protocol'), protocol),
      ],
    },
    {
      key: 'environment',
      title: t('result.parameters.environment'),
      rows: [
        row('server', t('result.parameters.server'), t('result.parameters.serverValue', { name: server.name, version: server.version })),
        row('browser', t('result.parameters.browser'), browserText(client.browser, wording)),
        row('ip', t('result.parameters.clientIp'), client.ip),
        row('timer', t('result.parameters.timer'), t('result.parameters.timerValue', { ms: new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(client.timerResolutionMs) })),
        row('isolated', t('result.parameters.isolated'), isolated),
      ],
    },
  ]
}
