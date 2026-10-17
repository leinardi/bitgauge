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
// The kit's StatusPill at its small size (design_system/components/status: StatusPill.jsx,
// status.css `.pill.sm`): a tone's surface, border and text, with the tone's dot unless `dot` is
// false.

type PillTone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral'

withDefaults(defineProps<{ tone?: PillTone; dot?: boolean }>(), { tone: 'neutral', dot: true })

const TONES: Record<PillTone, { pill: string; dot: string }> = {
  ok: { pill: 'border-(--ok-border) bg-(--ok-bg) text-(--ok-fg)', dot: 'bg-(--ok)' },
  warn: { pill: 'border-(--warn-border) bg-(--warn-bg) text-(--warn-fg)', dot: 'bg-(--warn)' },
  danger: { pill: 'border-(--danger-border) bg-(--danger-bg) text-(--danger-fg)', dot: 'bg-(--danger)' },
  info: { pill: 'border-(--info-border) bg-(--info-bg) text-(--info-fg)', dot: 'bg-(--info)' },
  neutral: { pill: 'border-(--border-default) bg-(--surface-3) text-muted-foreground', dot: 'bg-(--fg-faint)' },
}
</script>

<template>
  <span
    class="inline-flex h-(--pill-h-sm) items-center gap-1 rounded-full border font-(family-name:--font-cond) text-(length:--text-nano) leading-none font-semibold tracking-(--tracking-caps-tight) whitespace-nowrap uppercase"
    :class="[TONES[tone].pill, dot ? 'pr-2 pl-1.5' : 'px-2']"
  >
    <span
      v-if="dot"
      aria-hidden="true"
      class="size-(--dot-size) flex-none rounded-full"
      :class="TONES[tone].dot"
    />
    <slot />
  </span>
</template>
