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
import ChangedMark from '@/components/settings/ChangedMark.vue'

// One row of a settings card (kit Settings.jsx): the setting's title with its changed mark and a
// caption, and its control on the right, wrapping beneath on a narrow screen.

defineProps<{ title: string; caption?: string; changed?: boolean; top?: boolean }>()
</script>

<template>
  <div
    class="flex flex-wrap gap-x-5 gap-y-2.5 border-b border-(--border-subtle) px-4 py-3.5 last:border-b-0"
    :class="top ? 'items-start' : 'items-center'"
  >
    <div class="flex flex-[1_1_240px] flex-col gap-0.75">
      <span class="flex items-center gap-2 text-(length:--text-sm) font-semibold">
        {{ title }}
        <ChangedMark v-if="changed" />
      </span>
      <span
        v-if="caption !== undefined || $slots.caption"
        class="text-(length:--text-caption) leading-(--lh-compact) text-subtle-foreground"
      ><slot name="caption">{{ caption }}</slot></span>
    </div>
    <slot />
  </div>
</template>
