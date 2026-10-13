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

import { describe, expect, it } from 'vitest'

import type { EngineErrorCode, NoticeCode, PhaseName } from '@/engine/messages'
import { createAppI18n } from '@/i18n'

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

function camel(code: string): string {
  return code.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

// Typed records, so a code added to messages.ts fails to compile here until it is listed.
const NOTICES: Record<NoticeCode, true> = {
  'slow-link-extended': true,
  'low-confidence': true,
  'data-cap-reached': true,
  'stream-limit': true,
  'insufficient-data': true,
  'url-parameter-ignored': true,
  'stopped-early': true,
  'server-restarted': true,
  'server-unreachable': true,
  'proxy-buffering-suspected': true,
  'upload-interrupted': true,
  'response-compression-detected': true,
  'overhead-compensation': true,
  'timer-throttling-detected': true,
  'page-hidden': true,
  'network-changed': true,
  'websocket-reopened': true,
  'websocket-unavailable': true,
  'base-path-mismatch': true,
}
const ERRORS: Record<EngineErrorCode, true> = { 'invalid-settings': true, 'requests-failed': true, 'network-changed': true, 'server-restarted': true, 'server-unreachable': true }
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
