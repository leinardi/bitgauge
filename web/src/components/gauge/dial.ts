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

import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'

import { arcPath } from '@/components/gauge/scale'

// The dial's geometry (design_system/components/gauge.md): 300 px, 272 in the compact layout, drawn
// at its size so strokes and ticks keep theirs; the ring runs 10 px inside the edge.
export function useDial() {
  const compact = useMediaQuery('(max-width: 1139.98px)')
  const size = computed(() => (compact.value ? 272 : 300))
  const center = computed(() => size.value / 2)
  const radius = computed(() => size.value / 2 - 10)
  const track = computed(() => arcPath(center.value, center.value, radius.value, 0, 1))
  return { size, center, radius, track }
}
