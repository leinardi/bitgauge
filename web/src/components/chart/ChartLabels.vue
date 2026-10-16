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
import type { ChartGeometry, Label } from '@/components/chart/geometry'

// A chart's text over its plot (design_system/components/charts.css .chart-lb): the value labels
// left of their gridlines, the time labels under their ticks, each phase's name at its start and
// each mark's label left of its line. Text in the page, not on the canvas, so it renders with the
// page's fonts; hidden from assistive technology, which reads the chart's summary instead.

defineProps<{
  geometry: ChartGeometry
  /** Phase names, from where each phase starts. */
  phases?: readonly Label[]
  /** Mark labels, ending at their line, in the mark's color. */
  marks?: readonly (Label & { color: string })[]
}>()

const at = (label: Label) => ({ left: `${label.x}px`, top: `${label.y}px` })
</script>

<template>
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 font-mono text-(length:--text-nano) text-subtle-foreground"
  >
    <span
      v-for="(line, index) in geometry.grid"
      :key="`y${index}`"
      class="absolute -translate-x-full translate-y-(--chart-label-anchor) whitespace-nowrap"
      :style="at(line.label)"
    >{{ line.label.text }}</span>
    <span
      v-for="(tick, index) in geometry.ticks"
      :key="`x${index}`"
      class="absolute -translate-x-1/2 translate-y-(--chart-label-anchor) whitespace-nowrap"
      :style="at(tick)"
    >{{ tick.text }}</span>
    <span
      v-for="(phase, index) in phases"
      :key="`p${index}`"
      class="absolute translate-y-(--chart-label-anchor) font-condensed font-semibold tracking-(--tracking-caps) whitespace-nowrap uppercase"
      :style="at(phase)"
    >{{ phase.text }}</span>
    <span
      v-for="(mark, index) in marks"
      :key="`m${index}`"
      class="absolute -translate-x-full translate-y-(--chart-label-anchor) font-sans text-(length:--text-micro) font-semibold whitespace-nowrap"
      :style="{ ...at(mark), color: mark.color }"
    >{{ mark.text }}</span>
  </div>
</template>
