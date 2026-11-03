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

import type { ThemeChoice } from '@/composables/useTheme'
import type { DurationBounds, IgnoredParameter, MeasuringPhase, Notice, Preset, TestSettings } from '@/engine/messages'
import { formatBytes } from '@/lib/format'
import { runLengthShown } from '@/lib/runLength'

import type { Wording } from '@/components/test/wording'

// The URL parameter ignored notice (ui/url-params.md section 2): the parameter with the value the
// link gave, the values it allows, and what the setting stays on for the run, so the reader knows
// what applied instead. Under Continuous, `test` names the direction and `duration` the run length.

type Ignored = Extract<Notice, { code: 'url-parameter-ignored' }>

/** What the second sentence reads from: the run's settings, the page's own theme choice and the stored label. */
export interface IgnoredContext {
  settings?: TestSettings | null
  theme?: ThemeChoice
  /** The label stored in Settings, which a run keeps when the link's is ignored. */
  label?: string
}

const or = (items: string[], { locale }: Wording) => new Intl.ListFormat(locale, { type: 'disjunction' }).format(items)

function allowed({ parameter, value }: Ignored, settings: TestSettings | null, wording: Wording): string {
  const { t } = wording
  const count = t('notices.urlParameterIgnored.allowed.count', { max: settings?.streams.max ?? 6 })
  const continuous = settings?.preset === 'continuous'
  switch (parameter) {
    case 'run':
      return or(['1', 'true', '0', 'false'], wording)
    case 'test':
      return or(continuous ? ['all', 'download', 'upload'] : ['all', 'download', 'upload', 'latency'], wording)
    case 'preset':
      return or(['quick', 'standard', 'extended', 'continuous'], wording)
    case 'duration':
      return continuous ? t('notices.urlParameterIgnored.allowed.runLength') : t('notices.urlParameterIgnored.allowed.duration')
    case 'streams':
      return /^\d+$/u.test(value.trim()) ? count : or(['auto', 'single', count], wording)
    case 'cap':
      return t('notices.urlParameterIgnored.allowed.cap')
    case 'units':
      return or(['bits', 'bytes'], wording)
    case 'lang':
      return or(['en'], wording)
    case 'theme':
      return or(['system', 'light', 'dark'], wording)
    default:
      return t('notices.urlParameterIgnored.allowed.label')
  }
}

function phaseName(phase: MeasuringPhase, { t }: Wording): string {
  return phase === 'idle' ? t('notices.urlParameterIgnored.phases.idle') : phase === 'download' ? t('notices.urlParameterIgnored.phases.download') : t('notices.urlParameterIgnored.phases.upload')
}

function presetName(preset: Preset, { t }: Wording): string {
  switch (preset) {
    case 'quick':
      return t('notices.urlParameterIgnored.presets.quick')
    case 'standard':
      return t('notices.urlParameterIgnored.presets.standard')
    case 'extended':
      return t('notices.urlParameterIgnored.presets.extended')
    case 'continuous':
      return t('notices.urlParameterIgnored.presets.continuous')
  }
}

/** A run length in the unit the Settings screen shows it in. */
function runLengthName(ms: number, { t }: Wording): string {
  const { value, unit } = runLengthShown(ms / 1000)
  return unit === 'days' ? t('notices.urlParameterIgnored.runLength.days', { n: value }) : unit === 'hours' ? t('notices.urlParameterIgnored.runLength.hours', { n: value }) : t('notices.urlParameterIgnored.runLength.minutes', { n: value })
}

function streamsMode(settings: TestSettings, { t }: Wording): string {
  const { mode, fixed } = settings.streams
  return mode === 'auto' ? t('notices.urlParameterIgnored.streams.auto') : mode === 'single' ? t('notices.urlParameterIgnored.streams.single') : String(fixed)
}

function themeName(theme: ThemeChoice, { t }: Wording): string {
  return theme === 'system' ? t('notices.urlParameterIgnored.themes.system') : theme === 'light' ? t('notices.urlParameterIgnored.themes.light') : t('notices.urlParameterIgnored.themes.dark')
}

function range({ minMs, maxMs }: DurationBounds, { t }: Wording): string {
  return t('notices.urlParameterIgnored.range', { min: minMs / 1000, max: maxMs / 1000 })
}

/** The bounds a bounded run keeps, the stored ones or its preset's (ui/url-params.md section 2). */
function durations(settings: TestSettings, context: Wording): string {
  const { download, upload } = settings
  const { t } = context
  if (download.minMs === null || upload.minMs === null) {
    return t('notices.urlParameterIgnored.stays.duration')
  }
  if (download.minMs === upload.minMs && download.maxMs === upload.maxMs) {
    return t('notices.urlParameterIgnored.stays.durations', { range: range(download, context) })
  }
  return t('notices.urlParameterIgnored.stays.durationsSplit', { download: range(download, context), upload: range(upload, context) })
}

/** What the setting stays on for the run, the stored value it keeps; without the run's settings, its default. */
function stays({ parameter }: Ignored, context: Wording & IgnoredContext): string {
  const { t, locale } = context
  const settings = context.settings ?? null
  switch (parameter) {
    case 'run':
      return t('notices.urlParameterIgnored.stays.run')
    case 'duration':
      if (settings?.preset === 'continuous') {
        return settings.runLengthMs === undefined ? t('notices.urlParameterIgnored.stays.noRunLength') : t('notices.urlParameterIgnored.stays.runLength', { value: runLengthName(settings.runLengthMs, context) })
      }
      return settings === null ? t('notices.urlParameterIgnored.stays.duration') : durations(settings, context)
    case 'label':
      return context.label === undefined || context.label === '' ? t('notices.urlParameterIgnored.stays.label') : t('notices.urlParameterIgnored.stays.labelStored', { value: context.label })
    case 'lang':
      return t('notices.urlParameterIgnored.stays.lang', { value: new Intl.DisplayNames(locale, { type: 'language' }).of(locale) ?? locale })
    case 'theme':
      return context.theme === undefined ? t('notices.urlParameterIgnored.stays.default') : t('notices.urlParameterIgnored.stays.theme', { value: themeName(context.theme, context) })
    default:
      break
  }
  if (settings === null) {
    return t('notices.urlParameterIgnored.stays.default')
  }
  switch (parameter) {
    case 'test':
      if (settings.preset === 'continuous') {
        return t('notices.urlParameterIgnored.stays.direction', { value: phaseName(settings.continuousDirection ?? 'download', context) })
      }
      return t('notices.urlParameterIgnored.stays.test', { value: new Intl.ListFormat(locale, { type: 'conjunction' }).format(settings.phases.map((phase) => phaseName(phase, context))) })
    case 'preset':
      return t('notices.urlParameterIgnored.stays.preset', { value: presetName(settings.preset, context) })
    case 'streams':
      return t('notices.urlParameterIgnored.stays.streams', { value: streamsMode(settings, context) })
    case 'cap':
      return t('notices.urlParameterIgnored.stays.cap', { value: settings.dataCapBytes === null ? t('notices.urlParameterIgnored.none') : formatBytes(settings.dataCapBytes, locale) })
    default:
      return t('notices.urlParameterIgnored.stays.units', { value: settings.units })
  }
}

/** The notice's body: "streams=12 ignored, allowed 1–6. Streams stay on Auto; the other parameters from the link were applied." */
export function ignoredBody(notice: Ignored, context: Wording & IgnoredContext): string {
  return context.t('notices.urlParameterIgnored.body', { parameter: notice.parameter, value: notice.value, allowed: allowed(notice, context.settings ?? null, context), stays: stays(notice, context) })
}

/**
 * The notices the Test screen lists: before a run, the URL parameters ignored, which a run will
 * carry, and the run's own notices once it started. Before GET /info answers (`settled` false) no
 * ignored-parameter notice shows: its body names what the setting stays on, which the server's
 * defaults settle, so it would change after mount. From a run's start until its first phase event
 * brings the run's own ignored-parameter notices, the same notices stay, so their boxes are neither
 * unmounted nor announced again.
 */
export function screenNotices({ idle, settled, ignored, run }: { idle: boolean; settled: boolean; ignored: readonly IgnoredParameter[]; run: readonly Notice[] }): Notice[] {
  const pending = settled ? ignored.map(({ parameter, value }): Notice => ({ code: 'url-parameter-ignored', parameter, value })) : []
  if (idle) {
    return pending
  }
  return run.some((notice) => notice.code === 'url-parameter-ignored') ? [...run] : [...pending, ...run]
}
