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

import { createI18n } from 'vue-i18n'

import a11y from '@/i18n/locales/en/a11y.json'
import about from '@/i18n/locales/en/about.json'
import app from '@/i18n/locales/en/app.json'
import errors from '@/i18n/locales/en/errors.json'
import notAvailable from '@/i18n/locales/en/notAvailable.json'
import notices from '@/i18n/locales/en/notices.json'
import test from '@/i18n/locales/en/test.json'

// vue-i18n in Composition API mode (ui/i18n-a11y.md section 1): one catalog per language, a file
// per screen or shared component group, each holding its own namespace. English is the source and
// the fallback.

const en = { ...app, ...test, ...notices, ...errors, ...about, ...notAvailable, ...a11y }

const SUPPORTED_LOCALES = ['en'] as const
type Locale = (typeof SUPPORTED_LOCALES)[number]

function supported(tag: string): Locale | null {
  const lower = tag.toLowerCase()
  return SUPPORTED_LOCALES.find((locale) => locale === lower) ?? null
}

/** Whether a `lang` value names a supported locale, as section 1.2 reads it. */
export function isSupportedLocale(tag: string): boolean {
  return supported(tag) !== null
}

/** The `lang` URL parameter's value; parameter names match case-insensitively (url-params.md section 1). */
function langParam(search: string): string | null {
  for (const [name, value] of new URLSearchParams(search)) {
    if (name.toLowerCase() === 'lang') {
      return value
    }
  }
  return null
}

/**
 * The locale of section 1.2: the `lang` URL parameter when supported; the stored language (none in
 * v0.1); the first supported browser language, by its language subtag when the full tag is not
 * supported; English.
 */
export function detectLocale(search: string, languages: readonly string[]): Locale {
  const param = langParam(search)
  const fromParam = param === null ? null : supported(param)
  if (fromParam !== null) {
    return fromParam
  }
  for (const tag of languages) {
    const match = supported(tag) ?? supported(tag.split('-')[0] ?? '')
    if (match !== null) {
      return match
    }
  }
  return 'en'
}

/** The application's i18n instance, with `<html lang>` set to the detected locale. */
export function createAppI18n(search: string, languages: readonly string[]) {
  const locale = detectLocale(search, languages)
  document.documentElement.lang = locale
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages: { en },
  })
}
