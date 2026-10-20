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

import type { Wording } from '@/components/test/wording'
import type { Experience, Result, ScoreBand, ScoreInput, Scores } from '@/engine/messages'

// The quality list's contents (ui/screens.md section 6, design_system/components/measurement
// QualityList.jsx): a row per experience, streaming, gaming and video calls, with its band's name,
// or the inputs it is missing; the basis when the scores rest on one direction; always an upper
// bound, since packet loss is not measured.

export type ExperienceName = 'streaming' | 'gaming' | 'rtc'

export const EXPERIENCES: readonly ExperienceName[] = ['streaming', 'gaming', 'rtc']

export interface QualityRow {
  experience: ExperienceName
  name: string
  /** The band, or null when the experience is missing an input. */
  band: ScoreBand | null
  /** The band's name, or the inputs missing. */
  text: string
}

export interface QualityView {
  /** "download only" or "upload only"; null on both directions or none. */
  basis: string | null
  rows: QualityRow[]
}

export function experienceName(experience: ExperienceName, { t }: Wording): string {
  switch (experience) {
    case 'streaming':
      return t('result.quality.streaming')
    case 'gaming':
      return t('result.quality.gaming')
    case 'rtc':
      return t('result.quality.rtc')
  }
}

export function bandName(band: ScoreBand, { t }: Wording): string {
  switch (band) {
    case 'great':
      return t('result.quality.bands.great')
    case 'good':
      return t('result.quality.bands.good')
    case 'average':
      return t('result.quality.bands.average')
    case 'poor':
      return t('result.quality.bands.poor')
    case 'bad':
      return t('result.quality.bands.bad')
  }
}

function inputName(input: ScoreInput, { t }: Wording): string {
  switch (input) {
    case 'idle-latency':
      return t('result.quality.inputs.idleLatency')
    case 'jitter':
      return t('result.quality.inputs.jitter')
    case 'loaded-latency':
      return t('result.quality.inputs.loadedLatency')
    case 'download':
      return t('result.quality.inputs.download')
  }
}

/** An experience's band name, or "needs" the inputs it is missing. */
export function experienceText(experience: Experience, wording: Wording): string {
  if ('band' in experience) {
    return bandName(experience.band, wording)
  }
  const inputs = new Intl.ListFormat(wording.locale, { type: 'conjunction' }).format(experience.missing.map((input) => inputName(input, wording)))
  return wording.t('result.quality.needs', { inputs })
}

/** The basis named when the scores rest on one direction's loaded-latency increase. */
export function scoreBasis(scores: Scores, { t }: Wording): string | null {
  return scores.basis === 'download' ? t('result.quality.basisDownload') : scores.basis === 'upload' ? t('result.quality.basisUpload') : null
}

/** The quality list of a result with scores; null without them (a record that predates them). */
export function qualityView(result: Result, wording: Wording): QualityView | null {
  const scores = result.scores
  if (scores === undefined) {
    return null
  }
  return {
    basis: scoreBasis(scores, wording),
    rows: EXPERIENCES.map((experience) => {
      const score = scores[experience]
      return { experience, name: experienceName(experience, wording), band: 'band' in score ? score.band : null, text: experienceText(score, wording) }
    }),
  }
}

/**
 * The Test screen's list without a result to score (the kit's TestScreen.jsx): every experience "—"
 * before a run ends, or "needs a full test" when it ended without a result.
 */
export function pendingQualityView(wording: Wording, ended = false): QualityView {
  const text = ended ? wording.t('result.quality.needsFullTest') : '—'
  return { basis: null, rows: EXPERIENCES.map((experience) => ({ experience, name: experienceName(experience, wording), band: null, text })) }
}
