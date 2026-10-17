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
import { RadioGroupItem, RadioGroupRoot } from 'reka-ui'
import type { Component } from 'vue'

// The kit's Segmented (design_system/components/forms Segmented.jsx, forms.css `.seg`): two to
// four mutually exclusive choices, a radio group as the kit's is, one always checked; `sm` is the
// kit's `.seg-sm`, on the raised surface.

interface SegmentOption<V extends string> {
  value: V
  label: string
  icon?: Component
  /** The icon's color, a series color for a direction. */
  color?: string
}

defineProps<{ options: SegmentOption<T>[]; label: string; disabled?: boolean; size?: 'sm' | 'md' }>()
const value = defineModel<T>({ required: true })

function choose(next: unknown): void {
  if (typeof next === 'string' && next !== '') {
    value.value = next as T
  }
}
</script>

<template>
  <RadioGroupRoot
    :model-value="value"
    :aria-label="label"
    :disabled="disabled"
    orientation="horizontal"
    class="inline-flex max-w-full flex-wrap gap-0 overflow-hidden rounded-(--radius-md) border border-(--border-default)"
    :class="size === 'sm' ? 'bg-(--surface-2)' : 'bg-(--surface-1)'"
    @update:model-value="choose"
  >
    <RadioGroupItem
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      class="inline-flex flex-none cursor-pointer items-center gap-1.5 border-r border-(--border-subtle) font-semibold whitespace-nowrap text-muted-foreground outline-none last:border-r-0 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:bg-(--primary-bg) data-[state=checked]:text-primary-text"
      :class="size === 'sm' ? 'h-(--control-h-sm) px-2.5 text-(length:--text-caption)' : 'h-(--control-h-item) px-3.5 text-(length:--text-sm)'"
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
    </RadioGroupItem>
  </RadioGroupRoot>
</template>
