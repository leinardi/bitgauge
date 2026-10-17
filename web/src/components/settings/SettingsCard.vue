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

// The kit's Card (design_system/components/layout Card.jsx, layout.css `.card`) as the Settings
// screen and the Result detail use it: a section labeled by its header's title, with the header's
// icon and actions, and a padded body or rows that bring their own padding.

defineProps<{ id: string; title: string; icon: Component; padded?: boolean }>()
</script>

<template>
  <section
    :aria-labelledby="id"
    class="overflow-hidden rounded-(--radius-lg) border border-(--border-subtle) bg-(--surface-2) shadow-card"
  >
    <div class="flex items-center gap-2.5 border-b border-(--border-subtle) px-4 py-3">
      <component
        :is="icon"
        :size="15"
        class="text-subtle-foreground"
        aria-hidden="true"
      />
      <h2
        :id="id"
        class="text-(length:--text-base) font-semibold"
      >
        {{ title }}
      </h2>
      <span
        v-if="$slots.actions"
        class="ml-auto flex items-center gap-2"
      ><slot name="actions" /></span>
    </div>
    <div :class="padded ? 'p-4' : 'flex flex-col'">
      <slot />
    </div>
  </section>
</template>
