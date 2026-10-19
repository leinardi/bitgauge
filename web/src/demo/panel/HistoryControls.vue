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
import { DEMO_HISTORY_VARIANTS, isDemoHistory } from '@/demo/history'
import { inputClass, rowClass, selectClass } from '@/demo/panel/classes'

// The demo panel's History section (frontend.md section 9, kit App.jsx): the History variant.

defineProps<{ choice: Choice }>()
const emit = defineEmits<{ apply: [patch: Partial<Choice>] }>()

const TEXT = {
  history: 'History',
  historyVariant: 'Force variant',
  historyStored: 'stored',
}

const ids = { history: useId() }

function onHistory(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('apply', { history: isDemoHistory(value) ? value : DEFAULTS.history })
}
</script>

<template>
  <section class="flex flex-col gap-2 border-t border-border pt-3">
    <span class="text-(length:--text-caption) font-semibold text-muted-foreground">{{ TEXT.history }}</span>
    <div :class="rowClass">
      <label :for="ids.history">{{ TEXT.historyVariant }}</label>
      <span :class="inputClass">
        <select
          :id="ids.history"
          :class="selectClass"
          :value="choice.history"
          data-testid="demo-history"
          @change="onHistory"
        >
          <option
            v-for="variant in DEMO_HISTORY_VARIANTS"
            :key="variant"
            :value="variant"
          >
            {{ variant === '' ? TEXT.historyStored : variant }}
          </option>
        </select>
      </span>
    </div>
  </section>
</template>
