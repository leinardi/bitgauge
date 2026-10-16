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
import { Timer } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { windowCaption } from '@/components/gauge/caption'
import { useDial } from '@/components/gauge/dial'
import GaugeDial from '@/components/gauge/GaugeDial.vue'
import { rateScale } from '@/components/gauge/scale'

// The gauge during the auto-start countdown (design_system/components/gauge.md, Countdown): the
// dial of the window the run will start in, its ring draining linearly, a third per second for the
// 3 s countdown, and the readout showing the whole seconds left. Under prefers-reduced-motion the
// ring steps once per second with the number, so the number carries the count without any motion.
// Under the dial, the caption names the window.

const props = defineProps<{ remainingMs: number; totalMs: number; window: number; units: 'bits' | 'bytes' }>()

const { t, locale } = useI18n()

const { track } = useDial()
const scale = computed(() => rateScale(props.window))
const caption = computed(() => windowCaption(props.window, props.units, { t, locale: locale.value }))
const seconds = computed(() => Math.max(1, Math.ceil(props.remainingMs / 1000)))
const number = computed(() => new Intl.NumberFormat(locale.value).format(seconds.value))
const smooth = computed(() => Math.min(Math.max(props.remainingMs / props.totalMs, 0), 1))
const stepped = computed(() => Math.min((seconds.value * 1000) / props.totalMs, 1))
</script>

<template>
  <div
    class="flex flex-col items-center gap-1"
    data-testid="countdown"
  >
    <GaugeDial
      :scale="scale"
      mode="rate"
    >
      <template #arcs>
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
      </template>
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-0.75 pt-2 text-center">
        <span class="flex items-center gap-1.25 font-(family-name:--font-cond) text-(length:--text-caption) font-semibold tracking-(--tracking-caps) text-primary-text uppercase">
          <Timer
            :size="13"
            :stroke-width="2.25"
            aria-hidden="true"
          />
          {{ t('test.countdown.label') }}
        </span>
        <span
          class="font-mono text-(length:--type-gauge-readout-compact) leading-display font-medium tracking-(--tracking-readout) tabular-nums desktop:text-(length:--type-gauge-readout)"
          data-testid="countdown-number"
        >{{ number }}</span>
        <span class="text-(length:--text-md) font-medium text-muted-foreground">{{ t('test.countdown.unit', seconds) }}</span>
        <span class="font-mono text-(length:--text-micro) text-subtle-foreground">{{ t('test.countdown.caption') }}</span>
      </div>
    </GaugeDial>
    <span class="font-mono text-(length:--text-caption) whitespace-nowrap text-subtle-foreground">{{ caption }}</span>
  </div>
</template>
