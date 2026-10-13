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

import { computed, type ComputedRef, effectScope, readonly, type Ref, ref, shallowRef, watchEffect } from 'vue'

import { useUrlParams } from '@/composables/useUrlParams'

// The theme (frontend.md section 8): `data-theme` on <html>, following the system until the header
// chooses one. The choice is v0.1's only persisted setting (ui/screens.md section 1), kept under
// the settings key with any other field of that object left as it is. A `theme` URL parameter
// wins over the stored choice for the page load it appears on, and is not stored
// (ui/url-params.md section 1).

export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'bitgauge.settings.v1'
const LIGHT_QUERY = '(prefers-color-scheme: light)'
const CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system']

/** What the theme reads and writes; the browser's by default. */
export interface ThemeEnvironment {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  matchMedia(query: string): MediaQueryList
  root: HTMLElement
  /** The `theme` URL parameter of this page load. */
  override?: ThemeChoice
}

export interface Theme {
  choice: Readonly<Ref<ThemeChoice>>
  /** The theme applied: the choice, or the system's for `system`. */
  applied: ComputedRef<'light' | 'dark'>
  setTheme(choice: ThemeChoice): void
}

function storedSettings(storage: ThemeEnvironment['storage']): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    // Unreadable storage or a malformed value: the defaults apply.
    return {}
  }
}

/** A theme over an environment: tests pass their own, the application uses `useTheme`. */
export function createTheme(env: ThemeEnvironment): Theme {
  const stored = storedSettings(env.storage).theme
  const choice = ref<ThemeChoice>(env.override ?? CHOICES.find((value) => value === stored) ?? 'system')
  const query = env.matchMedia(LIGHT_QUERY)
  const systemLight = shallowRef(query.matches)
  query.addEventListener('change', (event) => {
    systemLight.value = event.matches
  })
  // Dark is the export's first theme and the system default when no preference is stated.
  const applied = computed(() => (choice.value === 'system' ? (systemLight.value ? 'light' : 'dark') : choice.value))
  watchEffect(() => {
    env.root.dataset.theme = applied.value
  })
  return {
    choice: readonly(choice),
    applied,
    setTheme(next) {
      choice.value = next
      try {
        env.storage.setItem(STORAGE_KEY, JSON.stringify({ ...storedSettings(env.storage), theme: next }))
      } catch {
        // Storage refused (private mode, quota): the theme still applies for this page.
      }
    },
  }
}

let shared: Theme | null = null

/** The application's theme, shared by every component. */
export function useTheme(): Theme {
  if (shared === null) {
    // localStorage itself throws where storage is disabled, so it is reached only inside the calls.
    const env: ThemeEnvironment = {
      storage: { getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
      matchMedia: (query) => window.matchMedia(query),
      root: document.documentElement,
    }
    const { theme } = useUrlParams()
    if (theme !== undefined) {
      env.override = theme
    }
    // A detached scope: the theme's effects outlive whichever component asked for it first. A new
    // scope is active, so run always returns the theme.
    shared = effectScope(true).run(() => createTheme(env)) ?? createTheme(env)
  }
  return shared
}
