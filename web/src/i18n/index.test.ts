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

// The catalog and the locale detection of ui/i18n-a11y.md section 1: every key the sources use
// exists in English, and the locale comes from the lang parameter, then the browser, then English.

import { describe, expect, it } from 'vitest'

import { detectLocale } from '@/i18n'
import about from '@/i18n/locales/en/about.json'
import app from '@/i18n/locales/en/app.json'
import notAvailable from '@/i18n/locales/en/notAvailable.json'
import notices from '@/i18n/locales/en/notices.json'
import test from '@/i18n/locales/en/test.json'

const sources = import.meta.glob<string>(['/src/**/*.vue', '/src/**/*.ts', '!/src/**/*.test.ts', '!/src/components/ui/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Every message key of a catalog, as dotted paths. */
function keys(catalog: object, prefix = ''): string[] {
  return Object.entries(catalog).flatMap(([name, value]) =>
    typeof value === 'object' && value !== null ? keys(value as object, `${prefix}${name}.`) : [`${prefix}${name}`],
  )
}

describe('the English catalog', () => {
  const known = new Set(keys({ ...app, ...test, ...notices, ...about, ...notAvailable }))

  it('holds one namespace per file, named after it', () => {
    expect(Object.keys(app)).toEqual(['app'])
    expect(Object.keys(test)).toEqual(['test'])
    expect(Object.keys(about)).toEqual(['about'])
    expect(Object.keys(notAvailable)).toEqual(['notAvailable'])
    expect(Object.keys(notices)).toEqual(['notices'])
  })

  it('has every key the sources use', () => {
    const used = Object.entries(sources).flatMap(([file, source]) =>
      [...source.matchAll(/\$?\bt\(\s*'([^']+)'/g)].map((match) => ({ file, key: match[1] ?? '' })),
    )
    expect(used.length).toBeGreaterThan(10)
    expect(used.filter(({ key }) => !known.has(key))).toEqual([])
  })
})

describe('detectLocale', () => {
  it.each([
    ['?lang=en', ['de-AT'], 'en'],
    ['?LANG=EN', [], 'en'],
    ['?lang=xx', ['en-GB'], 'en'],
    ['', ['de-AT', 'en-US'], 'en'],
    ['', ['de'], 'en'],
    ['', [], 'en'],
  ])('reads %j with the browser languages %j as %s', (search, languages, locale) => {
    expect(detectLocale(search, languages)).toBe(locale)
  })
})
