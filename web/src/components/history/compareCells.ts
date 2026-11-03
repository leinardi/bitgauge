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

import type { useI18n } from 'vue-i18n'

import { gradeWord } from '@/components/history/rows'
import { reasonText, sourceName } from '@/components/result/load'
import { ungradedText } from '@/components/result/ungraded'
import type { Bufferbloat, Direction, IdleResult, Result } from '@/engine/messages'
import { formatLatency, roundedLatency } from '@/lib/format'

// Compare's latency and grade cells with their qualifiers (ui/screens.md sections 3 and 6): idle
// latency with its path, loaded latency with its source, "vs idle over" the idle path when that is
// the other one and, in Continuous, "last hour", the grade with its basis or "Not graded" and its
// one reason. Each cell has a key, what its number is measured with: two sides whose keys differ
// are not comparable, and the warning names them.

type Translate = ReturnType<typeof useI18n>['t']

const DASH = '—'

/** A latency cell: its text, its number as rounded for display, and what it is measured with. */
export interface LatencyCell {
  text: string
  /** The number as the cell shows it, so a change is judged on what the reader sees. */
  value?: number
  /** What the number is measured with, in words, as the warning names it. */
  basis: string
  /** The path or source of the number, and for a loaded latency the idle path its increase is over. */
  source?: string
  idlePath?: IdleResult['path']
}

/**
 * Whether two measured cells differ in how they are measured: in their path or source, or in the
 * idle path a loaded latency is compared with when both have one.
 */
export function measuredApart(x: LatencyCell, y: LatencyCell): boolean {
  return x.source !== y.source || (x.idlePath !== undefined && y.idlePath !== undefined && x.idlePath !== y.idlePath)
}

function qualified(value: string, qualifiers: readonly string[], t: Translate): string {
  return qualifiers.length === 0 ? value : t('history.compare.qualified', { value, qualifiers: qualifiers.join('; ') })
}

function pathName(path: IdleResult['path'], t: Translate): string {
  return path === 'websocket' ? t('result.load.paths.websocket') : t('result.load.paths.http')
}

/** The idle median, or the jitter, both over the idle path. */
export function idleCell(result: Result, of: (idle: IdleResult) => number | undefined, withPath: boolean, locale: string, t: Translate): LatencyCell {
  const { idle } = result
  const ms = idle === undefined ? undefined : of(idle)
  if (idle === undefined || ms === undefined) {
    return { text: DASH, basis: '' }
  }
  const resolution = result.client.timerResolutionMs
  const path = pathName(idle.path, t)
  const text = formatLatency(ms, locale, resolution)
  return { text: withPath ? qualified(text, [path], t) : text, value: roundedLatency(ms, resolution), basis: path, source: idle.path }
}

/** A direction's loaded-latency median with its source, or the reason it has none. */
export function loadedCell(result: Result, direction: Direction, locale: string, t: Translate): LatencyCell {
  const loaded = result[direction]?.loadedLatency
  if (loaded === undefined) {
    return { text: DASH, basis: '' }
  }
  if ('status' in loaded) {
    return { text: qualified(DASH, [reasonText(loaded.reason, t)], t), basis: '' }
  }
  const resolution = result.client.timerResolutionMs
  const source = sourceName(loaded.source, t)
  const idle = loaded.idleSource === undefined ? null : pathName(loaded.idleSource, t)
  const qualifiers = [source, ...(idle === null ? [] : [t('history.compare.vsIdle', { path: idle })]), ...(result.settings.preset === 'continuous' ? [t('history.compare.lastHour')] : [])]
  const basis = idle === null ? source : t('history.compare.sourceIdle', { source, path: idle })
  // The idle path its increase is over: the other one, named, or its own; none without an idle median.
  const idlePath = loaded.idleSource ?? (loaded.increaseMs === undefined ? undefined : loaded.source === 'websocket' ? 'websocket' : 'http')
  const cell = { text: qualified(formatLatency(loaded.medianMs, locale, resolution), qualifiers, t), value: roundedLatency(loaded.medianMs, resolution), basis, source: loaded.source }
  return idlePath === undefined ? cell : { ...cell, idlePath }
}

function basisWord(basis: Bufferbloat['basis'], t: Translate): string {
  switch (basis) {
    case 'download':
      return t('history.compare.basis.download')
    case 'upload':
      return t('history.compare.basis.upload')
    case 'download+upload':
      return t('history.compare.basis.both')
  }
}

/** The grade in letter and words with its basis, or "Not graded" with its one reason. */
export function gradeCell(result: Result, t: Translate): { text: string; grade?: Bufferbloat['grade']; basis: string } {
  const bufferbloat = result.bufferbloat
  if (bufferbloat === undefined) {
    return { text: t('history.table.notGraded', { reason: ungradedText(result, t) }), basis: '' }
  }
  const basis = basisWord(bufferbloat.basis, t)
  return { text: qualified(`${bufferbloat.grade} · ${gradeWord(bufferbloat.grade, t)}`, [basis], t), grade: bufferbloat.grade, basis }
}
