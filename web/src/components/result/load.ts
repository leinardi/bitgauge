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

import { gradeWord } from '@/components/history/rows'
import type { Wording } from '@/components/test/wording'
import type { Bufferbloat, Direction, LoadedLatency, LoadedLatencyReason, LoadedSource, Result } from '@/engine/messages'
import { latencyNumber } from '@/lib/format'

// The load card's contents (ui/screens.md section 6, design_system/components/measurement
// LoadCard.jsx): the bufferbloat grade in letter and words with its basis, and the loaded latency
// of each direction that ran with a latency path, labeled with its source: the median with its p90
// and the increase over idle, "vs idle over" the idle path when idle latency ran on the other one,
// "no idle latency" without an idle median, or no number with the reason it has none.

export interface LoadRow {
  direction: Direction
  label: string
  sub: string
  /** The median in ms, or null for "—". */
  value: string | null
  /** A live reading of the Test screen, not yet the result's. */
  live?: boolean
}

export interface GradeView {
  grade: Bufferbloat['grade'] | null
  words: string
  basis: string
  /** No grade yet because the run has still to reach it. */
  pending?: boolean
}

export function sourceName(source: LoadedSource, t: Wording['t']): string {
  switch (source) {
    case 'websocket':
      return t('result.load.sources.websocket')
    case 'http-h1-reserved':
      return t('result.load.sources.httpH1Reserved')
    case 'http-h2':
      return t('result.load.sources.httpH2')
    case 'http-h3':
      return t('result.load.sources.httpH3')
  }
}

function reasonText(reason: LoadedLatencyReason, t: Wording['t']): string {
  switch (reason) {
    case 'no-steady-window':
      return t('result.load.reasons.noSteadyWindow')
    case 'insufficient-samples':
      return t('result.load.reasons.insufficientSamples')
    case 'reservation-broken':
      return t('result.load.reasons.reservationBroken')
    case 'no-probe-path':
      return t('result.load.reasons.noProbePath')
  }
}

/** A direction's row from its loaded latency in the result. */
export function loadRow(direction: Direction, loaded: LoadedLatency, resolutionMs: number, { t, locale }: Wording): LoadRow {
  const during = direction === 'download' ? t('result.load.during.download') : t('result.load.during.upload')
  const label = loaded.source === undefined ? during : t('result.load.row', { direction: during, source: sourceName(loaded.source, t) })
  if ('status' in loaded) {
    return { direction, label, sub: reasonText(loaded.reason, t), value: null }
  }
  const ms = (value: number) => latencyNumber(value, locale, resolutionMs)
  const p90 = ms(loaded.p90Ms)
  let sub = t('result.load.noIdle', { p90 })
  if (loaded.increaseMs !== undefined) {
    const increase = ms(loaded.increaseMs)
    sub =
      loaded.idleSource === undefined
        ? t('result.load.increase', { p90, increase })
        : t('result.load.increaseOver', { p90, increase, path: loaded.idleSource === 'websocket' ? t('result.load.paths.websocket') : t('result.load.paths.http') })
  }
  return { direction, label, sub, value: ms(loaded.medianMs) }
}

/** A row per direction that measured loaded latency or says why it has none, in the run's order. */
export function loadRows(result: Result, wording: Wording): LoadRow[] {
  const order = result.settings.phases.filter((phase): phase is Direction => phase !== 'idle')
  return order.flatMap((direction) => {
    const loaded = result[direction]?.loadedLatency
    return loaded === undefined ? [] : [loadRow(direction, loaded, result.client.timerResolutionMs, wording)]
  })
}

const increaseOf = (result: Result, direction: Direction) => {
  const loaded = result[direction]?.loadedLatency
  return loaded === undefined || 'status' in loaded ? undefined : loaded.increaseMs
}

/**
 * The grade, its words and its basis; without a grade, what it needs. `brief`, as the Test screen
 * shows it, names the basis without its increases, as the kit's Test screen does.
 */
export function gradeView(result: Result, { t, locale }: Wording, brief = false): GradeView {
  const bufferbloat = result.bufferbloat
  if (bufferbloat === undefined) {
    return { grade: null, words: t('result.load.notGraded'), basis: t('result.load.noBasis') }
  }
  const ms = (value: number) => latencyNumber(value, locale, result.client.timerResolutionMs)
  const increase = ms(bufferbloat.increaseMs)
  const words = t('result.load.words', { word: gradeWord(bufferbloat.grade, t) })
  if (brief) {
    const basis = { download: t('result.load.basisDownloadBrief'), upload: t('result.load.basisUploadBrief'), 'download+upload': t('result.load.basisBothBrief') }[bufferbloat.basis]
    return { grade: bufferbloat.grade, words, basis }
  }
  // A one-direction basis says why the other direction is not in it, as the kit's Result detail does.
  const without = (basis: string, other: Direction) => {
    const loaded = result[other]?.loadedLatency
    if (loaded === undefined || !('status' in loaded)) {
      return basis
    }
    return t('result.load.basisWithout', { basis, direction: other === 'download' ? t('result.load.download') : t('result.load.upload'), reason: reasonText(loaded.reason, t) })
  }
  switch (bufferbloat.basis) {
    case 'download':
      return { grade: bufferbloat.grade, words, basis: without(t('result.load.basisDownload', { increase }), 'upload') }
    case 'upload':
      return { grade: bufferbloat.grade, words, basis: without(t('result.load.basisUpload', { increase }), 'download') }
    case 'download+upload': {
      const download = increaseOf(result, 'download')
      const upload = increaseOf(result, 'upload')
      const worse = (upload ?? 0) >= (download ?? 0) ? 'upload' : 'download'
      const other = worse === 'upload' ? download : upload
      const name = (direction: Direction) => (direction === 'download' ? t('result.load.download') : t('result.load.upload'))
      return other === undefined
        ? { grade: bufferbloat.grade, words, basis: t('result.load.basisBoth', { worse: name(worse), increase }) }
        : { grade: bufferbloat.grade, words, basis: t('result.load.basisBothOther', { worse: name(worse), increase, other: name(worse === 'upload' ? 'download' : 'upload'), otherIncrease: ms(other) }) }
    }
  }
}
