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

import { idleStopped } from '@/components/test/screen/states'
import { directionTile, type IdleInput, idleTile, jitterTile, type TileView } from '@/components/test/tiles'
import type { Wording } from '@/components/test/wording'
import type { Direction, DirectionResult, Result } from '@/engine/messages'
import { continuousDirection } from '@/lib/continuous'
import { rateParts } from '@/lib/format'

// The Result detail's metric tiles (ui/screens.md sections 2 and 6): download and upload with their
// qualifiers, idle latency and jitter, worded as the Test screen words a finished run's tiles. A
// direction the run did not include reads "skipped". A Continuous result's direction shows its
// run-wide average with the run-wide minimum and maximum and its peak, the p90 of the last hour;
// the other direction did not run, Continuous running one (measurement.md section 15).

/** The run-wide minimum and maximum and the last hour's p90 of a measured Continuous direction, as one line. */
function continuousLine(part: DirectionResult, units: 'bits' | 'bytes', unit: string, { t, locale }: Wording): string {
  const rate = (bitsPerSecond: number | undefined) => {
    if (bitsPerSecond === undefined) {
      return '—'
    }
    const parts = rateParts(bitsPerSecond, units, locale)
    return parts.unit === unit ? parts.number : `${parts.number} ${parts.unit}`
  }
  const parts = [
    t('result.metrics.runWide', { min: rate(part.minBitsPerSecond), max: rate(part.maxBitsPerSecond) }),
    t('result.metrics.lastHour', { peak: rate(part.peakBitsPerSecond) }),
    t('test.tiles.streams', { n: part.streams }, part.streams),
    ...(part.plateau === undefined ? [] : [t('test.tiles.plateau', { reason: part.plateau })]),
  ]
  return parts.join(' · ')
}

export function metricTiles(result: Result, units: 'bits' | 'bytes', wording: Wording): TileView[] {
  const { t } = wording
  const ran = continuousDirection(result.settings)
  const direction = (name: Direction): TileView => {
    const part = result[name] ?? null
    if (ran !== null && name !== ran) {
      return { ...directionTile({ direction: name, units, result: null }, wording), lines: [{ text: t('result.metrics.notRun') }] }
    }
    const tile = directionTile({ direction: name, units, result: part, overheadPercent: result.settings.overheadCompensationPercent, continuous: ran !== null }, wording)
    if (ran !== null && part?.status === 'measured' && part.bitsPerSecond !== undefined) {
      const label = name === 'download' ? t('result.metrics.downloadAverage') : t('result.metrics.uploadAverage')
      // The first line of a measured direction names its peak and streams: here, with the run-wide numbers.
      return { ...tile, label, lines: [{ text: continuousLine(part, units, tile.unit, wording) }, ...tile.lines.slice(1)] }
    }
    return part === null && !result.settings.phases.includes(name) ? { ...tile, lines: [{ text: t('test.tiles.skipped') }] } : tile
  }
  const idle = result.idle
  // A stop during idle latency kept its samples; the pings sent are one more than they, the first being the warm-up ping.
  const input: IdleInput | null =
    idle === undefined
      ? null
      : { idle, resolutionMs: result.client.timerResolutionMs, protocol: result.client.protocol, live: false, stopped: idleStopped(result) ? { samples: idle.samples.length, pings: idle.samples.length + 1 } : null }
  return [direction('download'), direction('upload'), idleTile(input, wording), jitterTile(input, wording)]
}
