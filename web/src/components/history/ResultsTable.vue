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
import { ChevronDown, ChevronUp } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import GradeBadge from '@/components/history/GradeBadge.vue'
import ResultStatusPill from '@/components/history/ResultStatusPill.vue'
import RowActions from '@/components/history/RowActions.vue'
import { rowView } from '@/components/history/rows'
import StatusPill from '@/components/status/StatusPill.vue'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Result } from '@/engine/messages'
import type { SortDirection, SortKey } from '@/history/filters'

// The History list on wider screens (ui/screens.md section 3; kit History.jsx, Table in
// design_system/components/layout): every column sortable, the sorted header carrying aria-sort; a
// checkbox per row; on a focused row Space toggles its selection and Enter opens it, as a click on
// the row does; and the row's action menu. The selection bar sits at the card's foot.

const props = defineProps<{ results: readonly Result[]; units: 'bits' | 'bytes'; sortKey: SortKey; sortDirection: SortDirection; selected: ReadonlySet<string> }>()
const emit = defineEmits<{ sort: [SortKey]; toggle: [string]; open: [string]; remove: [string] }>()

const { t, locale } = useI18n()
const DASH = '—'

const columns = computed(() => [
  { key: 'startedAt' as const, label: t('history.table.columns.startedAt'), numeric: false },
  { key: 'label' as const, label: t('history.table.columns.label'), numeric: false },
  { key: 'contextLabel' as const, label: t('history.table.columns.contextLabel'), numeric: false },
  { key: 'protocol' as const, label: t('history.table.columns.protocol'), numeric: false },
  { key: 'status' as const, label: t('history.table.columns.status'), numeric: false },
  { key: 'download' as const, label: t('history.table.columns.download'), numeric: true },
  { key: 'upload' as const, label: t('history.table.columns.upload'), numeric: true },
  { key: 'idle' as const, label: t('history.table.columns.idle'), numeric: true },
  { key: 'jitter' as const, label: t('history.table.columns.jitter'), numeric: true },
  { key: 'grade' as const, label: t('history.table.columns.grade'), numeric: false },
])

const rows = computed(() => props.results.map((result) => rowView(result, props.units, locale.value)))

function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
  return key === props.sortKey ? props.sortDirection : 'none'
}

function name(label: string): string {
  return label === '' ? t('history.table.noLabel') : label
}

function keydown(event: KeyboardEvent, id: string): void {
  // Only the row itself: a key on its checkbox, link or menu does what that control does.
  if (event.target !== event.currentTarget) {
    return
  }
  if (event.key === ' ') {
    event.preventDefault()
    emit('toggle', id)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    emit('open', id)
  }
}

const HEAD = 'sticky top-0 h-auto bg-(--surface-2) px-3.5 py-2.5 font-(family-name:--font-cond) text-(length:--text-micro) font-semibold tracking-(--tracking-caps-tight) text-subtle-foreground uppercase'
const CELL = 'px-3.5 py-(--density-cell-padding-y) text-(length:--text-sm)'
const NUMBER = 'text-right font-mono tabular-nums'
const UNIT = 'text-(length:--text-micro) text-subtle-foreground'
</script>

<template>
  <section
    :aria-label="t('history.table.results')"
    class="relative overflow-hidden rounded-(--radius-lg) border border-(--border-subtle) bg-(--surface-2) shadow-card"
    data-testid="history-table"
  >
    <Table class="border-collapse">
      <TableHeader class="[&_tr]:border-(--border-default)">
        <TableRow class="hover:bg-transparent">
          <TableHead :class="[HEAD, 'w-9']">
            <span class="sr-only">{{ t('history.table.select') }}</span>
          </TableHead>
          <TableHead
            v-for="column in columns"
            :key="column.key"
            :aria-sort="ariaSort(column.key)"
            :class="[HEAD, column.numeric ? 'text-right' : column.key === 'grade' ? 'text-center' : '']"
          >
            <button
              type="button"
              class="inline-flex cursor-pointer items-center gap-1 uppercase"
              :class="column.key === sortKey ? 'text-primary-text' : 'text-subtle-foreground hover:text-foreground'"
              :data-testid="`sort-${column.key}`"
              @click="emit('sort', column.key)"
            >
              {{ column.label }}
              <component
                :is="sortDirection === 'ascending' ? ChevronUp : ChevronDown"
                v-if="column.key === sortKey"
                :size="12"
                aria-hidden="true"
              />
            </button>
          </TableHead>
          <TableHead :class="[HEAD, 'w-10']" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow
          v-for="row in rows"
          :key="row.id"
          tabindex="0"
          :data-selected="selected.has(row.id)"
          class="cursor-pointer border-(--border-subtle) hover:bg-(--surface-1) data-[selected=true]:bg-(--primary-bg)"
          data-testid="history-row"
          @click="emit('open', row.id)"
          @keydown="keydown($event, row.id)"
        >
          <TableCell
            :class="[CELL, '[&:has([role=checkbox])]:pr-3.5']"
            @click.stop
          >
            <Checkbox
              :model-value="selected.has(row.id)"
              :aria-label="t('history.table.selectRow', { label: name(row.label), date: row.date })"
              data-testid="row-select"
              @update:model-value="emit('toggle', row.id)"
            />
          </TableCell>
          <TableCell :class="[CELL, 'font-mono text-(length:--text-caption) whitespace-nowrap text-muted-foreground']">
            <time :datetime="row.startedAt">{{ row.date }}</time>
          </TableCell>
          <TableCell :class="[CELL, 'whitespace-normal']">
            <span class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <RouterLink
                :to="`/result/${encodeURIComponent(row.id)}`"
                class="font-medium text-foreground no-underline hover:underline"
                :class="{ 'text-subtle-foreground': row.label === '' }"
                @click.stop
              >{{ name(row.label) }}</RouterLink>
              <StatusPill
                v-if="row.lowConfidence"
                tone="warn"
              >{{ t('history.table.lowConfidence') }}</StatusPill>
            </span>
          </TableCell>
          <TableCell :class="[CELL, 'text-muted-foreground']">
            {{ row.contextLabel || DASH }}
          </TableCell>
          <TableCell :class="[CELL, 'font-mono text-(length:--text-caption) whitespace-nowrap text-muted-foreground']">
            {{ row.protocol || DASH }}
          </TableCell>
          <TableCell :class="CELL">
            <ResultStatusPill :status="row.status" />
          </TableCell>
          <TableCell :class="[CELL, NUMBER]">
            {{ row.download?.number ?? DASH }} <span :class="UNIT">{{ row.download?.unit }}</span>
          </TableCell>
          <TableCell :class="[CELL, NUMBER]">
            {{ row.upload?.number ?? DASH }} <span :class="UNIT">{{ row.upload?.unit }}</span>
          </TableCell>
          <TableCell :class="[CELL, NUMBER]">
            {{ row.latency ?? DASH }} <span
              v-if="row.latency !== null"
              :class="UNIT"
            >{{ t('history.table.ms') }}</span>
          </TableCell>
          <TableCell :class="[CELL, NUMBER]">
            {{ row.jitter ?? DASH }} <span
              v-if="row.jitter !== null"
              :class="UNIT"
            >{{ t('history.table.ms') }}</span>
          </TableCell>
          <TableCell :class="[CELL, 'text-center']">
            <GradeBadge :grade="row.grade" />
          </TableCell>
          <TableCell
            :class="CELL"
            @click.stop
          >
            <RowActions
              :name="name(row.label)"
              @open="emit('open', row.id)"
              @remove="emit('remove', row.id)"
            />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <slot name="footer" />
  </section>
</template>
