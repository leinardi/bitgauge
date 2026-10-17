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

import type { DurationBounds, MeasuringPhase, Preset } from '@/engine/messages'
import { MB, type StoredKey } from '@/lib/settingsStorage'
import type { NotInLink } from '@/lib/shareUrl'

// The words of the Settings screen's changed list and its shareable link (ui/screens.md section 4):
// each setting's name, and a value of it as the list shows the value and its default.

type Translate = ReturnType<typeof useI18n>['t']

/** The order the changed list shows the settings in, the screen's own. */
export const SHOWN_ORDER: readonly StoredKey[] = ['preset', 'phases', 'streams', 'download', 'upload', 'dataCapBytes', 'units', 'theme', 'lang', 'autoStart', 'label', 'warmup', 'pingCount', 'overheadCompensationPercent']

export function settingName(key: StoredKey | NotInLink, t: Translate): string {
  switch (key) {
    case 'preset':
      return t('settings.names.preset')
    case 'phases':
      return t('settings.names.phases')
    case 'streams':
      return t('settings.names.streams')
    case 'download':
      return t('settings.names.download')
    case 'upload':
      return t('settings.names.upload')
    case 'durations':
      return t('settings.names.durations')
    case 'dataCapBytes':
      return t('settings.names.dataCapBytes')
    case 'units':
      return t('settings.names.units')
    case 'theme':
      return t('settings.names.theme')
    case 'lang':
      return t('settings.names.lang')
    case 'label':
      return t('settings.names.label')
    case 'autoStart':
      return t('settings.names.autoStart')
    case 'countdown':
      return t('settings.names.countdown')
    case 'warmup':
      return t('settings.names.warmup')
    case 'pingCount':
      return t('settings.names.pingCount')
    case 'overheadCompensationPercent':
    case 'overhead':
      return t('settings.names.overheadCompensationPercent')
  }
}

export function presetName(preset: Preset, t: Translate): string {
  return preset === 'quick' ? t('settings.preset.names.quick') : preset === 'extended' ? t('settings.preset.names.extended') : t('settings.preset.names.standard')
}

function phaseName(phase: MeasuringPhase, t: Translate): string {
  return phase === 'idle' ? t('settings.phases.idle') : phase === 'download' ? t('settings.phases.download') : t('settings.phases.upload')
}

function seconds(ms: number): number {
  return ms / 1000
}

/** A setting's value, or its default, as the changed list shows it. */
export function settingValue(key: StoredKey, value: unknown, t: Translate): string {
  switch (key) {
    case 'preset':
      return presetName(value as Preset, t)
    case 'phases':
      return (value as MeasuringPhase[]).map((phase) => phaseName(phase, t)).join(', ')
    case 'streams': {
      const streams = value as { mode: string; fixed?: number }
      return streams.mode === 'auto' ? t('settings.values.auto') : streams.mode === 'single' ? t('settings.values.single') : t('settings.values.fixed', { n: streams.fixed ?? 0 })
    }
    case 'download':
    case 'upload': {
      const bounds = value as DurationBounds
      return t('settings.values.range', { min: seconds(bounds.minMs), max: seconds(bounds.maxMs) })
    }
    case 'dataCapBytes':
      return value === null ? t('settings.values.none') : t('settings.values.megabytes', { n: Number(((value as number) / MB).toFixed(3)) })
    case 'units':
      return value === 'bytes' ? t('settings.values.bytes') : t('settings.values.bits')
    case 'theme':
      return value === 'light' ? t('settings.values.light') : value === 'dark' ? t('settings.values.dark') : t('settings.values.system')
    case 'lang':
      return typeof value === 'string' ? (new Intl.DisplayNames([value], { type: 'language' }).of(value) ?? value) : t('settings.values.browser')
    case 'label':
      return value === '' ? t('settings.values.none') : String(value)
    case 'autoStart': {
      const auto = value as { enabled: boolean; countdownS: number }
      return t('settings.values.autoStart', { state: auto.enabled ? t('settings.values.on') : t('settings.values.off'), n: auto.countdownS })
    }
    case 'warmup':
      return value === 'auto' ? t('settings.values.auto') : t('settings.values.fixedWarmup', { n: seconds(value as number) })
    case 'pingCount':
      return String(value)
    case 'overheadCompensationPercent':
      return value === 0 ? t('settings.values.none') : t('settings.values.overhead', { n: value as number })
  }
}
