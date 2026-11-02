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
import type { TilePill, TileView } from '@/components/test/tiles'

// One metric tile (design_system/components/tiles.md): an eyebrow with its icon and the state pill,
// the number with its unit apart, or words in its place, and the qualifier lines; "—" when there
// is no number. The number fades in when it first arrives, not on each update, unless motion is
// reduced.

defineProps<{ tile: TileView }>()

// The qualifier line keeps its height with nothing to say, as the kit's tile-q does, so tiles in a
// row line up whatever their state.
const EMPTY_LINE: TileView['lines'][number] = { text: '' }

// The pill's tone (design_system/components/status StatusPill): surface, border, text and dot.
const TONES: Record<TilePill['tone'], { pill: string; dot: string }> = {
  info: { pill: 'border-(--info-border) bg-(--info-bg) text-(--info-fg)', dot: 'bg-(--info)' },
  warn: { pill: 'border-(--warn-border) bg-(--warn-bg) text-(--warn-fg)', dot: 'bg-(--warn)' },
  danger: { pill: 'border-(--danger-border) bg-(--danger-bg) text-(--danger-fg)', dot: 'bg-(--danger)' },
}
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-1.5 rounded-(--radius-lg) border border-border bg-card px-3.5 py-3 shadow-card desktop:px-4.5 desktop:py-4"
    data-testid="metric-tile"
  >
    <div class="flex min-h-(--pill-h-sm) flex-wrap items-center gap-1.5">
      <component
        :is="tile.icon"
        :size="14"
        :stroke-width="2"
        aria-hidden="true"
        class="flex-none"
        :style="{ color: tile.color }"
      />
      <span class="truncate font-(family-name:--font-cond) text-(length:--text-micro) leading-(--lh-snug) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">{{ tile.label }}</span>
      <span
        v-if="tile.pill"
        class="ml-auto inline-flex h-(--pill-h-sm) items-center gap-1 rounded-full border pr-2 pl-1.5 font-(family-name:--font-cond) text-(length:--text-nano) leading-none font-semibold tracking-(--tracking-caps-tight) whitespace-nowrap uppercase"
        :class="TONES[tile.pill.tone].pill"
        data-testid="tile-pill"
      ><span
        aria-hidden="true"
        class="size-(--dot-size) flex-none rounded-full"
        :class="TONES[tile.pill.tone].dot"
      />{{ tile.pill.text }}</span>
    </div>
    <div class="flex flex-wrap items-baseline gap-1.5">
      <Transition
        mode="out-in"
        enter-active-class="transition-opacity duration-(--dur-base) motion-reduce:transition-none"
        enter-from-class="opacity-0"
      >
        <span
          v-if="tile.word"
          key="word"
          class="font-mono text-(length:--text-sm) leading-(--tile-value-h) font-medium text-subtle-foreground"
          data-testid="tile-word"
        >{{ tile.word }}</span>
        <!-- The unit enters and leaves with its number, so it never sits beside the leaving dash. -->
        <span
          v-else
          :key="tile.number === null ? 'empty' : 'value'"
          class="flex flex-wrap items-baseline gap-1.5"
        >
          <span
            class="font-mono text-(length:--type-metric-value-compact) leading-(--lh-tight) font-medium tracking-(--tracking-metric) tabular-nums desktop:text-(length:--type-metric-value)"
            :class="tile.number === null ? 'text-subtle-foreground' : 'text-foreground'"
            data-testid="tile-number"
          >{{ tile.number ?? $t('test.tiles.empty') }}</span>
          <span
            v-if="tile.number !== null && tile.unit"
            class="font-mono text-(length:--text-caption) text-muted-foreground"
            data-testid="tile-unit"
          >{{ tile.unit }}</span>
        </span>
      </Transition>
    </div>
    <span
      v-for="(line, index) in tile.lines.length > 0 ? tile.lines : [EMPTY_LINE]"
      :key="index"
      class="min-h-(--tile-qualifier-h) font-mono text-(length:--text-micro) leading-(--lh-compact) text-pretty"
      :class="line.tone === 'danger' ? 'text-(--danger-fg)' : line.tone === 'warn' ? 'text-(--warn-fg)' : 'text-subtle-foreground'"
      data-testid="tile-line"
    >{{ line.text }}</span>
  </div>
</template>
