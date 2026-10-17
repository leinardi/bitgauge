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

// The locale detection of ui/i18n-a11y.md section 1.2: the lang parameter, then the language
// stored on the Settings screen, then the browser, then English. The catalog's completeness is locales.test.ts.

import { describe, expect, it } from 'vitest'

import { detectLocale } from '@/i18n'

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

  it.each([
    ['', ['de-AT'], 'EN', 'en'],
    ['?lang=xx', [], 'en', 'en'],
    // A stored language that is not shipped is passed over for the browser's.
    ['', ['en-US'], 'xx', 'en'],
    ['', [], 'xx', 'en'],
  ])('reads %j with the browser languages %j and the stored %s as %s', (search, languages, stored, locale) => {
    expect(detectLocale(search, languages, stored)).toBe(locale)
  })
})
