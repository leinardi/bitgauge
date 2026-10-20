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
import ConnectionStrip from '@/components/connection/ConnectionStrip.vue'
import SettingsSummary from '@/components/connection/SettingsSummary.vue'
import { startK } from '@/components/gauge/window'
import OfflineNotice from '@/components/OfflineNotice.vue'
import { pendingQualityView, qualityView } from '@/components/result/qualityList'
import AutoStartNotice from '@/components/test/AutoStartNotice.vue'
import LastResult from '@/components/test/LastResult.vue'
import NoticeList from '@/components/test/NoticeList.vue'
import ResultSection from '@/components/test/ResultSection.vue'
import RunFailure from '@/components/test/RunFailure.vue'
import RunSection from '@/components/test/RunSection.vue'
import { PENDING_STEPS, phaseSteps, screenTiles } from '@/components/test/screen/states'
import { continuousView } from '@/components/test/continuous/continuous'
import { loadView } from '@/components/test/loadView'
import { gaugeInput, offlineGauge } from '@/components/test/screen/view'
import { useContextLabel } from '@/composables/useContextLabel'
import { useCountdown } from '@/composables/useCountdown'
import { useElapsed } from '@/composables/useElapsed'
import { useHistory } from '@/composables/useHistory'
import { useInfo } from '@/composables/useInfo'
import { useResultSave } from '@/composables/useResultSave'
import { type StartOptions, useRun } from '@/composables/useRun'
import { takeRunAgain } from '@/composables/useRunAgain'
import { effectiveSettings, useSettings } from '@/composables/useSettings'
import { useTestKeys } from '@/composables/useTestKeys'
import { useTestScreen } from '@/composables/useTestScreen'
import { consumeAutoRun, urlOverride, useUrlParams } from '@/composables/useUrlParams'
import type { Preset } from '@/engine/messages'
import { continuousDirection, runPhases } from '@/lib/continuous'
import { DEFAULT_AUTO_START } from '@/lib/settingsStorage'
import { SECOND } from '@/lib/urlValues'

// The Test screen (ui/screens.md section 1, kit TestScreen.jsx): idle, the auto-start countdown,
// running per phase, done, cancelled, error and offline, from the run's live view. A complete result
// is saved to history as the run ends (ui/flows.md section 1 step 5), and the idle state links to the
// latest saved result. The engine's Worker starts with the page, is configured with the settings
// stored in this browser over the server's defaults, and the URL parameters on top, as soon as they
// are known (ui/url-params.md), and ends when the page unmounts.

const { info, reachability, refresh, nextCheckS } = useInfo()
const url = useUrlParams()
const { stored } = useSettings()
const run = useRun({ base: (serverDefaults) => effectiveSettings(url, serverDefaults, stored.value).settings, override: (base) => urlOverride(url, base).override })
const { defaults, settings } = run
// The stored Auto-start's countdown length; a later change applies from the next page load.
const countdown = useCountdown((stored.value.autoStart?.countdownS ?? DEFAULT_AUTO_START.countdownS) * SECOND)
const { label: contextLabel } = useContextLabel(computed(() => info.value?.client.suggestedLabel))
const { t, locale } = useI18n()
const host = window.location.host

const counting = computed(() => countdown.remainingMs.value !== null)
// The URL parameters ignored; before the first run they show as the notices a run will carry.
const ignored = computed(() => (defaults.value === null ? url.ignored : effectiveSettings(url, defaults.value, stored.value).ignored))
const { view, state, running, notices, dismiss, disabledReason } = useTestScreen({ run, info: { info, reachability }, counting, ignored })
const wording = computed(() => ({ t, locale: locale.value }))
// A run shows the settings it runs with; between runs, those the next one starts from.
const shownSettings = computed(() => (state.value === 'idle' ? null : run.runSettings.value) ?? settings.value)
const units = computed(() => shownSettings.value?.units ?? 'bits')

// Without the server's settings the phases, tiles and load card still show, pending and empty.
const steps = computed(() => (shownSettings.value === null ? PENDING_STEPS : phaseSteps(view.value, shownSettings.value, locale.value)))
// The ended result kept in history by the user (Keep in history), which then reads "saved as".
const kept = shallowRef(false)
const gaugeContext = computed(() => ({ ...wording.value, units: units.value, server: info.value?.server.name ?? host, kept: kept.value }))
const offline = computed(() => state.value === 'idle' && reachability.value === 'unreachable')
const gauge = computed(() => (offline.value ? offlineGauge(gaugeContext.value, nextCheckS.value) : gaugeInput(view.value, gaugeContext.value)))
const elapsed = useElapsed(running, view)
const load = computed(() =>
  loadView(
    {
      status: run.status.value,
      phases: shownSettings.value === null ? PENDING_STEPS.map((step) => step.phase) : runPhases(shownSettings.value),
      states: { download: run.phases.value.download.state, upload: run.phases.value.upload.state },
      stoppedEarly: run.status.value === 'idle' && run.phases.value.idle.state !== 'pending',
      pings: run.loaded.value,
      // The finished idle phase's median alone: the progress median exists from the first ping.
      idleMedianMs: run.phases.value.idle.idle?.medianMs ?? null,
      result: run.result.value,
      protocol: state.value === 'idle' ? null : run.protocol.value,
      continuous: continuousDirection(shownSettings.value) !== null,
    },
    wording.value,
  ),
)
// The quality list: on every state of a standard run, as the kit's Test screen shows it, "—" until
// an ended run's result scores it, "needs a full test" when it ended without one; a Continuous
// run's only in its finished result (ui/screens.md section 1).
const quality = computed(() => {
  const result = state.value !== 'idle' && !running.value ? run.result.value : null
  if (continuousDirection(shownSettings.value) !== null) {
    return state.value === 'done' && result !== null ? qualityView(result, wording.value) : null
  }
  const ended = state.value === 'error' || state.value === 'cancelled'
  return (result === null ? null : qualityView(result, wording.value)) ?? pendingQualityView(wording.value, ended && result === null)
})
// A Continuous run's live view, in place of the tiles once its direction starts: idle latency runs
// first with its own tiles (ui/screens.md section 1); then until the next run.
const continuous = computed(() => {
  const direction = continuousDirection(shownSettings.value)
  const settings = shownSettings.value
  if (direction === null || settings === null || state.value === 'idle' || run.phases.value[direction].state === 'pending') {
    return null
  }
  const result = running.value ? null : run.result.value
  return continuousView(
    {
      direction,
      units: units.value,
      live: run.live.value[direction],
      result: result?.[direction] ?? null,
      dataUsedBytes: result?.dataUsedBytes ?? run.dataUsedBytes.value,
      ...(settings.runLengthMs === undefined ? {} : { runLengthMs: settings.runLengthMs }),
      idleMedianMs: result?.idle?.medianMs ?? run.phases.value.idle.idle?.medianMs ?? null,
      resolutionMs: result?.client.timerResolutionMs ?? 0,
      overheadPercent: settings.overheadCompensationPercent,
      nowMs: Date.now(),
    },
    wording.value,
  )
})
const tiles = computed(() => screenTiles(view.value, shownSettings.value ?? { units: 'bits', overheadCompensationPercent: 0 }, wording.value, elapsed.value, kept.value))

// The result's label: the link's for this page load, otherwise the one stored on the Settings screen.
const label = computed(() => url.label ?? stored.value.label)

const shown = computed(() => state.value !== 'idle')
const endedResult = computed(() => (shown.value && !running.value ? run.result.value : null))
watch(
  () => endedResult.value?.id,
  () => {
    kept.value = false
  },
)
const { state: saveState } = useResultSave(run.result)
const history = useHistory()
// The latest saved result, in the idle state while no countdown runs (kit TestScreen.jsx).
const lastResult = computed(() => (state.value === 'idle' && !counting.value ? (history.results.value[0] ?? null) : null))

/** The gauge's window, carried between directions and started afresh with each run. */
const gaugeWindow = shallowRef(startK(units.value))
watch(units, (value) => {
  gaugeWindow.value = startK(value)
})

const streams = computed(() => {
  const direction = run.direction.value
  return direction === null || !shown.value ? null : (run.phases.value[direction].streams ?? run.live.value[direction]?.streams ?? null)
})

// The ramp's plateau reason once the run has a result for the direction the strip shows.
const plateau = computed(() => {
  const direction = run.direction.value
  return direction === null || !shown.value ? null : (run.result.value?.[direction]?.plateau ?? null)
})

// The HTTP/1.1 probe reservation's stream cap, from the direction that first ran reserved on: the
// strip shows the latest direction, and the reservation holds for the rest of the run.
const reserved = computed(() => {
  const notice = shown.value ? run.notices.value.find((item) => item.code === 'probe-reservation') : undefined
  return notice?.code === 'probe-reservation' ? notice.streams : null
})

function begin(preset?: Preset, again: StartOptions = {}): void {
  countdown.cancel()
  gaugeWindow.value = startK(units.value)
  // An empty context label is the user's choice of none; the engine would fall back to the suggestion.
  run.start({
    contextLabel: contextLabel.value ?? '',
    ignoredParameters: ignored.value,
    ...(label.value === undefined ? {} : { label: label.value }),
    ...(preset === undefined ? {} : { preset }),
    ...again,
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

// A link with `run`, or a stored Auto-start, counts down once the engine has the settings and Start
// is usable; Run again on a Result detail starts its result's settings at once.
watch(
  () => disabledReason.value === null && run.configured.value !== null && state.value === 'idle',
  (ready) => {
    if (!ready) {
      return
    }
    const auto = consumeAutoRun(stored.value.autoStart?.enabled === true)
    const again = takeRunAgain()
    if (again !== null) {
      begin(undefined, again)
    } else if (auto) {
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

// An unreachable server, or a run the network change ended, is checked again, so the header, the
// offline state and Start follow GET /info (ui/flows.md section 5).
watch(run.error, (error) => {
  if (error?.code === 'server-unreachable' || error?.code === 'network-changed') {
    void refresh()
  }
})
</script>

<template>
  <main
    id="main"
    tabindex="-1"
    class="focus:outline-none mx-auto flex w-full max-w-(--layout-max) flex-1 flex-col gap-(--layout-section-gap-compact) px-(--layout-gutter-compact) pt-4 pb-6 desktop:gap-(--layout-section-gap) desktop:px-(--layout-gutter) desktop:pt-6 desktop:pb-10"
  >
    <h1 class="sr-only text-[length:calc(2*var(--text-base))] leading-(--lh-normal) font-bold">
      {{ $t('test.title') }}
    </h1>
    <LiveRegions
      :run="view"
      :units="units"
      :continuous="continuousDirection(shownSettings) !== null"
    />
    <OfflineNotice
      v-if="reachability === 'unreachable'"
      :host="host"
      @retry="refresh"
    />
    <div class="flex flex-wrap items-end gap-x-6 gap-y-3">
      <ConnectionStrip
        :info="reachability === 'unreachable' ? null : info"
        :protocol="shown ? run.protocol.value : null"
        :streams="streams"
        :plateau="plateau"
        :reserved="reserved"
      />
      <SettingsSummary
        v-if="reachability === 'connected' && defaults !== null && shownSettings !== null"
        :settings="shownSettings"
        :defaults="defaults"
        class="ml-auto"
      />
    </div>
    <RunFailure
      v-if="state === 'error' && run.error.value !== null"
      :error="run.error.value"
      :phases="run.phases.value"
      :order="shownSettings?.phases ?? []"
      :server="gaugeContext.server"
    />
    <AutoStartNotice
      v-if="countdown.remainingMs.value !== null"
      :remaining-ms="countdown.remainingMs.value"
      :from-link="url.run"
      @cancel="countdown.cancel"
    />
    <NoticeList
      :notices="notices"
      :result="run.result.value"
      :settings="shownSettings"
      :directions="{ download: run.phases.value.download.result, upload: run.phases.value.upload.result }"
      :current="running ? run.phase.value : null"
      :idle="run.idle.value"
      @dismiss="dismiss"
      @retry="begin()"
      @preset="begin"
    />
    <RunSection
      v-model:window="gaugeWindow"
      :view="view"
      :state="state"
      :latency="run.latency.value"
      :settings="shownSettings"
      :steps="steps"
      :gauge="gauge"
      :gauge-context="gaugeContext"
      :units="units"
      :offline="offline"
      :countdown="countdown.remainingMs.value === null ? null : { remainingMs: countdown.remainingMs.value, totalMs: countdown.totalMs }"
      :disabled-reason="disabledReason"
      @press="press"
      @refresh="refresh"
    />
    <ResultSection
      v-model:kept="kept"
      :result="endedResult"
      :save="saveState"
      :tiles="tiles"
      :units="units"
      :load="load"
      :quality="quality"
      :continuous="continuous"
    />
    <LastResult
      v-if="lastResult !== null"
      :result="lastResult"
      :units="units"
    />
  </main>
</template>
