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

import { CircleAlert, CircleMinus, EyeOff, Gauge, Hourglass, Info, Layers, Link, Percent, RefreshCw, ServerOff, Timer, TriangleAlert, Wifi } from '@lucide/vue'
import type { Component } from 'vue'

import type { Notice, Preset, Result } from '@/engine/messages'
import { formatPercent } from '@/lib/format'
import { links } from '@/lib/links'

import { type IgnoredContext, ignoredBody } from '@/components/test/ignored'
import { type InsufficientContext, insufficientWording } from '@/components/test/insufficient'
import { latencyStopWording, stopWording } from '@/components/test/stop'
import { confidenceReasons } from '@/components/test/tiles'
import type { Wording } from '@/components/test/wording'

// The notices of measurement.md section 16, worded from the code and raw values the engine sends,
// with the tones of ui/screens.md section 7 and up to two actions (design_system/components/
// notices.md). Each code has its entry in the notices namespace, named by the code in camelCase.

export type Tone = 'info' | 'warn' | 'danger' | 'neutral' | 'ok'

/** A notice's action: an event for the page, or a link into the docs. */
export type NoticeAction =
  | { kind: 'retry'; label: string }
  | { kind: 'preset'; preset: Preset; label: string }
  | { kind: 'link'; href: string; label: string }
  /** Hides an ignored URL parameter's notice for the page load. */
  | { kind: 'dismiss'; parameter: string; label: string }

export interface NoticeView {
  tone: Tone
  icon: Component
  title: string
  body: string
  actions: NoticeAction[]
}

/**
 * The wording, the result the notices belong to, which the stop notice is worded from, and the
 * settings and theme an ignored URL parameter stays on.
 */
export type NoticeContext = Wording & IgnoredContext & InsufficientContext & { result?: Result | null }

function preset(value: Preset, t: Wording['t']): string {
  return value === 'quick' ? t('test.summary.quick') : value === 'standard' ? t('test.summary.standard') : t('test.summary.extended')
}

/**
 * The notices as shown (ui/screens.md section 7): one each, except `slow-link-extended`, which the
 * engine carries per direction and the UI shows once, naming both directions when both extended.
 */
export function noticeViews(notices: readonly Notice[], context: NoticeContext): NoticeView[] {
  const extended = notices.filter((notice) => notice.code === 'slow-link-extended')
  if (extended.length < 2) {
    return notices.map((notice) => noticeView(notice, context))
  }
  const first = notices.indexOf(extended[0] as Notice)
  return notices.flatMap((notice, index) => (notice.code !== 'slow-link-extended' ? [noticeView(notice, context)] : index === first ? [slowLinkExtended(context.t('notices.slowLinkExtended.both'), context)] : []))
}

function slowLinkExtended(body: string, { t }: Wording): NoticeView {
  return { tone: 'info', icon: Hourglass, title: t('notices.slowLinkExtended.title'), body, actions: [] }
}

/**
 * The stop notice of a stop during idle latency that kept its samples (ui/flows.md section 4), which
 * the result carries no notice for; null for any other run. `pings` and `count` are the run's last
 * idle progress, the warm-up ping included.
 */
export function latencyStopView(result: Result | null, idle: { pings: number; count: number } | null, wording: Wording): NoticeView | null {
  if (result?.status !== 'partial' || result.idle === undefined || idle === null || result.notices.some((notice) => notice.code === 'stopped-early')) {
    return null
  }
  const order = result.settings.phases
  return { tone: 'neutral', icon: CircleMinus, ...latencyStopWording(idle.pings, idle.count, order.slice(order.indexOf('idle') + 1), wording), actions: [] }
}

/** One notice, worded. */
export function noticeView(notice: Notice, context: NoticeContext): NoticeView {
  const { t, locale } = context
  const docs: NoticeAction = { kind: 'link', href: links.deployment, label: t('notices.actions.docs') }
  switch (notice.code) {
    case 'slow-link-extended':
      return slowLinkExtended(notice.direction === 'download' ? t('notices.slowLinkExtended.download') : t('notices.slowLinkExtended.upload'), context)
    case 'low-confidence': {
      const reasons = confidenceReasons(notice.reasons, context)
      return { tone: 'warn', icon: TriangleAlert, title: t('notices.lowConfidence.title'), body: notice.direction === 'download' ? t('notices.lowConfidence.download', { reasons }) : t('notices.lowConfidence.upload', { reasons }), actions: [] }
    }
    case 'data-cap-reached':
      return { tone: 'warn', icon: Gauge, title: t('notices.dataCapReached.title'), body: notice.direction === 'download' ? t('notices.dataCapReached.download') : t('notices.dataCapReached.upload'), actions: [] }
    case 'stream-limit': {
      const n = notice.streams
      return { tone: 'info', icon: Layers, title: t('notices.streamLimit.title', { n }, n), body: notice.direction === 'download' ? t('notices.streamLimit.download', { n }) : t('notices.streamLimit.upload', { n }), actions: [] }
    }
    case 'insufficient-data': {
      const actions: NoticeAction[] = notice.offer === null ? [] : [{ kind: 'preset', preset: notice.offer, label: t('notices.actions.tryPreset', { preset: preset(notice.offer, t) }) }]
      return { tone: 'warn', icon: TriangleAlert, ...insufficientWording(notice, context), actions }
    }
    case 'url-parameter-ignored':
      return { tone: 'warn', icon: Link, title: t('notices.urlParameterIgnored.title'), body: ignoredBody(notice, context), actions: [{ kind: 'dismiss', parameter: notice.parameter, label: t('notices.actions.dismiss') }] }
    case 'stopped-early':
      return { tone: 'neutral', icon: CircleMinus, ...stopWording(notice, context.result ?? null, context), actions: [] }
    case 'server-restarted':
      return { tone: 'neutral', icon: RefreshCw, title: t('notices.serverRestarted.title'), body: t('notices.serverRestarted.body'), actions: [] }
    case 'server-unreachable':
      return { tone: 'danger', icon: ServerOff, title: t('notices.serverUnreachable.title'), body: t('notices.serverUnreachable.body'), actions: [{ kind: 'retry', label: t('notices.actions.retry') }] }
    case 'proxy-buffering-suspected':
      return { tone: 'warn', icon: TriangleAlert, title: t('notices.proxyBufferingSuspected.title'), body: t('notices.proxyBufferingSuspected.body'), actions: [docs] }
    case 'browser-upload-limit':
      return { tone: 'info', icon: Info, title: t('notices.browserUploadLimit.title', { browser: notice.browser }), body: t('notices.browserUploadLimit.body', { browser: notice.browser }), actions: [{ kind: 'link', href: links.browserUploadLimits, label: t('notices.actions.browserLimits') }] }
    case 'upload-interrupted':
      return { tone: 'danger', icon: CircleAlert, title: t('notices.uploadInterrupted.title'), body: t('notices.uploadInterrupted.body'), actions: [docs] }
    case 'response-compression-detected':
      return { tone: 'warn', icon: TriangleAlert, title: t('notices.responseCompressionDetected.title'), body: t('notices.responseCompressionDetected.body'), actions: [docs] }
    case 'overhead-compensation': {
      const percent = formatPercent(notice.percent, locale)
      return { tone: 'info', icon: Percent, title: t('notices.overheadCompensation.title', { percent }), body: t('notices.overheadCompensation.body', { percent }), actions: [] }
    }
    case 'timer-throttling-detected':
      return { tone: 'warn', icon: Timer, title: t('notices.timerThrottlingDetected.title'), body: t('notices.timerThrottlingDetected.body'), actions: [] }
    case 'page-hidden':
      return { tone: 'neutral', icon: EyeOff, title: t('notices.pageHidden.title'), body: t('notices.pageHidden.body'), actions: [] }
    case 'network-changed':
      return { tone: 'neutral', icon: Wifi, title: t('notices.networkChanged.title'), body: t('notices.networkChanged.body'), actions: [] }
    case 'websocket-reopened':
      return { tone: 'info', icon: Info, title: t('notices.websocketReopened.title'), body: t('notices.websocketReopened.body'), actions: [] }
    case 'websocket-unavailable':
      return { tone: 'info', icon: Info, title: t('notices.websocketUnavailable.title'), body: t('notices.websocketUnavailable.body'), actions: [] }
    case 'probe-reservation':
      return { tone: 'info', icon: Layers, title: t('notices.probeReservation.title', { n: notice.streams }), body: t('notices.probeReservation.body', { n: notice.streams }), actions: [] }
    case 'base-path-mismatch':
      return { tone: 'danger', icon: CircleAlert, title: t('notices.basePathMismatch.title'), body: t('notices.basePathMismatch.body'), actions: [{ kind: 'link', href: links.subPathGuide, label: t('notices.actions.docs') }] }
  }
}
