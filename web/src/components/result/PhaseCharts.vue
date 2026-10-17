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
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'

import { chartCards } from '@/components/result/charts'
import ChartOrTable from '@/components/result/ChartOrTable.vue'
import PhaseChart from '@/components/result/PhaseChart.vue'
import WindowTable from '@/components/result/WindowTable.vue'
import type { Result } from '@/engine/messages'

// The per-phase charts (ui/screens.md section 2, kit ResultDetail.jsx): the directions side by side
// on wide screens and the idle latency across both, stacked on narrow ones; each toggles between its
// chart and its table on its own.

const props = defineProps<{ result: Result; units: 'bits' | 'bytes' }>()

const { t, locale } = useI18n()
const cards = computed(() => chartCards(props.result, props.units, { t, locale: locale.value }))
const directions = computed(() => cards.value.filter((card) => card.key !== 'idle').length)
const views = reactive<Record<string, 'chart' | 'table'>>({})
</script>

<template>
  <div
    v-if="cards.length > 0"
    class="grid grid-cols-1 gap-3 desktop:grid-cols-2"
  >
    <ChartOrTable
      v-for="card in cards"
      :key="card.key"
      :model-value="views[card.key] ?? 'chart'"
      :title="card.title"
      :icon="card.icon"
      :color="card.color"
      :meta="card.meta"
      :latency="card.model.latency !== null"
      :warmup="card.warmup"
      :gap="card.gap"
      :class="card.key === 'idle' || directions === 1 ? 'desktop:col-span-2' : ''"
      :data-testid="`chart-card-${card.key}`"
      @update:model-value="(view) => (views[card.key] = view)"
    >
      <template #chart>
        <PhaseChart
          :model="card.model"
          :kind="card.key === 'idle' ? 'latency' : 'rate'"
          :units="units"
          :color="card.key === 'idle' ? 'latency' : card.key"
          :summary="card.summary"
          :short="card.key === 'idle'"
        />
      </template>
      <template #table>
        <WindowTable v-bind="card.table" />
      </template>
    </ChartOrTable>
  </div>
</template>
