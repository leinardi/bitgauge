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

// A titled card of label and value rows (design_system/components/layout MetaList with a title):
// the eyebrow, then a definition list whose values are mono and "—" in the subtle color when
// there is none. The rows stack in one column, and take `columns` from the desktop breakpoint.

export interface MetaRow {
  key: string
  icon: Component
  label: string
  /** The qualifier under the label. */
  sub?: string
  value?: string | null
}

const props = defineProps<{ title: string; rows: MetaRow[]; columns?: 1 | 3 | 4 }>()

const COLUMNS = { 1: '', 3: 'desktop:grid-cols-3', 4: 'desktop:grid-cols-4' } as const
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1.5 rounded-(--radius-lg) border border-border bg-card px-3.5 py-3 shadow-card desktop:px-4.5 desktop:py-4">
    <span class="font-(family-name:--font-cond) text-(length:--text-micro) leading-(--lh-snug) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">{{ title }}</span>
    <dl
      class="m-0 grid grid-cols-1 gap-x-6"
      :class="COLUMNS[props.columns ?? 1]"
    >
      <div
        v-for="row in rows"
        :key="row.key"
        class="flex min-h-(--list-row-h) items-center gap-2.5 border-b border-border"
      >
        <span
          class="inline-flex text-subtle-foreground"
          aria-hidden="true"
        >
          <component
            :is="row.icon"
            :size="15"
          />
        </span>
        <!-- The label keeps its words' width and a long value wraps beside it (design-system-upstream.md). -->
        <dt class="flex flex-1 flex-col">
          <span class="text-(length:--text-sm) text-foreground">{{ row.label }}</span>
          <span
            v-if="row.sub"
            class="text-(length:--text-micro) leading-(--lh-compact) text-pretty text-subtle-foreground"
          >{{ row.sub }}</span>
        </dt>
        <dd
          class="m-0 min-w-0 text-right font-mono text-(length:--text-sm) wrap-break-word"
          :class="row.value == null ? 'text-subtle-foreground' : 'text-foreground'"
        >
          {{ row.value ?? $t('test.tiles.empty') }}
        </dd>
      </div>
    </dl>
  </div>
</template>
