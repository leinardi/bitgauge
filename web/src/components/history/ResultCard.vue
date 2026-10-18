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
import { Activity, ArrowDown, ArrowUp, Check } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import GradeBadge from '@/components/history/GradeBadge.vue'
import ResultStatusPill from '@/components/history/ResultStatusPill.vue'
import RowActions from '@/components/history/RowActions.vue'
import type { RowView } from '@/components/history/rows'
import StatusPill from '@/components/status/StatusPill.vue'

// A stored result as a card on narrow screens (ui/screens.md section 3, responsive notes; kit
// History.jsx): its selection, then the label, date, protocol and grade over download, upload and
// latency, linking to its detail, and the action menu. Every control is 44 px for touch.

const props = defineProps<{ row: RowView; selected: boolean }>()
const emit = defineEmits<{ toggle: []; open: []; remove: [] }>()

const { t } = useI18n()
const DASH = '—'
const SEPARATOR = ' · '
const name = computed(() => (props.row.label === '' ? t('history.table.noLabel') : props.row.label))
</script>

<template>
  <div
    class="flex items-stretch rounded-(--radius-lg) border"
    :class="selected ? 'tinted border-(--primary-border) bg-(--primary-bg) [--fg-subtle:var(--fg-muted)]' : 'border-(--border-subtle) bg-(--surface-2)'"
    data-testid="history-card"
  >
    <button
      type="button"
      role="checkbox"
      :aria-checked="selected"
      :aria-label="t('history.table.selectRow', { label: name, date: row.date })"
      class="flex min-h-11 w-11 flex-none cursor-pointer justify-center pt-3.5"
      @click="emit('toggle')"
    >
      <span
        v-if="selected"
        class="flex size-4.5 items-center justify-center rounded-[4px] bg-primary text-primary-foreground"
      >
        <Check
          :size="12"
          :stroke-width="3"
          aria-hidden="true"
        />
      </span>
      <span
        v-else
        class="block size-4.5 rounded-[4px] border-[1.5px] border-(--border-strong)"
      />
    </button>
    <RouterLink
      :to="`/result/${encodeURIComponent(row.id)}`"
      class="flex min-h-11 min-w-0 flex-1 flex-col gap-2.5 py-3 text-foreground no-underline"
    >
      <span class="flex items-center gap-2">
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            class="truncate text-(length:--text-sm) font-semibold"
            :class="{ 'text-subtle-foreground': row.label === '' }"
          >{{ name }}</span>
          <span class="font-mono text-(length:--text-micro) text-subtle-foreground"><time :datetime="row.startedAt">{{ row.date }}</time>{{ row.protocol === '' ? '' : `${SEPARATOR}${row.protocol}` }}</span>
        </span>
        <StatusPill
          v-if="row.lowConfidence"
          tone="warn"
        >{{ t('history.table.lowConfidence') }}</StatusPill>
        <ResultStatusPill
          v-if="row.status !== 'complete'"
          :status="row.status"
        />
        <GradeBadge
          :grade="row.grade"
          large
        />
      </span>
      <span class="grid grid-cols-3 gap-2 font-mono text-(length:--text-sm)">
        <span class="flex items-center gap-1">
          <ArrowDown
            :size="12"
            :stroke-width="2.25"
            aria-hidden="true"
            class="text-primary-text"
          />
          {{ row.download?.number ?? DASH }}
          <span class="text-(length:--text-nano) text-subtle-foreground">{{ row.download?.unit }}</span>
        </span>
        <span class="flex items-center gap-1">
          <ArrowUp
            :size="12"
            :stroke-width="2.25"
            aria-hidden="true"
            class="text-(--series-upload)"
          />
          {{ row.upload?.number ?? DASH }}
          <span class="text-(length:--text-nano) text-subtle-foreground">{{ row.upload?.unit }}</span>
        </span>
        <span class="flex items-center gap-1">
          <Activity
            :size="12"
            :stroke-width="2.25"
            aria-hidden="true"
            class="text-(--series-latency)"
          />
          {{ row.latency ?? DASH }}
          <span
            v-if="row.latency !== null"
            class="text-(length:--text-nano) text-subtle-foreground"
          >{{ t('history.table.ms') }}</span>
        </span>
      </span>
    </RouterLink>
    <RowActions
      :name="name"
      touch
      @open="emit('open')"
      @remove="emit('remove')"
    />
  </div>
</template>
