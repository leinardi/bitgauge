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
import { ChevronRight, CircleCheck, CircleMinus } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import AppButton from '@/components/actions/AppButton.vue'
import DownloadJson from '@/components/test/DownloadJson.vue'
import { canKeep } from '@/components/test/keep'
import KeepInHistory from '@/components/test/KeepInHistory.vue'
import type { SaveState } from '@/composables/useResultSave'
import type { Result } from '@/engine/messages'

// The status bar of a partial or error result (ui/screens.md section 1, design_system/components
// save-bar.md; a complete result has the save bar): such a result is not saved unless the user
// keeps it. With a finished phase the bar offers Keep in history, then says it was saved as partial
// or error; without one it says there is nothing to keep, and where history is unavailable, that
// nothing is saved. Download JSON and Details, the result's Result detail, are always there. The
// kit words the partial and the error variant alike.

const props = defineProps<{ result: Result; save: SaveState | null }>()
/** Whether the user kept this result in history; the page resets it for each new result. */
const kept = defineModel<boolean>('kept', { required: true })

const { t } = useI18n()

const unavailable = computed(() => props.save === 'unavailable')
const keepable = computed(() => !unavailable.value && canKeep(props.result))
const title = computed(() => {
  if (!kept.value) {
    return props.result.status === 'error' ? t('test.bar.unsavedError') : t('test.bar.unsaved')
  }
  return t('test.bar.kept', { kind: props.result.status === 'error' ? t('test.bar.kinds.error') : t('test.bar.kinds.partial') })
})
const body = computed(() => {
  if (unavailable.value) {
    return t('test.bar.unavailable')
  }
  return keepable.value ? '' : t('test.bar.nothing')
})
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
        :is="kept ? CircleCheck : CircleMinus"
        :size="16"
        aria-hidden="true"
        :class="kept ? 'text-(--ok)' : 'text-subtle-foreground'"
      />
      {{ title }}
    </span>
    <span
      v-if="body"
      class="min-w-0 flex-[1_1_var(--layout-text-basis)] text-(length:--text-caption) text-pretty text-subtle-foreground"
      data-testid="result-bar-body"
    >{{ body }}</span>
    <span class="ml-auto flex flex-wrap gap-1">
      <KeepInHistory
        v-if="keepable"
        v-model:kept="kept"
        :result="result"
      />
      <DownloadJson
        :result="result"
        variant="ghost"
      />
      <AppButton
        as-child
        size="sm"
      >
        <RouterLink
          :to="`/result/${result.id}`"
          data-testid="result-details"
        >
          {{ t('test.bar.details') }}
          <ChevronRight
            :size="14"
            aria-hidden="true"
          />
        </RouterLink>
      </AppButton>
    </span>
  </section>
</template>
