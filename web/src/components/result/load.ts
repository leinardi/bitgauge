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
import type { Bufferbloat, Direction, LoadedLatency, LoadedLatencyReason, LoadedSource, Responsiveness, Result } from '@/engine/messages'
import { continuousDirection } from '@/lib/continuous'
import { formatLatency, latencyNumber, rpmNumber } from '@/lib/format'
import { protocolLabel } from '@/lib/protocol'

// The load card's contents (ui/screens.md section 6, design_system/components/measurement
// LoadCard.jsx): the bufferbloat grade in letter and words with its basis, and the loaded latency
// of each direction that ran with a latency path, labeled with its source: the median with its p90
// and the increase over idle, "vs idle over" the idle path when idle latency ran on the other one,
// "no idle latency" without an idle median, or no number with the reason it has none. Below the
// rows, the HTTP loaded responsiveness under its fixed label with the protocol, an RPM per
// direction or the words in place of one (ui/screens.md section 6).

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

export interface ResponsivenessRow {
  direction: Direction
  /** The whole RPM, or null without one. */
  value: string | null
  uncertain: boolean
  /** The words in place of a number; "—" when absent. */
  text?: string
  /** The Result detail's TM95 and samples. */
  detail?: string
}

export interface ResponsivenessView {
  /** The protocol path B ran over, or "not reported". */
  protocol: string
  note: string
  /** The warn tag of an uncertain direction. */
  tag: string | null
  rows: ResponsivenessRow[]
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

/**
 * A row per direction that measured loaded latency or says why it has none, in the run's order. A
 * Continuous direction's is the last hour's (measurement.md section 15).
 */
export function loadRows(result: Result, wording: Wording): LoadRow[] {
  const order = result.settings.phases.filter((phase): phase is Direction => phase !== 'idle')
  return order.flatMap((direction) => {
    const loaded = result[direction]?.loadedLatency
    if (loaded === undefined) {
      return []
    }
    const row = loadRow(direction, loaded, result.client.timerResolutionMs, wording)
    return [result.settings.preset === 'continuous' && !('status' in loaded) ? { ...row, sub: wording.t('result.load.lastHour', { sub: row.sub }) } : row]
  })
}

const increaseOf = (result: Result, direction: Direction) => {
  const loaded = result[direction]?.loadedLatency
  return loaded === undefined || 'status' in loaded ? undefined : loaded.increaseMs
}

/** Why a result has no grade (ui/screens.md section 6), the same on the Test screen and the Result detail. */
export type UngradedReason = 'no-idle' | 'no-loaded' | 'no-gradable' | 'incomplete'

/**
 * The one reason a result has no grade, from what it holds: no idle latency, or a measured loaded
 * latency without its increase over it; else, when an error ended the run before any direction
 * measured its loaded latency, an incomplete test; else no direction with a loaded latency; else
 * none of them gradable (measurement.md section 11.3, ui/screens.md section 6).
 */
export function ungradedReason(result: Result): UngradedReason {
  if (result.idle?.medianMs === undefined) {
    return 'no-idle'
  }
  const loaded = (['download', 'upload'] as const).flatMap((direction) => result[direction]?.loadedLatency ?? [])
  // An error before any direction measured its loaded latency is an incomplete test: an unavailable
  // block is no measured loaded latency. Without an error, an unavailable one is not gradable.
  if (result.status === 'error' && loaded.every((value) => 'status' in value)) {
    return 'incomplete'
  }
  if (loaded.length === 0) {
    return 'no-loaded'
  }
  // A measured loaded latency without its increase had no idle median to compare with.
  return loaded.some((value) => !('status' in value) && value.increaseMs === undefined) ? 'no-idle' : 'no-gradable'
}

/**
 * The grade, its words and its basis; without a grade, what it needs. `brief`, as the Test screen
 * shows it, names the basis without its increases, as the kit's Test screen does.
 */
export function gradeView(result: Result, { t, locale }: Wording, brief = false): GradeView {
  const bufferbloat = result.bufferbloat
  if (bufferbloat === undefined) {
    const reason = ungradedReason(result)
    const basis = { 'no-idle': t('result.load.ungraded.noIdle'), 'no-loaded': t('result.load.ungraded.noLoaded'), 'no-gradable': t('result.load.ungraded.noGradable'), incomplete: t('result.load.ungraded.incomplete') }[reason]
    return { grade: null, words: t('result.load.notGraded'), basis }
  }
  const ms = (value: number) => latencyNumber(value, locale, result.client.timerResolutionMs)
  const increase = ms(bufferbloat.increaseMs)
  const words = t('result.load.words', { word: gradeWord(bufferbloat.grade, t) })
  if (brief) {
    const basis = { download: t('result.load.basisDownloadBrief'), upload: t('result.load.basisUploadBrief'), 'download+upload': t('result.load.basisBothBrief') }[bufferbloat.basis]
    return { grade: bufferbloat.grade, words, basis }
  }
  // A one-direction basis says why the other direction is not in it, as the kit's Result detail does.
  const ran = continuousDirection(result.settings)
  const without = (basis: string, other: Direction) => {
    if (ran !== null && other !== ran) {
      return t('result.load.basisNotRun', { basis, direction: other === 'download' ? t('result.load.download') : t('result.load.upload') })
    }
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

/** The note under the fixed label: why there is no number, or what the numbers are. */
function responsivenessNote(blocks: readonly Responsiveness[], directions: readonly Direction[], { t }: Wording): string {
  const h1 = blocks.find((block) => block.state === 'unavailable_h1')
  if (h1 !== undefined) {
    return protocolLabel(h1.protocol) === null ? t('result.load.rpm.treatedH1') : t('result.load.rpm.needsH2')
  }
  if (blocks.some((block) => block.state === 'uncertain')) {
    return t('result.load.rpm.noteUncertain')
  }
  if (directions.length === 2) {
    return t('result.load.rpm.noteBoth')
  }
  return directions[0] === 'upload' ? t('result.load.rpm.noteUpload') : t('result.load.rpm.noteDownload')
}

function responsivenessRow(direction: Direction, block: Responsiveness, resolutionMs: number, detailed: boolean, { t, locale }: Wording): ResponsivenessRow {
  switch (block.state) {
    case 'measured':
    case 'uncertain': {
      const values = { tm95: formatLatency(block.tm95Ms, locale, resolutionMs), samples: t('result.load.rpm.samples', { n: block.samples }, block.samples), trimmed: block.trimmed }
      const detail = block.trimmed === 0 ? t('result.load.rpm.detailPlain', values) : t('result.load.rpm.detailTrimmed', values)
      return { direction, value: rpmNumber(block.rpm, locale), uncertain: block.state === 'uncertain', ...(detailed ? { detail } : {}) }
    }
    case 'unavailable_h1':
      // The Test screen leaves the note to say why; the Result detail names the state too.
      return { direction, value: null, uncertain: false, ...(detailed ? { text: t('result.load.rpm.unavailable') } : {}) }
    case 'unavailable_insufficient':
      return { direction, value: null, uncertain: false, text: t('result.load.rpm.insufficient') }
  }
}

/**
 * The HTTP loaded responsiveness of each direction that ran, in the run's order, under one fixed
 * label with the protocol and a note; `detailed`, as the Result detail shows it, adds each RPM's
 * TM95 and samples. Null for a result without it: a record that predates it, or no direction run.
 */
export function responsivenessView(result: Result, wording: Wording, detailed = false): ResponsivenessView | null {
  const order = result.settings.phases.filter((phase): phase is Direction => phase !== 'idle')
  const ran = order.flatMap((direction) => {
    const block = result[direction]?.responsiveness
    return block === undefined ? [] : [{ direction, block }]
  })
  const first = ran[0]
  if (first === undefined) {
    return null
  }
  const { t } = wording
  const blocks = ran.map((entry) => entry.block)
  return {
    protocol: protocolLabel(first.block.protocol) ?? t('result.load.rpm.notReported'),
    note: responsivenessNote(blocks, ran.map((entry) => entry.direction), wording),
    tag: blocks.some((block) => block.state === 'uncertain') ? t('result.load.rpm.uncertain') : null,
    rows: ran.map(({ direction, block }) => responsivenessRow(direction, block, result.client.timerResolutionMs, detailed, wording)),
  }
}

/**
 * The Test screen's block of a standard run (the kit's TestScreen.jsx): a row per direction the run
 * plans, in its order, the result's where it has one, else the one its phase carried as it ended
 * (ui/screens.md section 1), and "—" where it has none yet or did not run, under the protocol the
 * info phase recorded until a block names its own.
 */
export function plannedResponsivenessView(
  result: Result | null,
  directions: readonly Direction[],
  protocol: string | null,
  wording: Wording,
  ended: Partial<Record<Direction, Responsiveness>> = {},
): ResponsivenessView | null {
  if (directions.length === 0) {
    return null
  }
  const { t } = wording
  const blockOf = (direction: Direction) => (result === null ? ended[direction] : result[direction]?.responsiveness)
  const blocks = directions.flatMap((direction) => {
    const block = blockOf(direction)
    return block === undefined ? [] : [block]
  })
  const first = blocks[0]
  return {
    protocol: protocolLabel(first === undefined ? protocol : first.protocol) ?? t('result.load.rpm.notReported'),
    note: responsivenessNote(blocks, directions, wording),
    tag: blocks.some((block) => block.state === 'uncertain') ? t('result.load.rpm.uncertain') : null,
    rows: directions.map((direction): ResponsivenessRow => {
      const block = blockOf(direction)
      // Without detail a row needs no timer resolution, which only the result carries.
      return block === undefined ? { direction, value: null, uncertain: false } : responsivenessRow(direction, block, result?.client.timerResolutionMs ?? 0, false, wording)
    }),
  }
}
