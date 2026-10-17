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
import { CircleCheck, FileJson, Upload, X } from '@lucide/vue'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import StatusPill from '@/components/status/StatusPill.vue'
import NoticeBox from '@/components/test/NoticeBox.vue'
import type { History } from '@/composables/useHistory'
import { MAX_IMPORT_BYTES, type RejectedRecord } from '@/history/import'

// Import JSON (ui/screens.md section 3, frontend.md section 5; kit History.jsx): the browser's file
// dialog, then the import in progress, its summary (added, skipped as duplicates, rejected with each
// record's position and reason) or the whole file refused with its reason. The summary's pills are
// neutral: the kit's ok and warn pills lack contrast on the notice's own tinted surface. A CSV export is refused
// by its name before it is read: it is a summary and can't be restored. The page opens the dialog
// through `open`, from its header and its empty state.

const props = defineProps<{ history: History }>()

type Refusal = 'csv' | 'notJson' | 'notHistory' | 'tooLarge' | 'unreadable' | 'unavailable' | 'writeFailed'
type ImportState =
  | { kind: 'busy'; file: string }
  | { kind: 'done'; file: string; added: number; skipped: number; rejected: RejectedRecord[] }
  | { kind: 'failed'; file: string; reason: Refusal }

const REFUSALS = { 'not-json': 'notJson', 'not-history': 'notHistory', 'too-large': 'tooLarge', unavailable: 'unavailable' } as const

const { t } = useI18n()
const input = useTemplateRef<HTMLInputElement>('input')
const state = shallowRef<ImportState | null>(null)

/** Whether an import is reading or writing; the page's Import buttons wait for it. */
const busy = computed(() => state.value?.kind === 'busy')
defineExpose({ open, busy })

function open(): void {
  input.value?.click()
}

async function read(file: File): Promise<string | null> {
  try {
    return await file.text()
  } catch {
    return null
  }
}

async function picked(): Promise<void> {
  const file = input.value?.files?.[0]
  if (input.value !== null) {
    // The same file can be chosen again.
    input.value.value = ''
  }
  if (file === undefined) {
    return
  }
  if (/\.csv$/i.test(file.name)) {
    state.value = { kind: 'failed', file: file.name, reason: 'csv' }
    return
  }
  // A file over the limit is refused by its size, before any of it is read.
  if (file.size > MAX_IMPORT_BYTES) {
    state.value = { kind: 'failed', file: file.name, reason: 'tooLarge' }
    return
  }
  state.value = { kind: 'busy', file: file.name }
  const text = await read(file)
  if (text === null) {
    state.value = { kind: 'failed', file: file.name, reason: 'unreadable' }
    return
  }
  try {
    const outcome = await props.history.importText(text)
    state.value = outcome.ok ? { kind: 'done', file: file.name, ...outcome } : { kind: 'failed', file: file.name, reason: REFUSALS[outcome.refused] }
  } catch {
    // A write the database refused for another reason than its quota: nothing was added.
    state.value = { kind: 'failed', file: file.name, reason: 'writeFailed' }
  }
}

function reason(record: RejectedRecord): string {
  const position = record.index + 1
  return record.reason === 'newer-schema' ? t('history.import.newerSchema', { position, version: record.detail }) : t('history.import.invalid', { position, detail: record.detail })
}

const summary = computed(() => {
  const done = state.value
  if (done?.kind !== 'done') {
    return ''
  }
  const counts = t('history.import.summary', { added: done.added, skipped: done.skipped, rejected: done.rejected.length })
  return done.rejected.length === 0 ? counts : `${counts}: ${done.rejected.map(reason).join('; ')}`
})

function refusal(reason: Refusal): string {
  switch (reason) {
    case 'csv':
      return t('history.import.refused.csv')
    case 'notJson':
      return t('history.import.refused.notJson')
    case 'notHistory':
      return t('history.import.refused.notHistory')
    case 'tooLarge':
      return t('history.import.refused.tooLarge')
    case 'unreadable':
      return t('history.import.refused.unreadable')
    case 'unavailable':
      return t('history.import.refused.unavailable')
    case 'writeFailed':
      return t('history.import.refused.writeFailed')
  }
}
</script>

<template>
  <input
    ref="input"
    type="file"
    accept=".json,application/json"
    class="sr-only"
    tabindex="-1"
    aria-hidden="true"
    :aria-label="t('history.import.file')"
    data-testid="import-input"
    @change="picked"
  >
  <NoticeBox
    v-if="state?.kind === 'busy'"
    tone="neutral"
    :icon="Upload"
    :title="t('history.import.progressTitle', { file: state.file })"
    :body="t('history.import.progressBody')"
    data-testid="import-busy"
  />
  <NoticeBox
    v-else-if="state?.kind === 'done'"
    tone="ok"
    :icon="CircleCheck"
    :title="t('history.import.doneTitle', { file: state.file })"
    :body="summary"
    data-testid="import-done"
  >
    <span class="mt-1.5 flex flex-wrap gap-1.5">
      <StatusPill :dot="false">{{ t('history.import.added', { n: state.added }) }}</StatusPill>
      <StatusPill :dot="false">{{ t('history.import.skipped', { n: state.skipped }) }}</StatusPill>
      <StatusPill
        v-if="state.rejected.length > 0"
        :dot="false"
      >{{ t('history.import.rejected', { n: state.rejected.length }) }}</StatusPill>
    </span>
    <template #actions>
      <AppButton
        variant="ghost"
        size="sm"
        class="w-(--control-h-sm) justify-center px-0"
        :aria-label="t('history.import.dismiss')"
        @click="state = null"
      >
        <X
          :size="14"
          aria-hidden="true"
        />
      </AppButton>
    </template>
  </NoticeBox>
  <NoticeBox
    v-else-if="state?.kind === 'failed'"
    tone="danger"
    :icon="FileJson"
    :title="t('history.import.failedTitle', { file: state.file })"
    :body="`${refusal(state.reason)} ${t('history.import.unchanged')}`"
    data-testid="import-failed"
  >
    <template #actions>
      <AppButton
        size="sm"
        @click="open"
      >
        <Upload
          :size="14"
          aria-hidden="true"
        />
        {{ t('history.import.another') }}
      </AppButton>
      <AppButton
        variant="ghost"
        size="sm"
        class="w-(--control-h-sm) justify-center px-0"
        :aria-label="t('history.import.dismiss')"
        @click="state = null"
      >
        <X
          :size="14"
          aria-hidden="true"
        />
      </AppButton>
    </template>
  </NoticeBox>
</template>
