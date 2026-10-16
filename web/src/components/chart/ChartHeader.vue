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

defineProps<{ title: string; legend: readonly LegendEntry[]; meta: string }>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <span class="text-(length:--text-base) font-semibold">{{ title }}</span>
    <div class="flex flex-wrap gap-x-3.5 gap-y-1.5">
      <span
        v-for="entry in legend"
        :key="entry.key"
        class="flex items-center gap-1.5 text-(length:--text-caption) text-muted-foreground"
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
          :class="{ 'opacity-40': entry.faint }"
          :style="{ borderTopColor: entry.color }"
        />
        {{ entry.label }}
      </span>
    </div>
    <span
      v-if="meta"
      class="ml-auto font-mono text-(length:--text-caption) text-subtle-foreground"
      data-testid="chart-meta"
    >{{ meta }}</span>
  </div>
</template>
