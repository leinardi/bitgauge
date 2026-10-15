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
import type { TileView } from '@/components/test/tiles'

// One metric tile (design_system/components/tiles.md): an eyebrow with its icon, the number with
// its unit apart, and the qualifier lines; "—" when there is no number. The number fades in when
// it first arrives, not on each update, unless motion is reduced.

defineProps<{ tile: TileView }>()
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-1 rounded-(--radius-lg) border border-border bg-card px-4 py-3"
    data-testid="metric-tile"
  >
    <div class="flex items-center gap-1.5">
      <component
        :is="tile.icon"
        :size="13"
        aria-hidden="true"
        :style="{ color: tile.colour }"
      />
      <span class="font-(family-name:--font-cond) text-(length:--text-caption) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">{{ tile.label }}</span>
      <span
        v-if="tile.live"
        class="ml-auto rounded-full border border-(--info-border) bg-(--info-bg) px-1.5 text-(length:--text-micro) text-(--info-fg)"
      >{{ $t('test.tiles.live') }}</span>
    </div>
    <div class="flex items-baseline gap-1">
      <Transition
        mode="out-in"
        enter-active-class="transition-opacity duration-(--dur-base) motion-reduce:transition-none"
        enter-from-class="opacity-0"
      >
        <span
          :key="tile.number === null ? 'empty' : 'value'"
          class="font-mono text-(length:--type-metric-value-compact) font-medium tabular-nums sm:text-(length:--type-metric-value)"
          :class="tile.number === null ? 'text-subtle-foreground' : 'text-foreground'"
          data-testid="tile-number"
        >{{ tile.number ?? $t('test.tiles.empty') }}</span>
      </Transition>
      <span
        v-if="tile.number !== null && tile.unit"
        class="text-(length:--text-sm) text-muted-foreground"
        data-testid="tile-unit"
      >{{ tile.unit }}</span>
    </div>
    <span
      v-for="(line, index) in tile.lines"
      :key="index"
      class="font-mono text-(length:--text-caption)"
      :class="line.tone === 'danger' ? 'text-(--danger-fg)' : line.tone === 'warn' ? 'text-(--warn-fg)' : 'text-subtle-foreground'"
      data-testid="tile-line"
    >{{ line.text }}</span>
  </div>
</template>
