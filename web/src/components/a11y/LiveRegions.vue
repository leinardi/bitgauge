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
import { computed, nextTick, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { phaseAnnouncements, rateAnnouncement, resultSummary } from '@/components/a11y/announce'
import type { RunView } from '@/components/test/screen/states'

// The Test screen's two visually hidden live regions (ui/i18n-a11y.md sections 2.1 and 2.7). The
// polite one announces the phase as it starts, a direction's headline once as it finishes, and the
// rate at most every 5 s while running; never the gauge readout, which redraws several times a
// second. The summary region reads the result once it is ready. Both are emptied as a run starts.
// A Continuous run's direction is announced as running.

const props = withDefaults(defineProps<{ run: RunView; units: 'bits' | 'bytes'; continuous?: boolean }>(), { continuous: false })

const RATE_MS = 5000

const { t, locale } = useI18n()
const wording = computed(() => ({ t, locale: locale.value }))

const live = shallowRef('')
const summary = shallowRef('')

// Announcements of one change are read as one message, so a later one cannot cut off an earlier.
let pending: string[] = []

function announce(messages: string[]): void {
  if (messages.length === 0) {
    return
  }
  if (pending.length === 0) {
    void nextTick(() => {
      live.value = pending.join(' ')
      pending = []
    })
  }
  pending.push(...messages)
}

watch(
  () => props.run.phases,
  (after, before) => announce(phaseAnnouncements(before, after, props.units, wording.value, props.continuous)),
)

let timer: ReturnType<typeof setInterval> | null = null

function stopRate(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

watch(
  () => props.run.status === 'running',
  (running) => {
    stopRate()
    if (running) {
      live.value = ''
      summary.value = ''
      timer = setInterval(() => {
        const message = rateAnnouncement(props.run, props.units, wording.value)
        announce(message === null ? [] : [message])
      }, RATE_MS)
    }
  },
  { immediate: true },
)

watch(
  () => props.run.result,
  (result) => {
    summary.value = result === null ? '' : resultSummary(result, props.units, wording.value)
  },
)

onBeforeUnmount(stopRate)
</script>

<template>
  <div class="sr-only">
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="live-region"
    >
      {{ live }}
    </p>
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="result-summary"
    >
      {{ summary }}
    </p>
  </div>
</template>
