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
import { useId } from 'vue'

import { type Choice, DEFAULTS, ERROR_KINDS, NAMES, RESOLUTIONS } from '@/demo/choice'
import { inputClass, rowClass, selectClass } from '@/demo/panel/classes'
import { DEMO_RESPONSIVENESS, isDemoResponsiveness } from '@/demo/responsiveness'
import { isScenarioName } from '@/demo/scenarios'

// The demo panel's Test screen section (frontend.md section 9, kit App.jsx): a forced state, a
// CPU-bound Worker, the error kind, the responsiveness case and the timer resolution.

defineProps<{ choice: Choice }>()
const emit = defineEmits<{ apply: [patch: Partial<Choice>] }>()

const TEXT = {
  testScreen: 'Test screen',
  forceState: 'Force state',
  followRun: 'follow run',
  cpuBound: 'CPU-bound',
  errorKind: 'Error kind',
  responsiveness: 'Responsiveness',
  timerResolution: 'Timer resolution',
}

const ids = { forceState: useId(), errorKind: useId(), responsiveness: useId(), timer: useId() }

function apply(patch: Partial<Choice>): void {
  emit('apply', patch)
}

function selected(event: Event): string {
  return (event.target as HTMLSelectElement).value
}

function onForceState(event: Event): void {
  const value = selected(event)
  apply({ forceState: isScenarioName(value) ? value : '' })
}

function onErrorKind(event: Event): void {
  const value = selected(event)
  apply({ errorKind: ERROR_KINDS.find((kind) => kind === value) ?? DEFAULTS.errorKind })
}

function onResponsiveness(event: Event): void {
  const value = selected(event)
  apply({ responsiveness: isDemoResponsiveness(value) ? value : DEFAULTS.responsiveness })
}

function onTimer(event: Event): void {
  const value = Number(selected(event))
  apply({ timerResolutionMs: RESOLUTIONS.find((resolution) => resolution === value) ?? DEFAULTS.timerResolutionMs })
}
</script>

<template>
  <section class="flex flex-col gap-2 border-t border-border pt-3">
    <span class="text-(length:--text-caption) font-semibold text-muted-foreground">{{ TEXT.testScreen }}</span>
    <div :class="rowClass">
      <label :for="ids.forceState">{{ TEXT.forceState }}</label>
      <span :class="inputClass">
        <select
          :id="ids.forceState"
          :class="selectClass"
          :value="choice.forceState"
          data-testid="demo-force-state"
          @change="onForceState"
        >
          <option value="">
            {{ TEXT.followRun }}
          </option>
          <option
            v-for="name in NAMES"
            :key="name"
            :value="name"
          >
            {{ name }}
          </option>
        </select>
      </span>
    </div>
    <label class="flex cursor-pointer items-center gap-2 text-(length:--text-caption) text-muted-foreground">
      <input
        type="checkbox"
        class="size-3.5 flex-none accent-(--primary)"
        :checked="choice.cpuBound"
        data-testid="demo-cpu"
        @change="apply({ cpuBound: !choice.cpuBound })"
      >{{ TEXT.cpuBound }}</label>
    <div :class="rowClass">
      <label :for="ids.errorKind">{{ TEXT.errorKind }}</label>
      <span :class="inputClass">
        <select
          :id="ids.errorKind"
          :class="selectClass"
          :value="choice.errorKind"
          data-testid="demo-error-kind"
          @change="onErrorKind"
        >
          <option
            v-for="kind in ERROR_KINDS"
            :key="kind"
            :value="kind"
          >
            {{ kind }}
          </option>
        </select>
      </span>
    </div>
    <div :class="rowClass">
      <label :for="ids.responsiveness">{{ TEXT.responsiveness }}</label>
      <span :class="inputClass">
        <select
          :id="ids.responsiveness"
          :class="selectClass"
          :value="choice.responsiveness"
          data-testid="demo-responsiveness"
          @change="onResponsiveness"
        >
          <option
            v-for="[value, words] in DEMO_RESPONSIVENESS"
            :key="value"
            :value="value"
          >
            {{ words }}
          </option>
        </select>
      </span>
    </div>
    <div :class="rowClass">
      <label :for="ids.timer">{{ TEXT.timerResolution }}</label>
      <span :class="inputClass">
        <select
          :id="ids.timer"
          :class="selectClass"
          :value="String(choice.timerResolutionMs)"
          data-testid="demo-timer"
          @change="onTimer"
        >
          <option
            v-for="resolution in RESOLUTIONS"
            :key="resolution"
            :value="String(resolution)"
          >
            {{ `${resolution} ms` }}
          </option>
        </select>
      </span>
    </div>
  </section>
</template>
