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

import { computed, type ComputedRef, readonly, type Ref, shallowRef } from 'vue'

import { type Theme, useTheme } from '@/composables/useTheme'
import { urlOverride, type UrlParams } from '@/composables/useUrlParams'
import type { ConfigureOverride, IgnoredParameter, TestSettings } from '@/engine/messages'
import { pruned, readStored, type SettingsStorage, type StoredKey, type StoredSettings, storedOver, writeStored } from '@/lib/settingsStorage'

// The user's settings (frontend.md section 4, ui/screens.md section 4): the sparse object stored
// in this browser, shared with the theme, which keeps its own field. Each change is saved as it is
// made; a field that comes to equal its default is removed, so only what the user set is stored.
// The effective settings are the URL parameters over the stored fields over the server defaults
// (ui/url-params.md section 1).

export interface Settings {
  /** The stored fields this version applies, the theme's included. */
  stored: ComputedRef<StoredSettings>
  /** False once the browser refused a write: the changes still apply to this page. */
  saved: Readonly<Ref<boolean>>
  /** Stores `fields` over the stored settings; `defaults` decide which fields equal their default. */
  set(fields: StoredSettings, defaults: TestSettings): void
  /** Removes the stored `keys`: each returns to its default. */
  reset(keys: readonly StoredKey[], defaults: TestSettings): void
  /** Removes every stored field this version knows; fields it does not know stay. */
  resetAll(): void
}

/** What the settings read and write; tests pass their own, the application uses `useSettings`. */
export interface SettingsEnvironment {
  storage: SettingsStorage
  theme: Pick<Theme, 'stored' | 'setTheme' | 'resetTheme'>
}

export function createSettings(env: SettingsEnvironment): Settings {
  const { theme: _theme, ...initial } = readStored(env.storage)
  // The fields other than the theme, which the theme keeps.
  const own = shallowRef<StoredSettings>(initial)
  const saved = shallowRef(true)

  function write(next: StoredSettings): void {
    const removed = (Object.keys(own.value) as StoredKey[]).filter((key) => !Object.hasOwn(next, key))
    own.value = next
    // A refused write keeps the change for this page; the screen says it was not saved.
    saved.value = writeStored(env.storage, next, removed) && saved.value
  }

  return {
    stored: computed(() => (env.theme.stored.value === null ? own.value : { ...own.value, theme: env.theme.stored.value })),
    saved: readonly(saved),
    set(fields, defaults) {
      const { theme, ...rest } = fields
      if (theme !== undefined) {
        if (theme === 'system') {
          env.theme.resetTheme()
        } else {
          env.theme.setTheme(theme)
        }
      }
      if (Object.keys(rest).length > 0) {
        write(pruned(defaults, { ...own.value, ...rest }))
      }
    },
    reset(keys, defaults) {
      if (keys.includes('theme')) {
        env.theme.resetTheme()
      }
      const next = { ...own.value }
      for (const key of keys) {
        Reflect.deleteProperty(next, key)
      }
      write(pruned(defaults, next))
    },
    resetAll() {
      env.theme.resetTheme()
      write({})
    },
  }
}

let shared: Settings | null = null

/** The application's settings, shared by every component. */
export function useSettings(): Settings {
  // localStorage itself throws where storage is disabled, so it is reached only inside the calls.
  shared ??= createSettings({
    storage: { getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
    theme: useTheme(),
  })
  return shared
}

/**
 * The settings a page load runs with: the stored settings over the server defaults, as the
 * Worker's configured settings, and the URL parameters over them as the override the engine
 * resolves, with the parameters ignored.
 */
export function effectiveSettings(
  params: UrlParams,
  defaults: TestSettings,
  stored: StoredSettings,
): { settings: TestSettings; override: ConfigureOverride; ignored: IgnoredParameter[] } {
  const settings = storedOver(defaults, stored)
  return { settings, ...urlOverride(params, settings) }
}
