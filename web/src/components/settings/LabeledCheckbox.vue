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
import { Check } from '@lucide/vue'
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'
import type { Component } from 'vue'

// A checkbox whose label is part of the control, as the kit's Checkbox (components/forms/
// Checkbox.jsx): one button holding the box, the optional icon and the label, so the label is its
// name and is not read again beside it.

defineProps<{ disabled?: boolean; icon?: Component; iconColor?: string }>()
const checked = defineModel<boolean>({ required: true })
</script>

<template>
  <CheckboxRoot
    v-model="checked"
    :disabled="disabled"
    class="group inline-flex min-h-(--control-h-item) cursor-pointer items-center gap-2 text-left focus-visible:rounded-(--radius-xs) disabled:cursor-not-allowed disabled:opacity-45"
  >
    <span
      class="flex size-(--check-size) flex-none items-center justify-center rounded-(--radius-xs) border-(length:--border-width-strong) border-(--border-strong) text-primary-foreground group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary"
      aria-hidden="true"
    >
      <CheckboxIndicator class="flex">
        <Check
          :size="12"
          :stroke-width="3"
        />
      </CheckboxIndicator>
    </span>
    <span
      v-if="icon"
      class="inline-flex"
      :style="iconColor ? { color: iconColor } : undefined"
    >
      <component
        :is="icon"
        :size="14"
        :stroke-width="2"
        aria-hidden="true"
      />
    </span>
    <span><slot /></span>
  </CheckboxRoot>
</template>
