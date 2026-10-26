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

import type { Tone } from '@/components/test/notices'

// One notice (design_system/components/feedback Notice, notices.md): the tone's surface and icon
// color, the title and its body, and the actions pushed to the end, wrapping under the text when
// the box is narrow. Danger is an alert; the other tones are status messages, unless the notice is
// part of the page rather than news (`live` false). Screens pass the tone, the icon and the text,
// never a style of their own; a title naming a file or an origin sets it in the title slot, in mono.

// attached: flush with the card it heads, as the export's Notice attached (feedback.css .signal.attached).
withDefaults(defineProps<{ tone: Tone; icon: Component; title: string; body?: string; live?: boolean; attached?: boolean }>(), {
  body: undefined,
  live: true,
  attached: false,
})

const TONES: Record<Tone, { box: string; icon: string }> = {
  info: { box: 'border-(--info-border) bg-(--info-bg)', icon: 'text-(--info)' },
  warn: { box: 'border-(--warn-border) bg-(--warn-bg)', icon: 'text-(--warn)' },
  danger: { box: 'border-(--danger-border) bg-(--danger-bg)', icon: 'text-(--danger)' },
  neutral: { box: 'border-input bg-muted', icon: 'text-subtle-foreground' },
  ok: { box: 'border-(--ok-border) bg-(--ok-bg)', icon: 'text-(--ok)' },
}
</script>

<template>
  <div
    :role="tone === 'danger' ? 'alert' : live ? 'status' : undefined"
    :data-tone="tone"
    class="tinted flex flex-wrap items-start gap-x-3 gap-y-2.5 border"
    :class="[TONES[tone].box, attached ? 'rounded-none border-x-0 border-t-0 px-4 py-2.5' : 'rounded-(--radius-md) px-3.5 py-3']"
  >
    <component
      :is="icon"
      :size="16"
      aria-hidden="true"
      class="mt-px flex-none"
      :class="TONES[tone].icon"
    />
    <div class="flex min-w-0 flex-[1_1_var(--layout-text-basis)] flex-col gap-0.5">
      <span class="text-(length:--text-sm) leading-(--lh-snug) font-semibold text-foreground"><slot name="title">{{ title }}</slot></span>
      <span
        v-if="body"
        class="text-(length:--text-caption) leading-(--lh-compact) text-pretty wrap-anywhere text-muted-foreground"
      >{{ body }}</span>
      <slot />
    </div>
    <div
      v-if="$slots.actions"
      class="ml-auto flex items-center gap-2"
    >
      <slot name="actions" />
    </div>
  </div>
</template>
