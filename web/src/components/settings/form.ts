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

import { type ComputedRef, inject, type InjectionKey } from 'vue'

import type { TestSettings } from '@/engine/messages'
import type { StoredKey, StoredSettings } from '@/lib/settingsStorage'

// What the Settings screen shares with its fields: the settings as stored over the server
// defaults, which fields differ from their default, and the two ways a field changes them. A field
// whose input is invalid reports it, so the screen's header counts the values not saved.

export interface SettingsForm {
  /** The settings stored in this browser over the server defaults. */
  current: ComputedRef<TestSettings>
  /** The server defaults from GET /info, as the engine's settings. */
  defaults: ComputedRef<TestSettings>
  stored: ComputedRef<StoredSettings>
  /** The stored fields that differ from their default. */
  changed: ComputedRef<ReadonlySet<StoredKey>>
  /** The value a field has. */
  valueOf(key: StoredKey): unknown
  /** The value a field has without its stored value. */
  defaultOf(key: StoredKey): unknown
  set(fields: StoredSettings): void
  reset(keys: readonly StoredKey[]): void
  resetAll(): void
  /** Marks the input `id` as holding an invalid value, not saved, or no longer. */
  invalid(id: string, invalid: boolean): void
}

export const SETTINGS_FORM: InjectionKey<SettingsForm> = Symbol('settings-form')

/** The Settings screen's form, inside one of its fields. */
export function useSettingsForm(): SettingsForm {
  const form = inject(SETTINGS_FORM)
  if (form === undefined) {
    throw new Error('a settings field renders inside the Settings screen')
  }
  return form
}
