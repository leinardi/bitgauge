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

import { computed, type ComputedRef, shallowRef } from 'vue'

import type { Info } from '@/api/info'

// The context label of the connection info (ui/screens.md section 1, edge-cases.md section 16): the
// server's suggestion, from server.labels or the address class, until the user picks LAN, VPN,
// none or a custom label. The run takes it as its context label; nothing of it is stored in the browser.

export type LabelChoice = 'suggested' | 'LAN' | 'VPN' | 'none' | 'custom'

const choice = shallowRef<LabelChoice>('suggested')
const custom = shallowRef('')

/** The label a choice gives: the suggestion, a fixed label, none, or the trimmed custom text. */
export function resolveLabel(picked: LabelChoice, customText: string, suggested: Info['client']['suggestedLabel'] | undefined): string | null {
  switch (picked) {
    case 'suggested':
      return suggested ?? null
    case 'none':
      return null
    case 'custom':
      return customText.trim() === '' ? null : customText.trim()
    default:
      return picked
  }
}

/** The shared label state, over the server's suggestion. */
export function useContextLabel(suggested: ComputedRef<Info['client']['suggestedLabel'] | undefined>) {
  return {
    choice,
    custom,
    label: computed(() => resolveLabel(choice.value, custom.value, suggested.value)),
  }
}
