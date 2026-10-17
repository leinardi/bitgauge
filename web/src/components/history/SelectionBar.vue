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
import { GitCompare, Info, Trash2, X } from '@lucide/vue'
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'

// The selection bar (ui/screens.md section 3; kit History.jsx) once rows are selected: the count,
// what it holds (its days, after the label two results share), Clear selection, Delete selected,
// which removes the rows at once with an undo toast, and Compare, which opens the compare view for
// exactly two. Compare stays in the tab order with any other count, marked unavailable and
// described by the hint that says why. At the foot of the table on wider screens; on narrow ones
// it floats over the cards, with touch-sized buttons and the hint kept out of sight, as the kit's.

const props = defineProps<{ count: number; summary?: string; floating?: boolean }>()
const emit = defineEmits<{ clear: []; remove: []; compare: [] }>()

const { t } = useI18n()
const hintId = useId()
const comparable = computed(() => props.count === 2)

function compare(): void {
  if (comparable.value) {
    emit('compare')
  }
}
</script>

<template>
  <div
    v-if="floating"
    role="toolbar"
    :aria-label="t('history.selection.label')"
    class="sticky bottom-3 flex items-center gap-1 rounded-(--radius-lg) border border-(--border-default) bg-(--surface-3) py-1.5 pr-1.5 pl-3.5 shadow-(--shadow-md)"
    data-testid="selection-bar"
  >
    <span class="mr-auto text-(length:--text-sm) font-semibold">{{ t('history.selection.count', { n: count }) }}</span>
    <AppButton
      variant="ghost"
      class="size-11 justify-center px-0"
      :aria-label="t('history.selection.clear')"
      @click="emit('clear')"
    >
      <X
        :size="15"
        aria-hidden="true"
      />
    </AppButton>
    <AppButton
      variant="ghost"
      class="size-11 justify-center px-0 text-(--danger-fg)"
      :aria-label="t('history.selection.delete')"
      @click="emit('remove')"
    >
      <Trash2
        :size="15"
        aria-hidden="true"
      />
    </AppButton>
    <span
      :id="hintId"
      class="sr-only"
    >{{ t('history.selection.compareHint') }}</span>
    <AppButton
      variant="primary"
      class="h-11"
      :aria-disabled="!comparable"
      :aria-describedby="comparable ? undefined : hintId"
      data-testid="compare"
      @click="compare"
    >
      <GitCompare
        :size="15"
        aria-hidden="true"
      />
      {{ t('history.selection.compare') }}
    </AppButton>
  </div>
  <div
    v-else
    role="toolbar"
    :aria-label="t('history.selection.label')"
    class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-(--border-default) bg-(--surface-1) px-3.5 py-2.5"
    data-testid="selection-bar"
  >
    <span class="text-(length:--text-sm) font-semibold">{{ t('history.selection.count', { n: count }) }}</span>
    <span
      v-if="summary"
      class="text-(length:--text-caption) text-subtle-foreground"
    >{{ summary }}</span>
    <div class="ml-auto flex flex-wrap items-center gap-2">
      <span
        :id="hintId"
        class="flex items-center gap-1.5 text-(length:--text-caption) text-muted-foreground"
        :class="{ hidden: comparable }"
      >
        <Info
          :size="13"
          aria-hidden="true"
        />
        {{ t('history.selection.compareHint') }}
      </span>
      <AppButton
        variant="ghost"
        size="sm"
        @click="emit('clear')"
      >
        {{ t('history.selection.clear') }}
      </AppButton>
      <AppButton
        variant="danger"
        size="sm"
        data-testid="delete-selected"
        @click="emit('remove')"
      >
        <Trash2
          :size="14"
          aria-hidden="true"
        />
        {{ t('history.selection.delete') }}
      </AppButton>
      <AppButton
        variant="primary"
        size="sm"
        :aria-disabled="!comparable"
        :aria-describedby="comparable ? undefined : hintId"
        data-testid="compare"
        @click="compare"
      >
        <GitCompare
          :size="14"
          aria-hidden="true"
        />
        {{ t('history.selection.compare') }}
      </AppButton>
    </div>
  </div>
</template>
