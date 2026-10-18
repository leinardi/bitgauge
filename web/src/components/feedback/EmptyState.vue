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

import TimeText from '@/components/a11y/TimeText.vue'
import type { TimedText } from '@/lib/timeText'

// The kit's EmptyState (design_system/components/feedback: EmptyState.jsx, feedback.css
// `.empty-state`) in its card: the glyph, the title, the explanation, its dates in <time>
// elements, and the actions, centered.

defineProps<{ icon: Component; title: string; body?: string | TimedText }>()
</script>

<template>
  <section class="rounded-(--radius-lg) border border-(--border-subtle) bg-(--surface-2) shadow-card">
    <div class="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
      <div class="flex size-(--empty-glyph) items-center justify-center rounded-(--radius-lg) border border-(--border-subtle) bg-(--surface-3) text-subtle-foreground">
        <component
          :is="icon"
          :size="20"
          aria-hidden="true"
        />
      </div>
      <h2 class="text-(length:--text-base) font-semibold text-foreground">
        {{ title }}
      </h2>
      <p
        v-if="body !== undefined && body.length > 0"
        class="max-w-(--layout-measure-md) text-(length:--text-sm) leading-(--lh-prose) text-subtle-foreground"
      >
        <template v-if="typeof body === 'string'">
          {{ body }}
        </template>
        <TimeText
          v-else
          :runs="body"
        />
      </p>
      <div
        v-if="$slots.default"
        class="flex flex-wrap justify-center gap-2"
      >
        <slot />
      </div>
    </div>
  </section>
</template>
