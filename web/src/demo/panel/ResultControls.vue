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
import { inputClass, rowClass, selectClass } from '@/demo/panel/classes'

// The demo panel's Result detail section (frontend.md section 9, kit App.jsx): the confidence per
// direction.

defineProps<{ choice: Choice }>()
const emit = defineEmits<{ apply: [patch: Partial<Choice>] }>()

const TEXT = {
  result: 'Result detail',
  downloadConfidence: 'Download confidence',
  uploadConfidence: 'Upload confidence',
}

const ids = { downloadConfidence: useId(), uploadConfidence: useId() }

function onConfidence(event: Event, key: 'downloadConfidence' | 'uploadConfidence'): void {
  const value = (event.target as HTMLSelectElement).value
  emit('apply', { [key]: isDemoConfidence(value) ? value : DEFAULTS[key] })
}
</script>

<template>
  <section class="flex flex-col gap-2 border-t border-border pt-3">
    <span class="text-(length:--text-caption) font-semibold text-muted-foreground">{{ TEXT.result }}</span>
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
