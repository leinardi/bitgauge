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
import { ArrowDownWideNarrow } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import ResultCard from '@/components/history/ResultCard.vue'
import { rowView } from '@/components/history/rows'
import SelectionBar from '@/components/history/SelectionBar.vue'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Result } from '@/engine/messages'
import type { SortDirection, SortKey } from '@/history/filters'

// The History list on narrow screens (ui/screens.md section 3, responsive notes; kit History.jsx):
// the sort in force with a Sort control, the results as cards, and the selection bar floating over
// them once some are selected, with Compare.

const props = defineProps<{ results: readonly Result[]; units: 'bits' | 'bytes'; sortKey: SortKey; sortDirection: SortDirection; selected: ReadonlySet<string> }>()
const emit = defineEmits<{ sort: [{ key: SortKey; direction: SortDirection }]; toggle: [string]; open: [string]; remove: [string]; clear: []; removeSelected: []; compare: [] }>()

const { t, locale } = useI18n()

const options = computed(() => [
  { value: 'startedAt:descending', label: t('history.sort.newest') },
  { value: 'startedAt:ascending', label: t('history.sort.oldest') },
  { value: 'download:descending', label: t('history.sort.download') },
  { value: 'upload:descending', label: t('history.sort.upload') },
  { value: 'idle:ascending', label: t('history.sort.latency') },
  { value: 'grade:ascending', label: t('history.sort.grade') },
])
const current = computed(() => `${props.sortKey}:${props.sortDirection}`)
// A sort chosen from a column header on a wider screen may have no option here; the line then reads Sort.
const currentLabel = computed(() => options.value.find((option) => option.value === current.value)?.label ?? t('history.sort.label'))

function choose(value: unknown): void {
  const [key, direction] = String(value).split(':') as [SortKey, SortDirection]
  emit('sort', { key, direction })
}

const rows = computed(() => props.results.map((result) => rowView(result, props.units, locale.value)))
</script>

<template>
  <div
    class="flex flex-col gap-2"
    data-testid="history-cards"
  >
    <div class="flex items-center justify-between text-(length:--text-caption) text-subtle-foreground">
      <span>{{ currentLabel }}</span>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <AppButton
            variant="ghost"
            size="sm"
          >
            <ArrowDownWideNarrow
              :size="14"
              aria-hidden="true"
            />
            {{ t('history.sort.label') }}
          </AppButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          class="w-56 rounded-(--radius-md) border-(--border-default) bg-(--surface-2) p-1 shadow-(--shadow-pop)"
        >
          <DropdownMenuRadioGroup
            :model-value="current"
            @update:model-value="choose"
          >
            <DropdownMenuRadioItem
              v-for="option in options"
              :key="option.value"
              :value="option.value"
              class="h-(--control-h-item) text-(length:--text-sm)"
            >
              {{ option.label }}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <ResultCard
      v-for="row in rows"
      :key="row.id"
      :row="row"
      :selected="selected.has(row.id)"
      @toggle="emit('toggle', row.id)"
      @open="emit('open', row.id)"
      @remove="emit('remove', row.id)"
    />
    <SelectionBar
      v-if="selected.size > 0"
      :count="selected.size"
      floating
      @clear="emit('clear')"
      @remove="emit('removeSelected')"
      @compare="emit('compare')"
    />
  </div>
</template>
