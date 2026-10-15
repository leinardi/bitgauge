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
import { Play, RefreshCw, RotateCcw, Square } from '@lucide/vue'
import { type Component, computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import { Button } from '@/components/ui/button'

// The Test screen's one control (ui/screens.md section 1, kit TestScreen): Start, Stop, Run again,
// Retry or Start now, with the key that also triggers it. A native button, so Enter and Space
// press it. When it cannot be used it stays focusable, ignores presses, and says why in a tooltip
// on hover and focus that also describes it (kit Button's disabledReason).

type StartMode = 'start' | 'stop' | 'again' | 'retry' | 'now'

const props = defineProps<{ mode: StartMode; disabledReason?: string | null }>()
const emit = defineEmits<{ press: [] }>()

const { t } = useI18n()
const reasonId = useId()

const LOOK: Record<StartMode, { icon: Component; primary: boolean; escape: boolean }> = {
  start: { icon: Play, primary: true, escape: false },
  stop: { icon: Square, primary: false, escape: true },
  again: { icon: RotateCcw, primary: true, escape: false },
  retry: { icon: RefreshCw, primary: true, escape: false },
  now: { icon: Play, primary: true, escape: false },
}

const LABELS: Record<StartMode, () => string> = {
  start: () => t('test.start.start'),
  stop: () => t('test.start.stop'),
  again: () => t('test.start.again'),
  retry: () => t('test.start.retry'),
  now: () => t('test.start.now'),
}

const label = computed(() => LABELS[props.mode]())
const look = computed(() => LOOK[props.mode])
const disabled = computed(() => typeof props.disabledReason === 'string' && props.disabledReason !== '')

function press(): void {
  if (!disabled.value) {
    emit('press')
  }
}
</script>

<template>
  <div class="group relative flex flex-col">
    <Button
      size="lg"
      :variant="look.primary ? 'default' : 'outline'"
      :aria-disabled="disabled ? 'true' : undefined"
      :aria-describedby="disabled ? reasonId : undefined"
      class="h-(--control-h-touch-xl) w-full sm:h-(--control-h-xl) sm:w-(--start-w)"
      :class="{ 'cursor-not-allowed opacity-50': disabled }"
      data-testid="start-button"
      @click="press"
    >
      <component
        :is="look.icon"
        aria-hidden="true"
      />
      {{ label }}
      <kbd
        aria-hidden="true"
        class="ml-auto hidden rounded-(--radius-xs) border border-current/30 px-1.5 font-mono text-(length:--text-micro) sm:inline"
      >{{ look.escape ? t('test.start.keyEscape') : t('test.start.keyEnter') }}</kbd>
    </Button>
    <span
      v-if="disabled"
      :id="reasonId"
      role="tooltip"
      class="pointer-events-none absolute bottom-[calc(100%+var(--tooltip-gap))] left-1/2 z-(--z-tooltip) -translate-x-1/2 rounded-(--radius-sm) border border-border bg-(--surface-4) px-2.5 py-1.5 text-(length:--text-caption) whitespace-nowrap text-foreground opacity-0 shadow-(--shadow-md) transition-opacity duration-(--dur-fast) group-focus-within:opacity-100 motion-reduce:transition-none group-hover:opacity-100"
      data-testid="start-reason"
    >{{ disabledReason }}</span>
  </div>
</template>
