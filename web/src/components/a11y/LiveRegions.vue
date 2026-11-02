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
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { phaseAnnouncements, rateAnnouncement, resultSummary } from '@/components/a11y/announce'
import type { RunView } from '@/components/test/screen/states'

// The Test screen's two visually hidden live regions (ui/i18n-a11y.md sections 2.1 and 2.7). The
// polite one announces the phase as it starts, a direction's headline once as it finishes, and the
// rate at most every 5 s while running; never the gauge readout, which redraws several times a
// second, and it is emptied as the run ends; a run that ends with nothing measured, no result and
// no error, then says so. The summary region reads the result once it is ready, and is emptied as
// the next run starts.
// A Continuous run's direction is announced as running.

const props = withDefaults(defineProps<{ run: RunView; units: 'bits' | 'bytes'; continuous?: boolean }>(), { continuous: false })

const RATE_MS = 5000

/**
 * How long the polite region waits for more of the same change: the Worker posts a direction's
 * finished and the next phase's started as separate messages, so they join here, in order.
 */
const COALESCE_MS = 250

const { t, locale } = useI18n()
const wording = computed(() => ({ t, locale: locale.value }))

const live = shallowRef('')
const summary = shallowRef('')

// Announcements of one change are read as one message, so a later one cannot cut off an earlier:
// each queued message restarts the window, and the region is written once it has passed.
let pending: string[] = []
let flush: ReturnType<typeof setTimeout> | null = null

function announce(messages: string[]): void {
  if (messages.length === 0) {
    return
  }
  pending.push(...messages)
  if (flush !== null) {
    clearTimeout(flush)
  }
  flush = setTimeout(() => {
    flush = null
    live.value = pending.join(' ')
    pending = []
  }, COALESCE_MS)
}

/** Drops what is queued and not yet read. */
function cancelPending(): void {
  if (flush !== null) {
    clearTimeout(flush)
    flush = null
  }
  pending = []
}

let timer: ReturnType<typeof setInterval> | null = null

function stopRate(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

watch(
  () => props.run.status === 'running',
  (running, wasRunning) => {
    stopRate()
    // A run that ends, however it ends, leaves no phase in the polite region: what it said last
    // would otherwise stay there as the current state, read again by anyone browsing to it.
    cancelPending()
    live.value = ''
    // A run that ends with neither a result nor an error, a stop before anything was measured, has
    // no summary: once the region is emptied, it says so.
    if (wasRunning === true && !running && props.run.result === null && props.run.error === null) {
      announce([t('a11y.live.stoppedNothing')])
    }
    if (running) {
      summary.value = ''
      timer = setInterval(() => {
        const message = rateAnnouncement(props.run, props.units, wording.value)
        announce(message === null ? [] : [message])
      }, RATE_MS)
    }
  },
  { immediate: true },
)

// Registered after the run start's watcher, which runs first in the same flush: a run's first phase
// is queued after the last run's leftovers are dropped.
watch(
  () => props.run.phases,
  (after, before) => announce(phaseAnnouncements(before, after, props.units, wording.value, props.continuous)),
)

watch(
  () => props.run.result,
  (result) => {
    if (result === null) {
      summary.value = ''
      return
    }
    // The summary is the run's last message: nothing queued before it is read after it, and a
    // stop's "nothing was measured" does not stay beside a result that arrived late.
    cancelPending()
    stopRate()
    live.value = ''
    summary.value = resultSummary(result, props.units, wording.value, props.run.idle)
  },
)

onBeforeUnmount(() => {
  cancelPending()
  stopRate()
})
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
