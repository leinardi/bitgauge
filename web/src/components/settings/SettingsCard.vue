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
// icon and actions, and a padded body or rows that bring their own padding. Its title is an h2, or an
// h3 inside a dialog, whose own title is the h2 (Card.jsx headingLevel).

withDefaults(defineProps<{ id: string; title: string; icon: Component; padded?: boolean; level?: 2 | 3 }>(), { level: 2 })
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
      <component
        :is="level === 3 ? 'h3' : 'h2'"
        :id="id"
        class="text-(length:--text-base) font-semibold"
      >
        {{ title }}
      </component>
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
