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

import { idleStopped, type RunView, screenState } from '@/components/test/screen/states'
import type { Wording } from '@/components/test/wording'
import type { DirectionLive, IdleLive } from '@/composables/useRunState'
import type { Direction, MeasuringPhase, PhaseName } from '@/engine/messages'
import { formatRate, latencyNumber, rateParts } from '@/lib/format'

// The Test screen's gauge (ui/screens.md section 1, design_system/components/gauge.md), derived
// from the run's live view: its reading, its textual states and its one-line readout. Nothing here
// is a number of its own: it only places and words what the engine sent.

const BUCKET_MS = 100

/** How far a running direction has come, in milliseconds from its phase start; null before it is known. */
function elapsedMs(direction: Direction, live: DirectionLive | null): number | null {
  if (live === null) {
    return null
  }
  if (direction === 'download') {
    return (live.firstBucket + live.values.length) * BUCKET_MS
  }
  const sent = live.sendingTrace.at(-1)
  return sent === undefined || live.start === null ? null : (sent.cell - live.start) * BUCKET_MS
}

/** The text a gauge shows in place of a reading: between runs, while connecting, after a stop or an error. */
export interface GaugeText {
  title: string
  message: string | null
  /** The message on a touch layout, where there is no Enter key. */
  touchMessage: string | null
  detail: string | null
  icon: 'cancelled' | 'error' | 'offline' | null
}

/** What the gauge shows. */
export interface GaugeInput {
  mode: 'rate' | 'ms'
  direction: Direction | null
  value: number | null
  peak: number | null
  inner: number | null
  label: string
  at: number | null
  /** The line under the reading: the ping counter and median, or the steady average and peak so far. */
  note: string | null
  /** The inner arc's value in words, so it is not told by color alone. */
  innerLabel: string | null
  /** A textual state in place of the reading; the dial then shows no needle. */
  text: GaugeText | null
}

/** What the gauge words its readings with besides the run: the display units and the server's name. */
export interface GaugeContext extends Wording {
  units: 'bits' | 'bytes'
  server: string
  /** The ended result was kept in history (Keep in history), so it no longer reads "not saved". */
  kept?: boolean
}

const PHASE_WORDS: Record<MeasuringPhase, (t: Wording['t']) => string> = {
  idle: (t) => t('test.gauge.phase.idle'),
  download: (t) => t('test.gauge.phase.download'),
  upload: (t) => t('test.gauge.phase.upload'),
}

function isMeasuring(phase: PhaseName | null): phase is MeasuringPhase {
  return phase === 'idle' || phase === 'download' || phase === 'upload'
}

/** "avg so far 597 · peak 610" once warm-up has ended, "warming up" before. */
function steadyNote(live: DirectionLive | null, { t, locale, units }: GaugeContext): string {
  const steady = live?.steady
  if (steady === null || steady === undefined) {
    return t('test.tiles.warmingUp')
  }
  const number = (value: number) => rateParts(value, units, locale).number
  return t('test.tiles.soFar', { avg: number(steady.avgBitsPerSecond), peak: number(steady.peakBitsPerSecond) })
}

/** The ping counter, with the running median once there is one. */
function idleNote(idle: IdleLive | null, { t, locale }: GaugeContext): string | null {
  if (idle === null) {
    return null
  }
  const ping = t('test.tiles.pings', { n: idle.pings, count: idle.count })
  return idle.medianMs === undefined ? ping : t('test.gauge.median', { median: latencyNumber(idle.medianMs, locale), ping })
}

/** The error state: what was lost, in which phase, and the last thing measured before it. */
function errorText(run: RunView, context: GaugeContext): GaugeText {
  const { t, locale, units } = context
  const phase = run.error?.phase ?? null
  let detail: string | null = null
  if (phase === 'idle' && run.idle !== null) {
    detail = t('test.gauge.pingsBefore', { n: run.idle.pings, count: run.idle.count })
  } else if (phase === 'download' || phase === 'upload') {
    const live = run.live[phase]
    const last = phase === 'upload' ? live?.sending : live?.gauge
    detail = last === null || last === undefined ? null : t('test.gauge.lastSample', { rate: formatRate(last, units, locale) })
  }
  const message = isMeasuring(phase) ? t('test.gauge.errorDuring', { phase: PHASE_WORDS[phase](t) }) : null
  return { title: t('test.gauge.lost'), message, touchMessage: null, detail, icon: 'error' }
}

const NO_READING = { mode: 'rate', direction: null, value: null, peak: null, inner: null, label: '', at: null, note: null, innerLabel: null, text: null } as const

/** The offline state between runs: the server did not answer, and when it is checked again. */
export function offlineGauge({ t, server }: GaugeContext, nextCheckS: number | null): GaugeInput {
  const message = nextCheckS === null ? t('test.gauge.offlineMessage', { server }) : t('test.gauge.offlineNext', { server, seconds: nextCheckS })
  return { ...NO_READING, text: { title: t('test.gauge.offline'), message, touchMessage: null, detail: null, icon: 'offline' } }
}

/**
 * The gauge (design_system/components/gauge.md, Modes and states): Ready between runs, Connecting…
 * during the info phase, idle latency in milliseconds with the ping counter, the download rate
 * with its steady peak, the upload's sending progress; once a result is in, the download headline
 * with the upload headline inside; after a stop Cancelled over the final arc, and after an error
 * what was lost and where.
 */
export function gaugeInput(run: RunView, context: GaugeContext): GaugeInput {
  const { t, locale, units } = context
  const reading = NO_READING
  const textual = (text: Omit<GaugeText, 'touchMessage' | 'detail' | 'icon'> & Partial<GaugeText>): GaugeInput => ({
    ...reading,
    text: { touchMessage: null, detail: null, icon: null, ...text },
  })
  const ready = textual({ title: t('test.gauge.ready'), message: t('test.gauge.pressEnter'), touchMessage: t('test.gauge.tapStart') })
  if (run.status === 'running') {
    switch (run.phase) {
      case 'idle':
        return { ...reading, mode: 'ms', value: run.idle?.rttMs ?? null, label: t('test.gauge.idle'), note: idleNote(run.idle, context) }
      case 'download': {
        const live = run.live.download
        return { ...reading, direction: 'download', value: live?.gauge ?? null, peak: live?.steady?.peakBitsPerSecond ?? null, label: t('test.gauge.download'), at: elapsedMs('download', live), note: steadyNote(live, context) }
      }
      case 'upload': {
        const live = run.live.upload
        const sent = live?.sendingTrace.at(-1)
        return { ...reading, direction: 'upload', value: live?.sending ?? null, label: t('test.gauge.sending'), at: sent === undefined ? null : sent.cell * BUCKET_MS, note: steadyNote(live, context) }
      }
      default:
        return textual({ title: t('test.gauge.connecting'), message: t('test.gauge.reading', { server: context.server }) })
    }
  }
  if (run.status === 'idle') {
    return ready
  }
  if (screenState(run) === 'error') {
    return { ...reading, text: errorText(run, context) }
  }
  const result = run.result
  if (result === null) {
    return ready
  }
  const upload = result.upload?.bitsPerSecond ?? null
  if (screenState(run) === 'cancelled') {
    // The final arc stays, without a needle: the download's value, or its last sample when it has
    // none, with the upload's partial value inside.
    const download = result.download?.bitsPerSecond ?? run.live.download?.gauge ?? null
    const text: GaugeText = { title: t('test.gauge.cancelled'), message: context.kept === true ? t('test.gauge.kept') : t('test.gauge.notSaved'), touchMessage: null, detail: null, icon: 'cancelled' }
    if (idleStopped(result)) {
      return { ...reading, mode: 'ms', value: result.idle?.medianMs ?? null, text }
    }
    return { ...reading, direction: 'download', value: download, inner: upload, text }
  }
  const download = result.download?.bitsPerSecond ?? null
  if (download === null && upload !== null) {
    return { ...reading, direction: 'upload', value: upload, label: t('test.gauge.upload') }
  }
  const innerLabel = upload === null ? null : t('test.gauge.inner', { rate: formatRate(upload, units, locale) })
  return { ...reading, direction: 'download', value: download, peak: result.download?.peakBitsPerSecond ?? null, inner: upload, label: t('test.gauge.download'), innerLabel }
}

/** What the gauge reads, in one line: its state's title, or its label, number and unit. */
export function gaugeReadout(gauge: GaugeInput, { t, locale, units }: GaugeContext): string | null {
  if (gauge.text !== null) {
    return gauge.text.title
  }
  if (gauge.value === null) {
    return null
  }
  const { number, unit } = gauge.mode === 'ms' ? { number: latencyNumber(gauge.value, locale), unit: t('test.gauge.ms') } : rateParts(gauge.value, units, locale)
  return `${gauge.label} ${number} ${unit}`
}
