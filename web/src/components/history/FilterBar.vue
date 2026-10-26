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
import { Search } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import DateRangePicker from '@/components/history/DateRangePicker.vue'
import { Input } from '@/components/ui/input'
import type { Result } from '@/engine/messages'
import { chips, type DateRange, type HistoryFilter } from '@/history/filters'

// The History filters (ui/screens.md section 3; kit History.jsx, Chip in design_system/components
// status): chips by context label and by label, each with its count over the stored results and
// pressed while selected, one more chip for no filter; the date range; and a search over labels and
// notes. The page keeps the filter in the query string.

const props = defineProps<{ filter: HistoryFilter; results: readonly Result[]; now: Date }>()
const emit = defineEmits<{ 'update:filter': [HistoryFilter] }>()

const { t } = useI18n()

type Group = 'contexts' | 'labels'

const groups = computed(() => [
  { key: 'contexts' as const, title: t('history.filters.context'), aria: t('history.filters.contextGroup'), none: t('history.filters.allContexts'), chips: chips(props.results, 'context') },
  { key: 'labels' as const, title: t('history.filters.label'), aria: t('history.filters.labelGroup'), none: t('history.filters.anyLabel'), chips: chips(props.results, 'label') },
])

function toggle(group: Group, value: string): void {
  const selected = props.filter[group]
  emit('update:filter', { ...props.filter, [group]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value] })
}

function clear(group: Group): void {
  emit('update:filter', { ...props.filter, [group]: [] })
}

function search(value: string | number): void {
  emit('update:filter', { ...props.filter, q: String(value) })
}

function range(next: DateRange): void {
  emit('update:filter', { ...props.filter, range: next })
}

const CHIP =
  'inline-flex h-(--chip-h) max-w-full flex-none cursor-pointer items-center gap-1.5 rounded-full border border-(--border-default) bg-(--surface-2) px-3 text-(length:--text-sm) font-semibold whitespace-nowrap text-muted-foreground hover:bg-(--surface-3) hover:text-foreground aria-pressed:border-(--primary-border) aria-pressed:bg-(--primary-bg) aria-pressed:text-primary-text'
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-x-2.5 gap-y-2"
    data-testid="history-filters"
  >
    <div class="flex max-w-full min-w-0 flex-col gap-2">
      <div
        v-for="group in groups"
        :key="group.key"
        role="group"
        :aria-label="group.aria"
        class="flex max-w-full items-center gap-1.5 overflow-x-auto tablet:flex-wrap"
      >
        <span
          aria-hidden="true"
          class="w-14 flex-none font-(family-name:--font-cond) text-(length:--text-micro) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase"
        >{{ group.title }}</span>
        <button
          type="button"
          :class="CHIP"
          :aria-pressed="filter[group.key].length === 0"
          @click="clear(group.key)"
        >
          {{ group.none }}
          <span class="font-mono text-(length:--text-micro) opacity-(--opacity-hint)">{{ results.length }}</span>
        </button>
        <button
          v-for="chip in group.chips"
          :key="chip.value"
          type="button"
          :class="CHIP"
          :aria-pressed="filter[group.key].includes(chip.value)"
          :data-testid="`chip-${group.key}`"
          :title="chip.value"
          @click="toggle(group.key, chip.value)"
        >
          <!-- A label of up to 64 characters is cut to the row with an ellipsis; its name stays whole. -->
          <span class="min-w-0 truncate">{{ chip.value }}</span>
          <span class="font-mono text-(length:--text-micro) opacity-(--opacity-hint)">{{ chip.count }}</span>
        </button>
      </div>
    </div>
    <div class="flex flex-wrap gap-2 max-tablet:w-full tablet:ml-auto">
      <DateRangePicker
        :range="filter.range"
        :results="results"
        :now="now"
        @update:range="range"
      />
      <div class="relative w-55 max-w-full min-w-0 max-tablet:w-auto max-tablet:flex-1 max-tablet:basis-40">
        <Search
          :size="14"
          aria-hidden="true"
          class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle-foreground"
        />
        <Input
          type="search"
          :model-value="filter.q"
          :placeholder="t('history.filters.searchPlaceholder')"
          :aria-label="t('history.filters.search')"
          class="h-(--control-h-sm) pl-8 text-(length:--text-sm)"
          data-testid="history-search"
          @update:model-value="search"
        />
      </div>
    </div>
  </div>
</template>
