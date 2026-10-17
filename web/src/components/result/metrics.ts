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
import type { Direction, Result } from '@/engine/messages'

// The Result detail's metric tiles (ui/screens.md sections 2 and 6): download and upload with their
// qualifiers, idle latency and jitter, worded as the Test screen words a finished run's tiles. A
// direction the run did not include reads "skipped".

export function metricTiles(result: Result, units: 'bits' | 'bytes', wording: Wording): TileView[] {
  const direction = (name: Direction): TileView => {
    const part = result[name] ?? null
    const tile = directionTile({ direction: name, units, result: part, overheadPercent: result.settings.overheadCompensationPercent }, wording)
    return part === null && !result.settings.phases.includes(name) ? { ...tile, lines: [{ text: wording.t('test.tiles.skipped') }] } : tile
  }
  const idle = result.idle
  // A stop during idle latency kept its samples; the pings sent are one more than they, the first being the warm-up ping.
  const input: IdleInput | null =
    idle === undefined
      ? null
      : { idle, resolutionMs: result.client.timerResolutionMs, protocol: result.client.protocol, live: false, stopped: idleStopped(result) ? { samples: idle.samples.length, pings: idle.samples.length + 1 } : null }
  return [direction('download'), direction('upload'), idleTile(input, wording), jitterTile(input, wording)]
}
