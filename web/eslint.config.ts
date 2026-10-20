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

import pluginVue from 'eslint-plugin-vue'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

// Production files stay under 400 lines, blank lines and comments included. Generated, vendored and
// test code is exempt.
const maxLines = 400
const unbudgetedFiles = ['src/api/types.gen.ts', 'src/components/ui/**', 'src/test/**', 'src/**/*.test.ts', 'src/**/*.spec.ts']

// The engine boundary (frontend.md section 2), enforced in both directions.
//
// The engine runs in a Worker and is tested against synthetic timelines, so it imports only from
// itself and from the generated API types: no Vue, no DOM library, no application code. It reaches
// the monotonic clock, timers and the network only through the injected Clock and Transport, so
// the browser globals that would bypass them -- and the DOM and storage globals, which a Worker
// engine has no use for -- are banned everywhere in the engine except the three files that wire the
// production implementations. Date stays allowed: the result's startedAt is wall-clock time
// (measurement.md section 17), which is not what the Clock measures. The application, in turn, imports only the message types; it starts
// the Worker by URL, which is not an import.

const engineFiles = ['src/engine/**/*.ts']

// clock.ts and transport.ts are the production Clock and Transport; worker.ts is the message loop
// that receives and posts messages.
const engineWiringFiles = ['src/engine/clock.ts', 'src/engine/transport.ts', 'src/engine/worker.ts']

const engineBannedGlobals = [
  'window',
  'document',
  'navigator',
  'location',
  'self',
  'globalThis',
  'postMessage',
  'performance',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'queueMicrotask',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'localStorage',
  'sessionStorage',
  'indexedDB',
].map((name) => ({
  name,
  message: `The engine reaches ${name} only through the injected Clock or Transport (frontend.md section 2).`,
}))

const engineRestrictedImports = {
  patterns: [
    {
      group: ['vue', 'vue/**', '@vue/**', 'vue-*', '@vueuse/**', 'reka-ui', 'reka-ui/**', 'idb', 'uplot'],
      message: 'The engine is framework-free: no Vue, no UI library, no storage (frontend.md section 2).',
    },
    {
      regex: '^@/(?!engine/|api/types\\.gen$)',
      message: 'The engine imports only from itself and from the generated API types (frontend.md section 2).',
    },
    {
      // A relative path that climbs can reach application code, and from a nested folder there is
      // no telling how far up it goes: inside the engine, ../ is always written as @/engine/.
      regex: '^\\.\\./',
      message: 'Inside the engine, write a path that leaves the folder as @/engine/... (frontend.md section 2).',
    },
  ],
}

// The demo build's Worker-side files (frontend.md section 9) run the engine against a simulated
// link: the engine's policy, with the demo's own folder admitted. Its Vue files, DemoPanel.vue,
// stay under the application's policy.
const demoRestrictedImports = {
  patterns: [
    {
      group: ['vue', 'vue/**', '@vue/**', 'vue-*', '@vueuse/**', 'reka-ui', 'reka-ui/**', 'idb', 'uplot'],
      message: 'The demo Worker is framework-free: no Vue, no UI library, no storage (frontend.md section 9).',
    },
    {
      regex: '^@/(?!engine/|demo/|api/types\\.gen$)',
      message: 'The demo Worker imports only the engine, the demo and the generated API types (frontend.md section 9).',
    },
    {
      regex: '^\\.\\./',
      message: 'Inside the demo, write a path that leaves the folder as @/demo/... or @/engine/... (frontend.md section 9).',
    },
  ],
}

const appRestrictedImports = {
  patterns: [
    {
      regex: '^(@/|(\\.\\.?/)+)engine(/?$|/(?!messages(\\.ts)?$))',
      message:
        'The application imports only engine/messages.ts; it starts the Worker by URL (frontend.md section 2).',
    },
  ],
}

export default defineConfig(
  {
    ignores: ['dist/', 'node_modules/', '.cache/', 'src/api/types.gen.ts', 'src/components/ui/'],
  },
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  ...vueI18n.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    settings: {
      'vue-i18n': {
        localeDir: { pattern: 'src/i18n/locales/en/*.json', localeKey: 'path' },
        messageSyntaxVersion: '^11.0.0',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'vue/no-restricted-block': [
        'error',
        { element: 'i18n', message: 'Use the central catalog in src/i18n/ instead of <i18n> blocks.' },
      ],
      '@intlify/vue-i18n/no-dynamic-keys': 'error',
      '@intlify/vue-i18n/no-raw-text': ['error', { ignoreNodes: ['code', 'pre', 'kbd', 'script', 'style'] }],
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    ignores: engineFiles,
    rules: { 'no-restricted-imports': ['error', appRestrictedImports] },
  },
  {
    // The pages are named by route (frontend.md section 1): Test, History, Settings, About.
    files: ['src/pages/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  {
    files: engineFiles,
    rules: { 'no-restricted-imports': ['error', engineRestrictedImports] },
  },
  {
    files: ['src/demo/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', demoRestrictedImports] },
  },
  {
    // The demo reaches time and the network through the injected Clock and its simulated
    // Transport too; only its Worker entry touches the Worker's globals.
    files: ['src/demo/**/*.ts'],
    ignores: ['src/demo/worker.ts'],
    rules: { 'no-restricted-globals': ['error', ...engineBannedGlobals] },
  },
  {
    files: engineFiles,
    ignores: engineWiringFiles,
    rules: { 'no-restricted-globals': ['error', ...engineBannedGlobals] },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    ignores: unbudgetedFiles,
    rules: {
      'max-lines': ['error', { max: maxLines, skipBlankLines: false, skipComments: false }],
    },
  },
)
