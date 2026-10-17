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
<script setup lang="ts" generic="T extends string">
import type { Component } from 'vue'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

// The kit's Segmented (design_system/components/forms Segmented.jsx, forms.css `.seg`): two to
// four mutually exclusive choices on the shadcn-vue toggle group, one always pressed.

interface SegmentOption<V extends string> {
  value: V
  label: string
  icon?: Component
  /** The icon's color, a series color for a direction. */
  color?: string
}

defineProps<{ options: SegmentOption<T>[]; label: string; disabled?: boolean }>()
const value = defineModel<T>({ required: true })

// Pressing the pressed choice again would leave none: the choice stays.
function choose(next: unknown): void {
  if (typeof next === 'string' && next !== '') {
    value.value = next as T
  }
}
</script>

<template>
  <ToggleGroup
    type="single"
    :model-value="value"
    :aria-label="label"
    :disabled="disabled"
    class="inline-flex max-w-full flex-wrap gap-0 overflow-hidden rounded-(--radius-md) border border-(--border-default) bg-(--surface-1)"
    @update:model-value="choose"
  >
    <ToggleGroupItem
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      class="h-(--control-h-item) gap-1.5 rounded-none border-r border-(--border-subtle) px-3.5 text-(length:--text-sm) font-semibold text-muted-foreground last:border-r-0 hover:bg-transparent hover:text-foreground data-[state=on]:bg-(--primary-bg) data-[state=on]:text-primary-text data-[spacing=0]:first:rounded-none data-[spacing=0]:last:rounded-none"
    >
      <component
        :is="option.icon"
        v-if="option.icon !== undefined"
        :size="14"
        :stroke-width="option.color === undefined ? 1.75 : 2"
        :style="option.color === undefined ? undefined : { color: option.color }"
        aria-hidden="true"
      />
      {{ option.label }}
    </ToggleGroupItem>
  </ToggleGroup>
</template>
