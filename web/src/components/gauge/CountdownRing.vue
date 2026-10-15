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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { arcPath } from '@/components/gauge/scale'

// The gauge during the auto-start countdown (design_system/components/gauge.md, Countdown): the
// ring drains linearly, a third per second for the 3 s countdown, and the readout shows the whole
// seconds left. Under prefers-reduced-motion the ring steps once per second with the number, so
// the number carries the count without any motion.

const props = defineProps<{ remainingMs: number; totalMs: number }>()

const { t, locale } = useI18n()

const SIZE = 316
const CENTER = SIZE / 2
const RADIUS = SIZE / 2 - 10

const track = arcPath(CENTER, CENTER, RADIUS, 0, 1)
const seconds = computed(() => Math.max(1, Math.ceil(props.remainingMs / 1000)))
const number = computed(() => new Intl.NumberFormat(locale.value).format(seconds.value))
const smooth = computed(() => Math.min(Math.max(props.remainingMs / props.totalMs, 0), 1))
const stepped = computed(() => Math.min((seconds.value * 1000) / props.totalMs, 1))
</script>

<template>
  <div
    class="flex flex-col items-center gap-3.5"
    data-testid="countdown"
  >
    <div class="relative aspect-square w-68 sm:w-79">
      <svg
        :viewBox="`0 0 ${SIZE} ${SIZE}`"
        class="block size-full overflow-visible"
        aria-hidden="true"
      >
        <path
          :d="track"
          fill="none"
          stroke="var(--surface-3)"
          stroke-width="10"
          stroke-linecap="round"
        />
        <path
          :d="track"
          fill="none"
          stroke="var(--primary)"
          stroke-width="10"
          stroke-linecap="round"
          pathLength="1"
          :stroke-dasharray="`${smooth} 1`"
          class="transition-[stroke-dasharray] duration-100 ease-linear motion-reduce:hidden"
          data-testid="countdown-ring"
        />
        <path
          :d="track"
          fill="none"
          stroke="var(--primary)"
          stroke-width="10"
          stroke-linecap="round"
          pathLength="1"
          :stroke-dasharray="`${stepped} 1`"
          class="hidden motion-reduce:inline"
          data-testid="countdown-ring-stepped"
        />
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pt-2 text-center">
        <span class="font-(family-name:--font-cond) text-xs font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">{{ t('test.countdown.label') }}</span>
        <span
          class="font-mono text-(length:--type-gauge-readout-compact) leading-[1.05] font-medium tracking-(--tracking-readout) tabular-nums sm:text-(length:--type-gauge-readout)"
          data-testid="countdown-number"
        >{{ number }}</span>
        <span class="text-(length:--text-md) font-medium text-muted-foreground">{{ t('test.countdown.unit', seconds) }}</span>
      </div>
    </div>
    <p class="font-mono text-(length:--text-caption) text-subtle-foreground">
      {{ t('test.countdown.caption') }}
    </p>
  </div>
</template>
