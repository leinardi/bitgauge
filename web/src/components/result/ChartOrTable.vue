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
import type { Component } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import SegmentedControl from '@/components/settings/SegmentedControl.vue'

// A Result detail chart's card (design_system/components/charts PhaseChart.jsx, charts.css
// .pchart): the title with its icon, the meta line, the loaded latency's legend while the chart
// shows, and the Chart or table toggle (ui/screens.md section 2), then the chart with its key, the
// warm-up and the gaps, or the table that is its text alternative.

const props = defineProps<{
  title: string
  icon: Component
  /** The icon's color token. */
  color: string
  meta: string
  /** The chart draws the loaded latency on its second scale. */
  latency: boolean
  warmup: string | null
  gap: string | null
}>()
const view = defineModel<'chart' | 'table'>({ required: true })

const { t } = useI18n()
const options = computed(() => [
  { value: 'chart' as const, label: t('result.charts.chart') },
  { value: 'table' as const, label: t('result.charts.table') },
])
const keyed = computed(() => props.warmup !== null || props.gap !== null)
</script>

<template>
  <section
    class="flex min-w-0 flex-col gap-2.5 rounded-(--radius-lg) border border-border bg-card px-4 pt-3.5 pb-3 shadow-card"
    :aria-label="title"
  >
    <div class="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
      <h3 class="flex items-center gap-1.5 text-(length:--text-sm) font-semibold">
        <component
          :is="icon"
          :size="14"
          :stroke-width="2"
          aria-hidden="true"
          :style="{ color }"
        />
        {{ title }}
      </h3>
      <span
        v-if="meta"
        class="font-mono text-(length:--text-caption) text-subtle-foreground"
      >{{ meta }}</span>
      <span
        v-if="latency && view === 'chart'"
        class="ml-auto flex items-center gap-1.5 text-(length:--text-caption) text-muted-foreground"
      ><span
        aria-hidden="true"
        class="w-(--legend-swatch-w) border-t-(length:--legend-stroke) border-dashed border-(--series-latency)"
      />{{ t('result.charts.latency') }}</span>
      <SegmentedControl
        v-model="view"
        size="sm"
        :options="options"
        :label="t('result.charts.view', { title })"
        :class="latency && view === 'chart' ? '' : 'ml-auto'"
      />
    </div>
    <template v-if="view === 'chart'">
      <slot name="chart" />
      <div
        v-if="keyed"
        class="flex flex-wrap gap-x-3.5 gap-y-1 text-(length:--text-micro) text-subtle-foreground"
      >
        <span
          v-if="warmup"
          class="flex items-center gap-1.5"
        ><span
          aria-hidden="true"
          class="h-(--legend-swatch-h) w-(--legend-swatch-w) border-r border-chart-hatch bg-[repeating-linear-gradient(var(--chart-hatch-angle),var(--chart-hatch)_0_var(--border-width),transparent_var(--border-width)_var(--chart-hatch-pitch))]"
        />{{ warmup }}</span>
        <span
          v-if="gap"
          class="flex items-center gap-1.5"
        ><span
          aria-hidden="true"
          class="h-(--legend-swatch-h) w-(--legend-swatch-w) border-x border-dashed border-chart-hatch"
        />{{ gap }}</span>
      </div>
    </template>
    <slot
      v-else
      name="table"
    />
  </section>
</template>
