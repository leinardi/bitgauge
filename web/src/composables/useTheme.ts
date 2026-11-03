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

import { computed, type ComputedRef, effectScope, readonly, type Ref, ref, shallowRef, watch, watchEffect } from 'vue'

import { useUrlParams } from '@/composables/useUrlParams'
import { readStored, type SettingsStorage, type ThemeChoice, writeStored } from '@/lib/settingsStorage'

// The theme (frontend.md section 8): `data-theme` on <html>, following the system until the header
// or the Settings screen chooses one. The choice is the stored settings' `theme` field
// (lib/settingsStorage.ts), written with every other field of that object left as it is. A `theme`
// URL parameter wins over the stored choice for the page load it appears on, and is not stored
// (ui/url-params.md section 1); once a Settings edit or reset drops it, the stored choice applies
// (ui/flows.md section 9).

export type { ThemeChoice } from '@/lib/settingsStorage'

const LIGHT_QUERY = '(prefers-color-scheme: light)'

/** What the theme reads and writes; the browser's by default. */
export interface ThemeEnvironment {
  storage: SettingsStorage
  matchMedia(query: string): MediaQueryList
  root: HTMLElement
  /** The `theme` URL parameter of this page load, or a getter of it while it can be dropped. */
  override?: ThemeChoice | (() => ThemeChoice | undefined)
}

export interface Theme {
  choice: Readonly<Ref<ThemeChoice>>
  /** The choice stored in this browser, null when none is: what the Settings screen shows as changed. */
  stored: Readonly<Ref<ThemeChoice | null>>
  /** The theme applied: the choice, or the system's for `system`. */
  applied: ComputedRef<'light' | 'dark'>
  setTheme(choice: ThemeChoice): void
  /** Removes the stored choice: the theme follows the system again. */
  resetTheme(): void
}

/** A theme over an environment: tests pass their own, the application uses `useTheme`. */
export function createTheme(env: ThemeEnvironment): Theme {
  const stored = ref<ThemeChoice | null>(readStored(env.storage).theme ?? null)
  const { override } = env
  const linked = typeof override === 'function' ? override : () => override
  const choice = ref<ThemeChoice>(linked() ?? stored.value ?? 'system')
  watch(linked, (next) => {
    choice.value = next ?? stored.value ?? 'system'
  })
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
  function setTheme(next: ThemeChoice): void {
    choice.value = next
    // System is the default, so choosing it removes the stored field, as the other settings do;
    // a refused write still applies the theme for this page.
    stored.value = next === 'system' ? null : next
    if (next === 'system') {
      writeStored(env.storage, {}, ['theme'])
    } else {
      writeStored(env.storage, { theme: next })
    }
  }

  return {
    choice: readonly(choice),
    stored: readonly(stored),
    applied,
    setTheme,
    resetTheme: () => setTheme('system'),
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
    const params = useUrlParams()
    env.override = () => params.theme
    // A detached scope: the theme's effects outlive whichever component asked for it first. A new
    // scope is active, so run always returns the theme.
    shared = effectScope(true).run(() => createTheme(env)) ?? createTheme(env)
  }
  return shared
}
