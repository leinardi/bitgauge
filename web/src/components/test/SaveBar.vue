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
import { ChevronRight, CircleCheck, Tag } from '@lucide/vue'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import AppButton from '@/components/actions/AppButton.vue'
import ShareDialog from '@/components/share/ShareDialog.vue'
import DownloadJson from '@/components/test/DownloadJson.vue'
import { Input } from '@/components/ui/input'
import { useDebouncedSave } from '@/composables/useDebouncedSave'
import { useHistory } from '@/composables/useHistory'
import type { SaveState } from '@/composables/useResultSave'
import type { Result } from '@/engine/messages'
import { MAX_LABEL } from '@/lib/urlValues'

// The save bar of a complete run (ui/screens.md section 1, design_system/components save-bar.md):
// "Saved to history" with the time the run ended, an inline label field saved as it is typed, with
// the context label and the 5 most recent distinct labels of history as suggestions; Share, which
// opens the share panel as a dialog, Download JSON and Details. While the save is under way, or
// where it failed or history is unavailable, the bar says "Test complete" and why it is not saved,
// with no label field, and keeps Share, Download JSON and Details.

const props = defineProps<{ result: Result; save: SaveState | null; units: 'bits' | 'bytes' }>()

const SUGGESTIONS = 5

const { t, locale } = useI18n()
const history = useHistory()

const saved = computed(() => props.save === 'saved')
const label = shallowRef(props.result.label)
watch(
  () => props.result.id,
  () => {
    label.value = props.result.label
  },
)
const { schedule, flush } = useDebouncedSave<{ id: string; label: string }>(({ id, label: next }) => void history.edit(id, { label: next }))

function type(value: string | number): void {
  label.value = String(value).slice(0, MAX_LABEL)
  schedule({ id: props.result.id, label: label.value })
}

function pick(suggestion: string): void {
  label.value = suggestion
  schedule({ id: props.result.id, label: suggestion })
  flush()
}

const suggestions = computed(() => {
  const recent = history.results.value.filter((stored) => stored.id !== props.result.id && stored.label !== '').map((stored) => stored.label)
  const context = props.result.client.contextLabel
  return [...new Set([...(context === '' ? [] : [context]), ...new Set(recent)])].slice(0, SUGGESTIONS + (context === '' ? 0 : 1))
})
// The share and the JSON carry the label as typed.
const shared = computed<Result>(() => ({ ...props.result, label: label.value }))

const endedAt = computed(() => {
  const end = new Date(new Date(props.result.startedAt).getTime() + props.result.durationMs)
  return Number.isNaN(end.getTime()) ? null : { iso: end.toISOString(), text: new Intl.DateTimeFormat(locale.value, { timeStyle: 'medium' }).format(end) }
})
const body = computed(() => {
  switch (props.save) {
    case 'unavailable':
      return t('test.bar.unavailable')
    case 'failed':
      return t('test.bar.notSaved')
    default:
      return ''
  }
})
</script>

<template>
  <section
    class="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-(--radius-lg) border border-border bg-card px-4 py-3"
    :aria-label="t('test.bar.label')"
    data-testid="result-bar"
  >
    <span
      role="status"
      class="flex items-center gap-2 text-(length:--text-sm) font-semibold"
    >
      <CircleCheck
        :size="16"
        aria-hidden="true"
        class="text-(--ok)"
      />
      {{ saved ? t('test.bar.saved') : t('test.bar.complete') }}
      <span
        v-if="endedAt"
        class="font-mono text-(length:--text-caption) font-normal text-subtle-foreground"
        data-testid="result-bar-time"
      ><time :datetime="endedAt.iso">{{ endedAt.text }}</time></span>
    </span>
    <span
      v-if="body"
      class="min-w-0 flex-[1_1_var(--layout-text-basis)] text-(length:--text-caption) text-pretty text-subtle-foreground"
      data-testid="result-bar-body"
    >{{ body }}</span>
    <template v-if="saved">
      <label class="flex h-(--input-h) max-w-(--layout-input-max) min-w-0 flex-[1_1_var(--layout-input-basis)] items-center gap-2 rounded-(--radius-md) border border-(--border-default) bg-(--surface-1) px-3 text-(--fg-faint) focus-within:border-ring">
        <Tag
          :size="14"
          aria-hidden="true"
        />
        <Input
          :model-value="label"
          :aria-label="t('test.bar.labelField')"
          :placeholder="t('test.bar.labelPlaceholder')"
          :maxlength="MAX_LABEL"
          class="h-auto border-0 bg-transparent p-0 text-(length:--text-sm) text-foreground shadow-none focus-visible:ring-0 dark:bg-transparent md:text-(length:--text-sm)"
          data-testid="result-label-field"
          @update:model-value="type"
          @blur="flush"
        />
      </label>
      <div
        v-if="suggestions.length > 0"
        role="group"
        :aria-label="t('test.bar.suggestions')"
        class="flex flex-wrap gap-1.5"
      >
        <button
          v-for="suggestion in suggestions"
          :key="suggestion"
          type="button"
          class="inline-flex h-(--chip-h-sm) cursor-pointer items-center gap-1 rounded-full border border-(--border-default) bg-(--surface-2) px-2.5 text-(length:--text-caption) font-semibold whitespace-nowrap text-muted-foreground hover:bg-(--surface-3) hover:text-foreground"
          :aria-pressed="label === suggestion"
          data-testid="label-suggestion"
          @click="pick(suggestion)"
        >
          {{ suggestion }}
        </button>
      </div>
    </template>
    <span class="ml-auto flex flex-wrap gap-1">
      <ShareDialog
        :result="shared"
        :units="units"
      />
      <DownloadJson
        :result="shared"
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
