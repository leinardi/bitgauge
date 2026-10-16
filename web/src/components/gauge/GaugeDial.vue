<!--
  This file is part of BitGauge.

  Copyright (c) 2026 Roberto Leinardi

  BitGauge is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  BitGauge is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
-->
<script setup lang="ts">
import { computed } from 'vue'

import { useDial } from '@/components/gauge/dial'
import { angle, point, type Scale, ticks } from '@/components/gauge/scale'

// The dial both faces of the gauge draw (design_system/components/gauge.md, Anatomy): the track,
// the scale's ticks and the labels of its major ticks. What sits on the track comes in the `arcs`
// slot, inside the SVG; the readout in the default slot, over the dial. Attributes go to the SVG.

defineOptions({ inheritAttrs: false })

const props = defineProps<{ scale: Scale; mode: 'rate' | 'ms' }>()

const { size, center, radius, track } = useDial()

function compact(value: number): string {
  if (props.mode === 'ms') {
    return String(value)
  }
  for (const [unit, prefix] of [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
  ] as const) {
    if (value >= unit) {
      return `${value / unit}${prefix}`
    }
  }
  return String(value)
}

const tickMarks = computed(() =>
  ticks(props.scale).map((tick) => {
    const degrees = angle(tick.at)
    const label = point(center.value, center.value, radius.value - 36, degrees)
    return {
      key: tick.value,
      from: point(center.value, center.value, radius.value - 14, degrees),
      to: point(center.value, center.value, radius.value - (tick.major ? 22 : 18), degrees),
      major: tick.major,
      label: tick.major ? { x: label.x, y: label.y + 4, text: compact(tick.value) } : null,
    }
  }),
)
</script>

<template>
  <div
    class="relative"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <svg
      v-bind="$attrs"
      :viewBox="`0 0 ${size} ${size}`"
      :width="size"
      :height="size"
      class="block overflow-visible"
      aria-hidden="true"
    >
      <path
        :d="track"
        fill="none"
        stroke="var(--surface-3)"
        stroke-width="10"
        stroke-linecap="round"
      />
      <g
        v-for="tick in tickMarks"
        :key="tick.key"
      >
        <line
          :x1="tick.from.x"
          :y1="tick.from.y"
          :x2="tick.to.x"
          :y2="tick.to.y"
          stroke="var(--fg-faint)"
          :stroke-width="tick.major ? 1.5 : 1"
          :opacity="tick.major ? 1 : 0.6"
        />
      </g>
      <slot name="arcs" />
    </svg>
    <template
      v-for="tick in tickMarks"
      :key="tick.key"
    >
      <span
        v-if="tick.label"
        aria-hidden="true"
        data-testid="gauge-tick"
        class="absolute -translate-x-1/2 translate-y-(--gauge-tick-anchor) font-mono text-(length:--text-micro) whitespace-nowrap text-subtle-foreground"
        :style="{ left: `${tick.label.x}px`, top: `${tick.label.y}px` }"
      >{{ tick.label.text }}</span>
    </template>
    <slot />
  </div>
</template>
