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

// @vitest-environment jsdom

// The English catalog is complete (ui/i18n-a11y.md section 1): one namespace per file, every file
// in the application's catalog, every key the sources use present, and a key for every code the
// engine sends: each notice's title, each error's message key, each phase's announcement.

import { describe, expect, it, vi } from 'vitest'

import type { EngineErrorCode, NoticeCode, PhaseName } from '@/engine/messages'
import { createAppI18n, loadLocaleMessages, SUPPORTED_LOCALES } from '@/i18n'

const files = import.meta.glob<Record<string, object>>('/src/i18n/locales/en/*.json', { import: 'default', eager: true })

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

const catalog = Object.assign({}, ...Object.values(files)) as object
const known = new Set(keys(catalog))

const translations = import.meta.glob<Record<string, object>>('/src/i18n/locales/it/*.json', { import: 'default', eager: true })

function messageAt(messages: object, key: string): string {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages) as string
}

function placeholders(message: string): string[] {
  return [...new Set([...message.matchAll(/\{([a-zA-Z][\w]*)\}/g)].map((match) => match[1]))].sort() as string[]
}

describe('the Italian catalog', () => {
  const italian = Object.assign({}, ...Object.values(translations)) as object

  it('ships a complete set of namespaces and keys, without relying on fallback', () => {
    expect(Object.keys(translations)).toHaveLength(Object.keys(files).length)
    for (const [path, file] of Object.entries(translations)) {
      expect(Object.keys(file)).toEqual([path.split('/').at(-1)?.replace('.json', '')])
    }
    expect(new Set(keys(italian))).toEqual(known)
  })

  it('preserves named placeholders in every plural form', () => {
    for (const key of known) {
      const source = messageAt(catalog, key).split('|')
      const translated = messageAt(italian, key).split('|')
      expect(translated, key).toHaveLength(source.length)
      translated.forEach((form, index) => {
        expect(form.trim(), key).not.toBe('')
        expect(placeholders(form), key).toEqual(placeholders(source[index] ?? ''))
      })
    }
  })

  it('loads on demand and compiles every message, including plural forms', async () => {
    expect(SUPPORTED_LOCALES).toContain('it')
    const i18n = createAppI18n('?lang=it', ['en'])
    expect(document.documentElement.lang).toBe('it')
    expect(i18n.global.availableLocales).not.toContain('it')
    await loadLocaleMessages(i18n, 'it')
    expect(new Set(keys(i18n.global.getLocaleMessage('it')))).toEqual(known)
    const warning = vi.spyOn(console, 'warn')
    try {
      for (const key of known) {
        const params = Object.fromEntries(placeholders(messageAt(italian, key)).map((name) => [name, 'esempio']))
        for (const n of [0, 1, 2]) {
          // eslint-disable-next-line @intlify/vue-i18n/no-dynamic-keys -- Compile every catalog entry, not a runtime UI key.
          expect(i18n.global.t(key, { ...params, n }, n), key).not.toBe(key)
        }
      }
      expect(warning).not.toHaveBeenCalled()
    } finally {
      warning.mockRestore()
    }
    expect(i18n.global.t('test.start.start')).toBe('Avvia test')
    expect(i18n.global.t('settings.notSaved', { n: 1 }, 1)).toBe('1 valore non salvato')
    expect(i18n.global.t('settings.notSaved', { n: 2 }, 2)).toBe('2 valori non salvati')
  })
})

function camel(code: string): string {
  return code.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

// Typed records, so a code added to messages.ts fails to compile here until it is listed.
const NOTICES: Record<NoticeCode, true> = {
  'slow-link-extended': true,
  'low-confidence': true,
  'data-cap-reached': true,
  'data-used': true,
  'stream-limit': true,
  'rate-limited': true,
  'insufficient-data': true,
  'url-parameter-ignored': true,
  'stopped-early': true,
  'server-restarted': true,
  'server-unreachable': true,
  'proxy-buffering-suspected': true,
  'browser-upload-limit': true,
  'upload-interrupted': true,
  'response-compression-detected': true,
  'overhead-compensation': true,
  'timer-throttling-detected': true,
  'page-hidden': true,
  'network-changed': true,
  'websocket-reopened': true,
  'websocket-unavailable': true,
  'base-path-mismatch': true,
  'probe-reservation': true,
}
const ERRORS: Record<EngineErrorCode, true> = {
  'invalid-settings': true,
  'requests-failed': true,
  'rate-limited': true,
  'server-busy': true,
  'network-changed': true,
  'server-restarted': true,
  'server-unreachable': true,
}
const PHASES: Record<PhaseName, true> = { info: true, idle: true, download: true, upload: true }

describe('the English catalog', () => {
  it('holds one namespace per file, named after it', () => {
    for (const [path, file] of Object.entries(files)) {
      expect(Object.keys(file)).toEqual([path.split('/').at(-1)?.replace('.json', '')])
    }
  })

  it('is the application’s catalog, every file included', () => {
    const messages = createAppI18n('', ['en']).global.getLocaleMessage('en')
    expect(new Set(keys(messages))).toEqual(known)
  })

  it('has every key the sources use', () => {
    const used = Object.entries(sources).flatMap(([file, source]) =>
      [...source.matchAll(/\$?\bt\(\s*'([^']+)'/g)].map((match) => ({ file, key: match[1] ?? '' })),
    )
    expect(used.length).toBeGreaterThan(10)
    expect(used.filter(({ key }) => !known.has(key))).toEqual([])
  })

  it('titles every notice code under notices.<code in camelCase>.title', () => {
    expect(Object.keys(NOTICES).filter((code) => !known.has(`notices.${camel(code)}.title`))).toEqual([])
  })

  it('words every engine error under its message key, errors.<code>', () => {
    expect(Object.keys(ERRORS).filter((code) => !known.has(`errors.${code}`))).toEqual([])
  })

  it('announces every phase as it starts', () => {
    expect(Object.keys(PHASES).filter((phase) => !known.has(`a11y.live.phase.${phase}`))).toEqual([])
  })

  it('names its placeholders and gives a plural both forms', () => {
    const messages = keys(catalog).map((key) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalog) as string)
    expect(messages.filter((message) => /\{\d*\}/.test(message))).toEqual([])
    expect(messages.filter((message) => message.includes('|') && message.split('|').some((form) => form.trim() === ''))).toEqual([])
  })
})
