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
import { RefreshCw } from '@lucide/vue'
import { computed } from 'vue'

import AppButton from '@/components/actions/AppButton.vue'
import LatencyChart from '@/components/chart/LatencyChart.vue'
import ThroughputChart from '@/components/chart/ThroughputChart.vue'
import CountdownRing from '@/components/gauge/CountdownRing.vue'
import LiveGauge from '@/components/gauge/Gauge.vue'
import PhaseIndicator from '@/components/test/PhaseIndicator.vue'
import { PENDING_STEPS, PING_SPACING_MS, type RunView, type ScreenState } from '@/components/test/screen/states'
import { type GaugeContext, type GaugeInput, gaugeReadout } from '@/components/test/screen/view'
import StartButton from '@/components/test/StartButton.vue'
import type { PhaseStep } from '@/components/test/steps'
import type { LatencyPoint } from '@/composables/useRunState'
import type { Direction, TestSettings } from '@/engine/messages'

// The Test screen's instrument (ui/screens.md section 1): the phase indicator, the gauge or the
// auto-start countdown with Start beneath it, and the chart of the current run, or of the last one
// until the next starts: the latency samples chart during idle latency and after a run that ended
// there, the throughput chart otherwise.

const props = defineProps<{
  view: RunView
  state: ScreenState
  /** Each idle-latency ping, for the latency samples chart. */
  latency: readonly LatencyPoint[]
  /** The settings the run shows; null before the server's are known. */
  settings: TestSettings | null
  steps: PhaseStep[]
  gauge: GaugeInput
  gaugeContext: GaugeContext
  units: 'bits' | 'bytes'
  /** The offline state between runs, whose gauge offers a check now. */
  offline: boolean
  /** The auto-start countdown, while it runs. */
  countdown: { remainingMs: number; totalMs: number } | null
  disabledReason: string | null
}>()
/** The gauge's window, carried between directions and started afresh with each run. */
const gaugeWindow = defineModel<number>('window', { required: true })
const emit = defineEmits<{ press: []; refresh: [] }>()

const running = computed(() => props.state === 'running')
const shown = computed(() => props.state !== 'idle')
const readout = computed(() => gaugeReadout(props.gauge, props.gaugeContext))

const mode = computed(() => {
  if (props.countdown !== null) {
    return 'now'
  }
  switch (props.state) {
    case 'running':
      return 'stop'
    case 'error':
      return 'retry'
    case 'done':
    case 'cancelled':
      return 'again'
    default:
      return 'start'
  }
})

// The chart shows the current run, or the last one until the next starts; nothing between runs.
const order = computed(() => (props.settings?.phases ?? PENDING_STEPS.map((step) => step.phase)).filter((phase): phase is Direction => phase !== 'idle'))
const chartLive = computed(() => (props.state === 'idle' ? { download: null, upload: null } : props.view.live))
const chartEvents = computed(() => ({ download: props.view.result?.download?.events ?? [], upload: props.view.result?.upload?.events ?? [] }))
const chartState = computed(() => {
  switch (props.state) {
    case 'idle':
      return 'empty'
    case 'running':
      return 'running'
    case 'done':
      return 'done'
    default:
      return 'stopped'
  }
})
// During idle latency, and after a run that ended there, the chart is the latency samples chart.
const latencyChart = computed(() => shown.value && order.value.every((direction) => chartLive.value[direction] === null) && (props.view.phase === 'idle' || props.latency.length > 0))
const latencyMark = computed(() => (props.state === 'cancelled' || props.state === 'error' ? props.state : null))
</script>

<template>
  <section
    class="overflow-hidden rounded-(--radius-lg) border border-border bg-card shadow-card"
    :aria-label="$t('test.title')"
  >
    <div class="border-b border-(--border-subtle) px-3.5 py-3 desktop:px-6 desktop:py-4">
      <PhaseIndicator
        :steps="steps"
        :connecting="running && (view.phase === null || view.phase === 'info')"
      />
    </div>
    <div class="grid grid-cols-1 desktop:grid-cols-[var(--layout-instrument)_minmax(0,1fr)]">
      <div class="flex flex-col items-center gap-3.5 px-4 py-5 desktop:p-6">
        <CountdownRing
          v-if="countdown !== null"
          :remaining-ms="countdown.remainingMs"
          :total-ms="countdown.totalMs"
          :window="gaugeWindow"
          :units="units"
        />
        <LiveGauge
          v-else
          v-model:window="gaugeWindow"
          :mode="gauge.mode"
          :units="units"
          :direction="gauge.direction"
          :value="gauge.value"
          :peak="gauge.peak"
          :inner="gauge.inner"
          :label="gauge.label"
          :at="gauge.at"
          :note="gauge.note"
          :inner-label="gauge.innerLabel"
          :text="gauge.text"
        >
          <template
            v-if="offline"
            #action
          >
            <AppButton
              size="sm"
              @click="emit('refresh')"
            >
              <RefreshCw
                :size="14"
                aria-hidden="true"
              />
              {{ $t('app.offline.retry') }}
            </AppButton>
          </template>
        </LiveGauge>
        <StartButton
          :mode="mode"
          :disabled-reason="disabledReason"
          @press="emit('press')"
        />
      </div>
      <div class="min-w-0 border-t border-(--border-subtle) px-4 pt-3.5 pb-4 desktop:border-t-0 desktop:border-l desktop:px-6 desktop:py-5">
        <LatencyChart
          v-if="latencyChart"
          :state="chartState"
          :points="latency"
          :about-ms="(settings?.pingCount ?? 0) * PING_SPACING_MS"
          :ran-ms="view.phases.idle.ranMs ?? null"
          :mark="latencyMark"
          :readout="readout"
        />
        <ThroughputChart
          v-else
          :order="order"
          :live="chartLive"
          :units="units"
          :events="chartEvents"
          :loaded="view.loaded"
          :state="chartState"
          :durations="settings"
          :total-ms="view.result?.durationMs ?? null"
          :readout="readout"
          :empty-text="offline ? $t('test.chart.emptyOffline', { server: gaugeContext.server }) : null"
        />
      </div>
    </div>
  </section>
</template>
