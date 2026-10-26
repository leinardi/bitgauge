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
import type { LegendEntry } from '@/components/chart/text'

// Over a live chart: its title, its legend and where the run stands (design_system/components/charts.md).
// The loaded latency's legend entry is its toggle (ui/screens.md section 1): a button, pressed while
// the series is drawn, whose swatch is dashed as the line is, and struck through while off.

withDefaults(defineProps<{ title: string; legend: readonly LegendEntry[]; meta: string; latencyShown?: boolean }>(), { latencyShown: true })
const emit = defineEmits<{ toggleLatency: [] }>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <span class="text-(length:--text-base) font-semibold">{{ title }}</span>
    <div class="flex flex-wrap gap-x-3.5 gap-y-1.5">
      <component
        :is="entry.key === 'latency' ? 'button' : 'span'"
        v-for="entry in legend"
        :key="entry.key"
        :type="entry.key === 'latency' ? 'button' : undefined"
        :aria-pressed="entry.key === 'latency' ? latencyShown : undefined"
        class="flex items-center gap-1.5 text-(length:--text-caption) text-muted-foreground"
        :class="entry.key === 'latency' ? 'cursor-pointer hover:text-foreground max-tablet:min-h-6 aria-[pressed=false]:line-through focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring' : ''"
        :data-testid="entry.key === 'latency' ? 'latency-toggle' : undefined"
        @click="entry.key === 'latency' ? emit('toggleLatency') : undefined"
      >
        <span
          v-if="entry.band"
          aria-hidden="true"
          class="h-(--legend-swatch-h) w-(--legend-band-w) border-x border-chart-hatch bg-(--chart-band)"
        />
        <span
          v-else
          aria-hidden="true"
          class="h-0 w-(--legend-swatch-w) border-t-2"
          :class="{ 'opacity-40': entry.faint || (entry.key === 'latency' && !latencyShown), 'border-dashed': entry.dashed }"
          :style="{ borderTopColor: entry.color }"
        />
        {{ entry.label }}
      </component>
    </div>
    <span
      v-if="meta"
      class="ml-auto font-mono text-(length:--text-caption) text-subtle-foreground"
      data-testid="chart-meta"
    >{{ meta }}</span>
  </div>
</template>
