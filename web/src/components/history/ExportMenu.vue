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
import { ChevronDown, Download, FileJson, FileText, TriangleAlert } from '@lucide/vue'
import { DropdownMenuItem } from 'reka-ui'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import { saveCsv, saveJson } from '@/components/history/exporting'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Result } from '@/engine/messages'
import { tokenPx } from '@/lib/tokenPx'

// The Export menu (ui/screens.md section 3; kit History.jsx): JSON or CSV, each for all results or
// the current filter, with the warning that the files hold client IPs, labels and notes. JSON keeps
// the full samples and imports again; CSV is a summary, one row per test.

const props = defineProps<{ all: readonly Result[]; filtered: readonly Result[] }>()
const emit = defineEmits<{ invalid: [] }>()

const { t } = useI18n()
// Kept a --space-4 inside the screen's edges, as the kit's floating panels are.
const edge = tokenPx('--space-4')

function json(results: readonly Result[]): void {
  if (!saveJson(results)) {
    emit('invalid')
  }
}

const FORMATS = [
  { key: 'json', icon: FileJson, save: json },
  { key: 'csv', icon: FileText, save: saveCsv },
] as const
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <AppButton
        size="sm"
        data-testid="export-menu"
      >
        <Download
          :size="14"
          aria-hidden="true"
        />
        {{ t('history.export.action') }}
        <ChevronDown
          :size="14"
          aria-hidden="true"
        />
      </AppButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      :side-offset="6"
      :collision-padding="edge"
      class="flex w-80 flex-col gap-0.5 rounded-(--radius-lg) border-(--border-default) bg-(--surface-2) p-1.5 shadow-(--shadow-pop)"
    >
      <DropdownMenuGroup
        v-for="format in FORMATS"
        :key="format.key"
        :aria-label="format.key === 'json' ? t('history.export.json') : t('history.export.csv')"
        class="flex flex-col gap-2 px-2.5 py-2"
      >
        <div class="flex items-start gap-2.5">
          <component
            :is="format.icon"
            :size="16"
            aria-hidden="true"
            class="mt-px text-muted-foreground"
          />
          <span class="flex flex-col gap-0.5">
            <span class="text-(length:--text-sm) font-semibold">{{ format.key === 'json' ? t('history.export.json') : t('history.export.csv') }}</span>
            <span class="text-(length:--text-caption) text-subtle-foreground">{{ format.key === 'json' ? t('history.export.jsonSub') : t('history.export.csvSub') }}</span>
          </span>
        </div>
        <div class="grid grid-cols-2 gap-1.5 pl-6.5">
          <DropdownMenuItem
            as-child
            :data-testid="`export-${format.key}-all`"
            @select="format.save(props.all)"
          >
            <AppButton
              size="sm"
              block
              class="data-highlighted:bg-(--surface-4) data-highlighted:text-foreground"
            >
              {{ t('history.export.all', { n: all.length }) }}
            </AppButton>
          </DropdownMenuItem>
          <DropdownMenuItem
            as-child
            :data-testid="`export-${format.key}-filtered`"
            @select="format.save(props.filtered)"
          >
            <AppButton
              size="sm"
              block
              class="data-highlighted:bg-(--surface-4) data-highlighted:text-foreground"
            >
              {{ t('history.export.filtered', { n: filtered.length }) }}
            </AppButton>
          </DropdownMenuItem>
        </div>
      </DropdownMenuGroup>
      <DropdownMenuSeparator class="mx-0.5 my-1 bg-(--border-subtle)" />
      <p class="flex items-start gap-2 px-2.5 pt-1.5 pb-1">
        <span class="mt-px flex flex-none text-(--warn)">
          <TriangleAlert
            :size="13"
            aria-hidden="true"
          />
        </span>
        <span class="text-(length:--text-micro) leading-(--lh-compact) text-muted-foreground">{{ t('history.export.warning') }}</span>
      </p>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
