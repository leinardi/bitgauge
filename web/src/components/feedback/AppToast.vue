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
import { CircleCheck, CircleX, Info, TriangleAlert, Undo2, X } from '@lucide/vue'
import { useIntervalFn } from '@vueuse/core'
import { type Component, computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import type { ToastTone } from '@/components/feedback/notify'
import { cn } from '@/lib/utils'

// The kit's Toast (design_system/components/feedback: Toast.jsx, feedback.css .toast; ui/screens.md
// section 8), drawn inside vue-sonner, which places, stacks and times it: the tone's border and
// icon, the title, a message line, an action and Dismiss. An undo toast counts its time down in the
// message, paused while the toaster is; the countdown is drawn, not announced: the live region
// hears the message once, as it first reads.

const props = defineProps<{
  tone: ToastTone
  icon?: Component
  title: string
  message?: string
  /** An undo toast's time in seconds, counted down in its message line. */
  countdownS?: number
  action?: { label: string; onClick: () => void }
  /** Set by vue-sonner: the toaster's timer is paused (hovered, expanded or the page hidden). */
  isPaused?: boolean
}>()
const emit = defineEmits<{ closeToast: [] }>()

const { t } = useI18n()

const ICONS: Record<ToastTone, Component> = { ok: CircleCheck, info: Info, warn: TriangleAlert, danger: CircleX }
const TONES: Record<ToastTone, string> = {
  ok: 'border-(--ok-border) [&_.toast-icon]:text-(--ok)',
  info: 'border-(--info-border) [&_.toast-icon]:text-(--info)',
  warn: 'border-(--warn-border) [&_.toast-icon]:text-(--warn)',
  danger: 'border-(--danger-border) [&_.toast-icon]:text-(--danger)',
}

const left = shallowRef(props.countdownS ?? 0)
const { pause, resume } = useIntervalFn(
  () => {
    left.value = Math.max(1, left.value - 1)
  },
  1000,
  { immediate: props.countdownS !== undefined && props.isPaused !== true },
)
watch(
  () => props.isPaused,
  (paused) => {
    if (props.countdownS === undefined) {
      return
    }
    if (paused === true) {
      pause()
    } else {
      resume()
    }
  },
)
const countdown = computed(() => (props.countdownS === undefined ? null : t('app.toast.undoWithin', { n: left.value })))
const announced = props.countdownS === undefined ? null : t('app.toast.undoWithin', { n: props.countdownS })

function act(): void {
  props.action?.onClick()
  emit('closeToast')
}
</script>

<template>
  <div
    :class="cn('flex w-(--toast-w) max-w-full items-center gap-2.5 rounded-(--radius-md) border bg-(--surface-2) px-3.5 py-3 text-foreground shadow-(--shadow-md)', TONES[tone])"
    data-testid="toast"
  >
    <span class="toast-icon inline-flex flex-none">
      <component
        :is="icon ?? ICONS[tone]"
        :size="16"
        :stroke-width="2"
        aria-hidden="true"
      />
    </span>
    <div class="min-w-0 flex-1">
      <div class="text-(length:--text-sm) font-semibold">
        {{ title }}
      </div>
      <div
        v-if="message !== undefined"
        class="mt-0.5 text-(length:--text-caption) leading-(--lh-compact) text-muted-foreground"
      >
        {{ message }}
      </div>
      <template v-if="countdown !== null">
        <div
          class="mt-0.5 text-(length:--text-caption) leading-(--lh-compact) text-muted-foreground"
          aria-hidden="true"
          data-testid="toast-countdown"
        >
          {{ countdown }}
        </div>
        <span class="sr-only">{{ announced }}</span>
      </template>
    </div>
    <AppButton
      v-if="action !== undefined"
      size="sm"
      data-testid="toast-action"
      @click="act"
    >
      <Undo2
        :size="14"
        aria-hidden="true"
      />
      {{ action.label }}
    </AppButton>
    <AppButton
      variant="ghost"
      size="sm"
      class="size-(--control-h-sm) justify-center px-0"
      :aria-label="t('app.toast.dismiss')"
      data-testid="toast-dismiss"
      @click="emit('closeToast')"
    >
      <X
        :size="14"
        aria-hidden="true"
      />
    </AppButton>
  </div>
</template>
