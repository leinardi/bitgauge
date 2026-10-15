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
import { CircleCheck, CircleMinus } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import DownloadJson from '@/components/test/DownloadJson.vue'
import type { Result } from '@/engine/messages'

// The result's status bar (ui/screens.md section 1, kit TestScreen.jsx v0.1 branch): v0.1 has no
// history, so a complete result says it is not stored, with the time the run ended, and a partial
// or error result says partial results are not saved. Download JSON is the only action. The kit
// words the partial and the error variant alike.

const props = defineProps<{ result: Result }>()

const { t, locale } = useI18n()

const complete = computed(() => props.result.status === 'complete')
const endedAt = computed(() => {
  const end = new Date(new Date(props.result.startedAt).getTime() + props.result.durationMs)
  return Number.isNaN(end.getTime()) ? '' : new Intl.DateTimeFormat(locale.value, { timeStyle: 'medium' }).format(end)
})
const title = computed(() => (complete.value ? t('test.bar.complete') : t('test.bar.unsaved')))
const body = computed(() => (complete.value ? t('test.bar.completeBody') : t('test.bar.unsavedBody')))
</script>

<template>
  <section
    class="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-(--radius-lg) border border-border bg-card px-4 py-3"
    :aria-label="$t('test.bar.label')"
    data-testid="result-bar"
  >
    <span
      role="status"
      class="flex items-center gap-2 text-(length:--text-sm) font-semibold"
    >
      <component
        :is="complete ? CircleCheck : CircleMinus"
        :size="16"
        aria-hidden="true"
        :class="complete ? 'text-(--ok)' : 'text-subtle-foreground'"
      />
      {{ title }}
      <span
        v-if="complete && endedAt"
        class="font-mono text-(length:--text-caption) font-normal text-subtle-foreground"
        data-testid="result-bar-time"
      >{{ endedAt }}</span>
    </span>
    <span class="min-w-0 flex-[1_1_var(--layout-text-basis)] text-(length:--text-caption) text-pretty text-subtle-foreground">{{ body }}</span>
    <span class="ml-auto flex">
      <DownloadJson
        :result="result"
        :variant="complete ? 'secondary' : 'ghost'"
      />
    </span>
  </section>
</template>
