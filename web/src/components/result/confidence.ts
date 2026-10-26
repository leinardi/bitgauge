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

import { CircleCheck, Cpu, TriangleAlert } from '@lucide/vue'
import type { Component } from 'vue'

import { noticeViews, type Tone } from '@/components/test/notices'
import { confidenceReasons } from '@/components/test/tiles'
import type { Wording } from '@/components/test/wording'
import type { Confidence, Direction, Result } from '@/engine/messages'
import { formatDuration, formatSpan } from '@/lib/format'

// The confidence and notices card (ui/screens.md section 2, kit ResultDetail.jsx): each measured
// direction's confidence with its reasons, then every notice the result
// carries, worded as the Test screen words it; each with an icon and text, and a notice's docs link.
// The card's pill is the lowest confidence of the directions.

export interface ConfidenceItem {
  tone: Tone
  icon: Component
  title: string
  body: string
  link: { href: string; label: string } | null
}

export interface ConfidenceView {
  level: Confidence['level'] | null
  confidence: ConfidenceItem[]
  notices: ConfidenceItem[]
}

const RANK: Record<Confidence['level'], number> = { normal: 0, 'cpu-bound': 1, low: 2 }

function directionItem(direction: Direction, result: Result, wording: Wording): ConfidenceItem | null {
  const { t, locale } = wording
  const part = result[direction]
  const confidence = part?.confidence
  if (part === undefined || confidence === undefined) {
    return null
  }
  const named = (download: string, upload: string) => (direction === 'download' ? download : upload)
  switch (confidence.level) {
    case 'normal': {
      // A Continuous window is the run's known time, read in days, hours and minutes as elsewhere on the page.
      const window = result.settings.preset === 'continuous' ? formatSpan(part.windowMs ?? 0, locale) : formatDuration(part.windowMs ?? 0, locale)
      const body = part.series === undefined ? t('result.confidence.normal.window', { window }) : t('result.confidence.normal.body', { at: formatDuration(part.series.warmupEndMs, locale), window })
      return { tone: 'ok', icon: CircleCheck, title: named(t('result.confidence.normal.download'), t('result.confidence.normal.upload')), body, link: null }
    }
    case 'low':
      return { tone: 'warn', icon: TriangleAlert, title: named(t('result.confidence.low.download'), t('result.confidence.low.upload')), body: t('result.confidence.low.body', { reasons: confidenceReasons(confidence.reasons, wording) }), link: null }
    case 'cpu-bound':
      return { tone: 'warn', icon: Cpu, title: named(t('result.confidence.cpuBound.download'), t('result.confidence.cpuBound.upload')), body: t('result.confidence.cpuBound.body'), link: null }
  }
}

export function confidenceView(result: Result, wording: Wording): ConfidenceView {
  const directions = result.settings.phases.filter((phase): phase is Direction => phase !== 'idle')
  const confidence = directions.flatMap((direction) => directionItem(direction, result, wording) ?? [])
  const levels = directions.flatMap((direction) => result[direction]?.confidence?.level ?? [])
  const level = levels.reduce<Confidence['level'] | null>((worst, next) => (worst === null || RANK[next] > RANK[worst] ? next : worst), null)
  const notices: ConfidenceItem[] = noticeViews(result.notices, { ...wording, result }).map((view) => {
    const link = view.actions.find((action) => action.kind === 'link')
    return { tone: view.tone, icon: view.icon, title: view.title, body: view.body, link: link?.kind === 'link' ? { href: link.href, label: link.label } : null }
  })
  return { level, confidence, notices }
}
