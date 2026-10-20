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

import { type Choice, DEFAULTS } from '@/demo/choice'
import { DEMO_CONFIDENCES, isDemoConfidence } from '@/demo/confidence'
import type { ContinuousLength } from '@/demo/continuousResults'
import { inputClass, rowClass, segmentClass, segmentGroupClass, selectClass } from '@/demo/panel/classes'
import { DEMO_RESPONSIVENESS, isDemoResponsiveness } from '@/demo/responsiveness'

// The demo panel's Result detail section (frontend.md section 9, kit App.jsx): the kind, standard
// or Continuous, with the Continuous result's length, which opens that result's Result detail; the
// responsiveness case of the run the Result detail shows; and the confidence per direction.

const props = defineProps<{ choice: Choice }>()
const emit = defineEmits<{ apply: [patch: Partial<Choice>] }>()

const TEXT = {
  result: 'Result detail',
  kind: 'Kind',
  length: 'Continuous length',
  responsiveness: 'Responsiveness',
  downloadConfidence: 'Download confidence',
  uploadConfidence: 'Upload confidence',
}

/** The kit's Kind and Continuous length options and their words. */
const KINDS = [
  ['standard', 'Standard'],
  ['continuous', 'Continuous'],
] as const
const LENGTHS: readonly (readonly [ContinuousLength, string])[] = [
  ['2h', '2 h'],
  ['9d', '9 days'],
]

/** A Continuous choice opens its result's Result detail once the page has loaded with it. */
function onKind(patch: Pick<Choice, 'resultKind'> | Pick<Choice, 'resultLength'>): void {
  const next = { ...props.choice, ...patch }
  emit('apply', { ...patch, openResult: next.resultKind === 'continuous' })
}

const ids = { responsiveness: useId(), downloadConfidence: useId(), uploadConfidence: useId() }

function onResponsiveness(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('apply', { resultResponsiveness: isDemoResponsiveness(value) ? value : DEFAULTS.resultResponsiveness, openResult: props.choice.resultKind === 'continuous' })
}

function onConfidence(event: Event, key: 'downloadConfidence' | 'uploadConfidence'): void {
  const value = (event.target as HTMLSelectElement).value
  emit('apply', { [key]: isDemoConfidence(value) ? value : DEFAULTS[key] })
}
</script>

<template>
  <section class="flex flex-col gap-2 border-t border-border pt-3">
    <span class="text-(length:--text-caption) font-semibold text-muted-foreground">{{ TEXT.result }}</span>
    <div :class="rowClass">
      <span>{{ TEXT.kind }}</span>
      <div
        role="group"
        :aria-label="TEXT.kind"
        :class="segmentGroupClass"
      >
        <button
          v-for="[value, words] in KINDS"
          :key="value"
          type="button"
          :aria-pressed="choice.resultKind === value"
          :class="[segmentClass, choice.resultKind === value ? 'bg-(--primary-bg) text-primary-text' : 'text-muted-foreground']"
          :data-testid="`demo-result-kind-${value}`"
          @click="onKind({ resultKind: value })"
        >
          {{ words }}
        </button>
      </div>
    </div>
    <div
      v-if="choice.resultKind === 'continuous'"
      :class="rowClass"
    >
      <span>{{ TEXT.length }}</span>
      <div
        role="group"
        :aria-label="TEXT.length"
        :class="segmentGroupClass"
      >
        <button
          v-for="[value, words] in LENGTHS"
          :key="value"
          type="button"
          :aria-pressed="choice.resultLength === value"
          :class="[segmentClass, choice.resultLength === value ? 'bg-(--primary-bg) text-primary-text' : 'text-muted-foreground']"
          :data-testid="`demo-result-length-${value}`"
          @click="onKind({ resultLength: value })"
        >
          {{ words }}
        </button>
      </div>
    </div>
    <div :class="rowClass">
      <label :for="ids.responsiveness">{{ TEXT.responsiveness }}</label>
      <span :class="inputClass">
        <select
          :id="ids.responsiveness"
          :class="selectClass"
          :value="choice.resultResponsiveness"
          data-testid="demo-result-responsiveness"
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
    <div
      v-for="key in ['downloadConfidence', 'uploadConfidence'] as const"
      :key="key"
      :class="rowClass"
    >
      <label :for="ids[key]">{{ TEXT[key] }}</label>
      <span :class="inputClass">
        <select
          :id="ids[key]"
          :class="selectClass"
          :value="choice[key]"
          :data-testid="`demo-${key}`"
          @change="onConfidence($event, key)"
        >
          <option
            v-for="[value, words] in DEMO_CONFIDENCES"
            :key="value"
            :value="value"
          >
            {{ words }}
          </option>
        </select>
      </span>
    </div>
  </section>
</template>
