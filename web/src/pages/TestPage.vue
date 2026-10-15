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
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import LiveRegions from '@/components/a11y/LiveRegions.vue'
import ThroughputChart from '@/components/chart/ThroughputChart.vue'
import ConnectionStrip from '@/components/connection/ConnectionStrip.vue'
import SettingsSummary from '@/components/connection/SettingsSummary.vue'
import CountdownRing from '@/components/gauge/CountdownRing.vue'
import LiveGauge from '@/components/gauge/Gauge.vue'
import { startK } from '@/components/gauge/window'
import OfflineNotice from '@/components/OfflineNotice.vue'
import MetaList, { type MetaRow } from '@/components/layout/MetaList.vue'
import AutoStartNotice from '@/components/test/AutoStartNotice.vue'
import MetricTile from '@/components/test/MetricTile.vue'
import NoticeList from '@/components/test/NoticeList.vue'
import NotMeasured from '@/components/test/NotMeasured.vue'
import NotMeasuredWhy from '@/components/test/NotMeasuredWhy.vue'
import PhaseIndicator from '@/components/test/PhaseIndicator.vue'
import ResultBar from '@/components/test/ResultBar.vue'
import RunFailure from '@/components/test/RunFailure.vue'
import { gaugeInput, phaseSteps, type RunView, screenState, screenTiles } from '@/components/test/screen'
import StartButton from '@/components/test/StartButton.vue'
import { useContextLabel } from '@/composables/useContextLabel'
import { useCountdown } from '@/composables/useCountdown'
import { useInfo } from '@/composables/useInfo'
import { useRun } from '@/composables/useRun'
import { useTestKeys } from '@/composables/useTestKeys'
import { consumeAutoRun, urlOverride, useUrlParams } from '@/composables/useUrlParams'
import type { Direction, Notice, Preset } from '@/engine/messages'
import { links } from '@/lib/links'

// The Test screen (ui/screens.md section 1, kit TestScreen.jsx v0.1 branch): idle, the auto-start
// countdown, running per phase, done, cancelled, error and offline, from the run's live view. v0.1
// keeps no history, so Download JSON is the only result action. The engine's Worker starts with the
// page, is configured with the server's defaults and the URL parameters on top as soon as they are
// known (ui/url-params.md), and ends when the page unmounts.

const { info, reachability, refresh } = useInfo()
const url = useUrlParams()
const run = useRun({ override: (base) => urlOverride(url, base).override })
const { defaults, settings } = run
const countdown = useCountdown()
const { label: contextLabel } = useContextLabel(computed(() => info.value?.client.suggestedLabel))
const { t, locale } = useI18n()
const host = window.location.host

const view = computed<RunView>(() => ({
  status: run.status.value,
  phase: run.phase.value,
  phases: run.phases.value,
  live: run.live.value,
  idle: run.idle.value,
  dataUsedBytes: run.dataUsedBytes.value,
  result: run.result.value,
  error: run.error.value,
}))
const state = computed(() => screenState(view.value))
const running = computed(() => state.value === 'running')
const counting = computed(() => countdown.remainingMs.value !== null)
const wording = computed(() => ({ t, locale: locale.value }))
// A run shows the settings it runs with; between runs, those the next one starts from.
const shownSettings = computed(() => (state.value === 'idle' ? null : run.runSettings.value) ?? settings.value)
const units = computed(() => shownSettings.value?.units ?? 'bits')

const steps = computed(() => (shownSettings.value === null ? [] : phaseSteps(view.value, shownSettings.value, locale.value)))
const gauge = computed(() => gaugeInput(view.value, wording.value))
const tiles = computed(() => (shownSettings.value === null ? null : screenTiles(view.value, shownSettings.value, wording.value)))
// Data used, duration and the packet-loss slot, whose reason stays in view (ui/screens.md section 6).
const facts = computed<MetaRow[]>(() => {
  if (tiles.value === null) {
    return []
  }
  const { more, packetLoss } = tiles.value
  return [
    ...more.map((tile) => ({ key: tile.label, icon: tile.icon, label: tile.label, value: tile.number === null ? null : `${tile.number} ${tile.unit}` })),
    { key: 'packet-loss', icon: packetLoss.icon, label: packetLoss.label, sub: t('test.tiles.whyNot') },
  ]
})

// The URL parameters ignored; before the first run they show as the notices a run will carry.
const ignored = computed(() => (defaults.value === null ? url.ignored : urlOverride(url, defaults.value).ignored))
const notices = computed<Notice[]>(() => (state.value === 'idle' ? ignored.value.map((parameter) => ({ code: 'url-parameter-ignored', parameter })) : run.notices.value))

// The chart shows the current run, or the last one until the next starts; nothing between runs.
const order = computed(() => (shownSettings.value?.phases ?? []).filter((phase): phase is Direction => phase !== 'idle'))
const chartLive = computed(() => (state.value === 'idle' ? { download: null, upload: null } : run.live.value))
const chartEvents = computed(() => ({ download: run.result.value?.download?.events ?? [], upload: run.result.value?.upload?.events ?? [] }))
const shown = computed(() => state.value !== 'idle')

/** The gauge's window, carried between directions and started afresh with each run. */
const gaugeWindow = shallowRef(startK(units.value))
watch(units, (value) => {
  gaugeWindow.value = startK(value)
})

const streams = computed(() => {
  const direction = run.direction.value
  return direction === null || !shown.value ? null : (run.phases.value[direction].streams ?? null)
})

const mode = computed(() => {
  if (counting.value) {
    return 'now'
  }
  switch (state.value) {
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

// Start is disabled until GET /info answers with defaults this version can run (flows.md section 1).
const disabledReason = computed(() => {
  if (running.value || counting.value) {
    return null
  }
  if (reachability.value === 'unreachable') {
    return t('test.start.unreachable')
  }
  if (info.value === null) {
    return t('test.start.waiting')
  }
  return defaults.value === null ? t('test.start.unsupported') : null
})

function begin(preset?: Preset): void {
  countdown.cancel()
  gaugeWindow.value = startK(units.value)
  // An empty context label is the user's choice of none; the engine would fall back to the suggestion.
  run.start({
    contextLabel: contextLabel.value ?? '',
    ignoredParameters: ignored.value,
    ...(url.label === undefined ? {} : { label: url.label }),
    ...(preset === undefined ? {} : { preset }),
  })
}

function press(): void {
  if (counting.value) {
    countdown.now()
  } else if (running.value) {
    run.stop()
  } else {
    begin()
  }
}

// A link with `run` counts down once the engine has the URL's settings and Start is usable.
watch(
  () => disabledReason.value === null && run.configured.value !== null && state.value === 'idle',
  (ready) => {
    if (ready && consumeAutoRun()) {
      countdown.start(() => begin())
    }
  },
  { immediate: true },
)

useTestKeys({
  canEnter: () => counting.value || (!running.value && disabledReason.value === null),
  enter: press,
  escape: () => (counting.value ? countdown.cancel() : run.stop()),
})

// An unreachable server is checked again, so the offline state and Start follow GET /info.
watch(run.error, (error) => {
  if (error?.code === 'server-unreachable') {
    void refresh()
  }
})
</script>

<template>
  <main
    id="main"
    tabindex="-1"
    class="focus:outline-none mx-auto flex w-full max-w-(--layout-max) flex-1 flex-col gap-4 px-4 py-6 sm:gap-5 sm:px-10"
  >
    <h1 class="sr-only text-[length:calc(2*var(--text-base))] leading-(--lh-normal) font-bold">
      {{ $t('test.title') }}
    </h1>
    <LiveRegions
      :run="view"
      :units="units"
    />
    <OfflineNotice
      v-if="reachability === 'unreachable'"
      :host="host"
      @retry="refresh"
    />
    <div class="flex flex-wrap items-end justify-between gap-x-7 gap-y-3">
      <ConnectionStrip
        :info="reachability === 'unreachable' ? null : info"
        :protocol="shown ? run.protocol.value : null"
        :streams="streams"
      />
      <SettingsSummary
        v-if="reachability === 'connected' && defaults !== null && shownSettings !== null"
        :settings="shownSettings"
        :defaults="defaults"
      />
    </div>
    <RunFailure
      v-if="state === 'error' && run.error.value !== null"
      :error="run.error.value"
      :kept="run.result.value !== null"
    />
    <AutoStartNotice
      v-if="countdown.remainingMs.value !== null"
      :remaining-ms="countdown.remainingMs.value"
      @cancel="countdown.cancel"
    />
    <NoticeList
      :notices="notices"
      @retry="begin()"
      @preset="begin"
    />
    <section
      class="overflow-hidden rounded-(--radius-lg) border border-border bg-card shadow-card"
      :aria-label="$t('test.title')"
    >
      <div class="border-b border-(--border-subtle) px-4 py-3.5 sm:px-6">
        <PhaseIndicator
          :steps="steps"
          :connecting="running && (run.phase.value === null || run.phase.value === 'info')"
        />
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-[var(--layout-instrument)_minmax(0,1fr)]">
        <div class="flex flex-col items-center gap-3.5 px-4 py-5 sm:px-6 sm:py-7">
          <CountdownRing
            v-if="countdown.remainingMs.value !== null"
            :remaining-ms="countdown.remainingMs.value"
            :total-ms="countdown.totalMs"
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
          />
          <StartButton
            :mode="mode"
            :disabled-reason="disabledReason"
            @press="press"
          />
        </div>
        <div class="border-t border-(--border-subtle) px-4 py-3.5 lg:border-t-0 lg:border-l lg:px-6 lg:py-5">
          <ThroughputChart
            :order="order"
            :live="chartLive"
            :units="units"
            :events="chartEvents"
            :running="running"
          />
        </div>
      </div>
    </section>
    <ResultBar
      v-if="shown && !running && run.result.value !== null"
      :result="run.result.value"
    />
    <p
      v-if="state === 'idle' && reachability === 'connected'"
      class="text-(length:--text-base) text-muted-foreground"
    >
      {{ $t('test.empty') }}
    </p>
    <template v-if="tiles !== null">
      <section
        :aria-label="$t('test.results')"
        class="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4"
      >
        <MetricTile
          v-for="tile in tiles.main"
          :key="tile.label"
          :tile="tile"
        />
        <MetaList
          :title="$t('test.tiles.meta')"
          :rows="facts"
          :columns="3"
          class="col-span-full"
        >
          <template #sub-packet-loss>
            <NotMeasuredWhy :href="links.packetLoss" />
          </template>
          <template #value-packet-loss>
            <NotMeasured />
          </template>
        </MetaList>
      </section>
    </template>
  </main>
</template>
