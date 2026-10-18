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
import { formatBytes, formatDuration, formatPercent, rateParts } from '@/lib/format'
import { protocolLabel } from '@/lib/protocol'

// The Result detail's test parameters (ui/screens.md section 2, kit ResultDetail.jsx): the preset,
// the phases in their order, the stream mode with each direction's count and plateau reason on one
// row, each direction's duration with its configured bounds, the data cap with the data used, the
// units the page shows, the warm-up mode with where it ended, the ping count, overhead compensation
// and protocol, then the server, the browser, the client IP, the timer resolution and whether the
// page was cross-origin isolated.

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

function directions(result: Result): Direction[] {
  return result.settings.phases.filter((phase): phase is Direction => phase !== 'idle' && result[phase] !== undefined)
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

/** A direction's duration with its configured bounds in seconds, when the result records them (v0.2). */
function duration(result: Result, direction: Direction, { t, locale }: Wording): string | null {
  const series = result[direction]?.series
  if (series === undefined) {
    return null
  }
  const value = formatDuration(series.endMs, locale)
  const bounds = result.settings[direction]
  if (bounds === undefined) {
    return t('result.parameters.durationOnly', { duration: value })
  }
  const seconds = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  return t('result.parameters.duration', { duration: value, min: seconds.format(bounds.minMs / 1000), max: seconds.format(bounds.maxMs / 1000) })
}

function warmup(result: Result, wording: Wording): string {
  const { t, locale } = wording
  const mode = result.settings.warmup === 'auto' ? t('result.parameters.warmupAuto') : t('result.parameters.warmupFixed', { s: formatDuration(result.settings.warmup, locale) })
  const ends = directions(result).flatMap((direction) => {
    const series = result[direction]?.series
    return series === undefined ? [] : [t('result.parameters.warmupEnd', { at: formatDuration(series.warmupEndMs, locale), direction: directionName(direction, wording).toLocaleLowerCase(locale) })]
  })
  return ends.length === 0 ? mode : t('result.parameters.warmupEnded', { mode, ends: new Intl.ListFormat(locale, { type: 'unit', style: 'short' }).format(ends) })
}

export function parameterGroups(result: Result, units: 'bits' | 'bytes', wording: Wording): ParameterGroup[] {
  const { t, locale } = wording
  const { settings, client, server } = result
  const phases = settings.phases.map((phase) => (phase === 'idle' ? t('result.parameters.idle') : directionName(phase, wording)))
  const durations = directions(result).flatMap((direction) => {
    const value = duration(result, direction, wording)
    return value === null ? [] : [row(`duration-${direction}`, directionName(direction, wording), value)]
  })
  const cap = settings.dataCapBytes === null ? t('result.parameters.capOff') : formatBytes(settings.dataCapBytes, locale)
  const unit = rateParts(1e6, units, locale).unit
  const protocol = protocolLabel(client.protocol) ?? t('result.parameters.unknown')
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
        row('overhead', t('result.parameters.overhead'), settings.overheadCompensationPercent > 0 ? `+${formatPercent(settings.overheadCompensationPercent, locale)}` : t('result.parameters.overheadNone')),
        row('protocol', t('result.parameters.protocol'), protocol),
      ],
    },
    {
      key: 'environment',
      title: t('result.parameters.environment'),
      rows: [
        row('server', t('result.parameters.server'), t('result.parameters.serverValue', { name: server.name, version: server.version })),
        row('browser', t('result.parameters.browser'), t('result.parameters.browserValue', { name: client.browser.name, major: client.browser.major, os: client.browser.os })),
        row('ip', t('result.parameters.clientIp'), client.ip),
        row('timer', t('result.parameters.timer'), t('result.parameters.timerValue', { ms: new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(client.timerResolutionMs) })),
        row('isolated', t('result.parameters.isolated'), isolated),
      ],
    },
  ]
}
