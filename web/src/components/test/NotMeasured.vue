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
import { CircleDashed } from '@lucide/vue'

// The packet-loss slot's value (design_system/components/tiles.md NotMeasured): a dashed "Not
// measured" badge and a Why? link whose name carries the reason. Never a zero.

defineProps<{ href: string }>()
</script>

<template>
  <span class="inline-flex flex-none items-center gap-2 text-(length:--text-caption)">
    <span class="inline-flex h-(--pill-h-sm) items-center gap-1 rounded-full border border-dashed border-(--border-strong) pr-2 pl-1.5 font-(family-name:--font-cond) text-(length:--text-nano) leading-none font-semibold tracking-(--tracking-caps-tight) whitespace-nowrap text-muted-foreground uppercase">
      <CircleDashed
        :size="12"
        :stroke-width="2"
        aria-hidden="true"
      />
      {{ $t('test.tiles.notMeasured') }}
    </span>
    <a
      :href="href"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="$t('test.tiles.whyName', { reason: $t('test.tiles.whyNot') })"
      class="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-primary-text no-underline hover:text-(--primary-hover) hover:underline hover:underline-offset-2"
    >{{ $t('test.tiles.why') }}</a>
  </span>
</template>
