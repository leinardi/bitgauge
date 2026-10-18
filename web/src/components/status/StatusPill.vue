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
// The kit's StatusPill (design_system/components/status: StatusPill.jsx, status.css `.pill`): a
// tone's surface, border and text, with the tone's dot unless `dot` is false; small unless `size`
// is md, as the Result detail's confidence pill is. Inside a tinted surface (a notice, a selected
// card: any `.tinted` ancestor) a toned pill lays its tint over opaque --surface-2 rather than over
// the surface's own tint, which would stack the two under 4.5:1 in the light theme.

type PillTone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral'

withDefaults(defineProps<{ tone?: PillTone; dot?: boolean; size?: 'sm' | 'md' }>(), { tone: 'neutral', dot: true, size: 'sm' })

const SIZES = {
  sm: { pill: 'h-(--pill-h-sm) gap-1 text-(length:--text-nano)', dot: 'pr-2 pl-1.5', plain: 'px-2' },
  md: { pill: 'h-(--pill-h) gap-1.5 text-(length:--text-micro)', dot: 'pr-2.5 pl-2', plain: 'px-2' },
}

const TONES: Record<PillTone, { pill: string; dot: string }> = {
  ok: { pill: 'border-(--ok-border) bg-(--ok-bg) text-(--ok-fg) in-[.tinted]:bg-(--surface-2) in-[.tinted]:bg-linear-to-b in-[.tinted]:from-(--ok-bg) in-[.tinted]:to-(--ok-bg)', dot: 'bg-(--ok)' },
  warn: { pill: 'border-(--warn-border) bg-(--warn-bg) text-(--warn-fg) in-[.tinted]:bg-(--surface-2) in-[.tinted]:bg-linear-to-b in-[.tinted]:from-(--warn-bg) in-[.tinted]:to-(--warn-bg)', dot: 'bg-(--warn)' },
  danger: { pill: 'border-(--danger-border) bg-(--danger-bg) text-(--danger-fg) in-[.tinted]:bg-(--surface-2) in-[.tinted]:bg-linear-to-b in-[.tinted]:from-(--danger-bg) in-[.tinted]:to-(--danger-bg)', dot: 'bg-(--danger)' },
  info: { pill: 'border-(--info-border) bg-(--info-bg) text-(--info-fg) in-[.tinted]:bg-(--surface-2) in-[.tinted]:bg-linear-to-b in-[.tinted]:from-(--info-bg) in-[.tinted]:to-(--info-bg)', dot: 'bg-(--info)' },
  neutral: { pill: 'border-(--border-default) bg-(--surface-3) text-muted-foreground', dot: 'bg-(--fg-faint)' },
}
</script>

<template>
  <span
    class="inline-flex items-center rounded-full border font-(family-name:--font-cond) leading-none font-semibold tracking-(--tracking-caps-tight) whitespace-nowrap uppercase"
    :class="[SIZES[size].pill, TONES[tone].pill, dot ? SIZES[size].dot : SIZES[size].plain]"
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
