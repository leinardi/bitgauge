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
import { ChevronLeft, House, Pencil, RotateCcw, Shield, Tag, Trash2, TriangleAlert } from '@lucide/vue'
import { computed, nextTick, shallowRef, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import AppButton from '@/components/actions/AppButton.vue'
import { useResultEdit } from '@/components/result/edits'
import { resultDate } from '@/components/history/rows'
import { presetName } from '@/components/settings/changes'
import StatusPill from '@/components/status/StatusPill.vue'
import DownloadJson from '@/components/test/DownloadJson.vue'
import { Input } from '@/components/ui/input'
import type { Result } from '@/engine/messages'
import { MAX_LABEL } from '@/lib/urlValues'

// The Result detail's header (ui/screens.md section 2, kit ResultDetail.jsx): the breadcrumb back to
// History, the label, edited in place, the context label, the date and time with the absolute
// instant on hover, the preset and the server; the actions Download JSON, Run again and Delete,
// with the note that the JSON holds the client IP and notes. A result not in history carries the
// not-saved badge and the reason, and its label and Delete are disabled with it. Its slot sits
// between the breadcrumb and the label, where the kit puts the history-unavailable notice; its
// actions slot leads the actions, where the page puts Keep in history.

const props = defineProps<{
  result: Result
  /** Why the result cannot be edited or deleted; null when it is in history. */
  notSaved: string | null
  /** The id the reason carries, so the page's read-only note can be described by it too. */
  reasonId: string
}>()
const emit = defineEmits<{ rename: [label: string]; runAgain: []; remove: [] }>()

const { t, locale } = useI18n()
const warningId = useId()
const SEPARATOR = '·'
const SLASH = '/'

const editing = shallowRef(false)
const draft = shallowRef('')
const field = useTemplateRef<InstanceType<typeof Input>>('field')
const pencil = useTemplateRef<InstanceType<typeof AppButton>>('pencil')

const label = computed(() => props.result.label || t('result.header.noLabel'))
const started = computed(() => new Date(props.result.startedAt))
const when = computed(() => (Number.isNaN(started.value.getTime()) ? props.result.startedAt : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'medium' }).format(started.value)))
const absolute = computed(() => (Number.isNaN(started.value.getTime()) ? props.result.startedAt : new Intl.DateTimeFormat(locale.value, { dateStyle: 'full', timeStyle: 'long' }).format(started.value)))
const contextIcon = computed(() => (props.result.client.contextLabel === 'LAN' ? House : props.result.client.contextLabel === 'VPN' ? Shield : Tag))

function focusOf(target: { $el?: unknown } | null): void {
  const element = target?.$el
  if (element instanceof HTMLElement) {
    element.focus()
  }
}

async function edit(): Promise<void> {
  if (props.notSaved !== null) {
    return
  }
  draft.value = props.result.label
  editing.value = true
  await nextTick()
  focusOf(field.value)
}

/** Ends the edit, saving the draft when it changed. */
function commit(save: boolean): void {
  editing.value = false
  const next = draft.value.trim().slice(0, MAX_LABEL)
  if (save && next !== props.result.label) {
    emit('rename', next)
  }
}

async function finish(save: boolean): Promise<void> {
  if (!editing.value) {
    return
  }
  commit(save)
  await nextTick()
  focusOf(pencil.value)
}

// A label being typed is saved before Download JSON exports the result, the focus left where it is.
useResultEdit(() => {
  if (editing.value) {
    commit(true)
  }
})
</script>

<template>
  <nav
    :aria-label="t('result.breadcrumb')"
    class="flex items-center gap-1.5 text-(length:--text-sm) text-subtle-foreground"
  >
    <RouterLink
      to="/history"
      class="flex items-center gap-1 text-muted-foreground no-underline hover:text-foreground max-tablet:min-h-6"
    >
      <ChevronLeft
        :size="14"
        aria-hidden="true"
      />
      {{ t('result.history') }}
    </RouterLink>
    <span aria-hidden="true">{{ SLASH }}</span>
    <time
      :datetime="result.startedAt"
      aria-current="page"
      class="font-mono text-(length:--text-caption)"
    >{{ resultDate(result.startedAt, locale) }}</time>
  </nav>
  <slot />
  <header class="flex flex-wrap items-start gap-x-6 gap-y-4">
    <div class="flex min-w-0 flex-[1_1_360px] flex-col gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <h1
          v-if="!editing"
          class="min-w-0 text-(length:--text-3xl) leading-(--lh-tight) font-semibold tracking-(--tracking-tight) wrap-anywhere desktop:text-(length:--text-4xl)"
          data-testid="result-label"
        >
          {{ label }}
        </h1>
        <Input
          v-else
          ref="field"
          v-model="draft"
          :aria-label="t('result.header.label')"
          :maxlength="MAX_LABEL"
          class="h-(--control-h-lg) max-w-md text-(length:--text-lg) font-semibold"
          data-testid="label-input"
          @keydown.enter.prevent="finish(true)"
          @keydown.esc.prevent="finish(false)"
          @blur="finish(true)"
        />
        <AppButton
          v-if="!editing"
          ref="pencil"
          variant="ghost"
          size="sm"
          class="w-7 justify-center px-0"
          :aria-label="t('result.header.editLabel')"
          :aria-disabled="notSaved === null ? undefined : 'true'"
          :aria-describedby="notSaved === null ? undefined : props.reasonId"
          data-testid="edit-label"
          @click="edit"
        >
          <Pencil
            :size="14"
            aria-hidden="true"
          />
        </AppButton>
        <StatusPill
          v-if="notSaved !== null"
          tone="warn"
          data-testid="not-saved"
        >
          {{ t('result.header.notSaved') }}
        </StatusPill>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-(length:--text-sm) text-muted-foreground">
        <span
          v-if="result.client.contextLabel"
          class="inline-flex min-h-(--chip-h-sm) max-w-full min-w-0 items-center gap-1 rounded-full border border-(--border-default) bg-(--surface-2) px-2.5 text-(length:--text-caption) font-semibold wrap-anywhere"
        >
          <component
            :is="contextIcon"
            :size="12"
            aria-hidden="true"
          />
          <span class="min-w-0 wrap-anywhere">{{ result.client.contextLabel }}</span>
        </span>
        <time
          :datetime="result.startedAt"
          class="font-mono text-(length:--text-caption)"
          :title="absolute"
          data-testid="result-when"
        >{{ when }}</time>
        <span
          aria-hidden="true"
          class="text-subtle-foreground"
        >{{ SEPARATOR }}</span>
        <span>{{ t('result.header.preset', { preset: presetName(result.settings.preset, t) }) }}</span>
        <span
          aria-hidden="true"
          class="text-subtle-foreground"
        >{{ SEPARATOR }}</span>
        <span>{{ result.server.name }}</span>
      </div>
      <p
        v-if="notSaved !== null"
        :id="reasonId"
        class="text-(length:--text-sm) leading-(--lh-compact) text-pretty text-muted-foreground"
        data-testid="not-saved-reason"
      >
        {{ notSaved }}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
      <DownloadJson
        :result="result"
        variant="secondary"
        size="md"
        :described-by="warningId"
        confirm
      />
      <AppButton
        variant="primary"
        data-testid="run-again"
        @click="emit('runAgain')"
      >
        <RotateCcw
          :size="15"
          aria-hidden="true"
        />
        {{ t('result.actions.runAgain') }}
      </AppButton>
      <AppButton
        variant="danger"
        class="w-(--control-h-md) justify-center px-0"
        :aria-label="t('result.actions.delete')"
        :title="t('result.actions.delete')"
        :aria-disabled="notSaved === null ? undefined : 'true'"
        :aria-describedby="notSaved === null ? undefined : props.reasonId"
        data-testid="delete-result"
        @click="notSaved === null && emit('remove')"
      >
        <Trash2
          :size="15"
          aria-hidden="true"
        />
      </AppButton>
      <span
        :id="warningId"
        class="flex basis-full items-center gap-1.25 text-(length:--text-micro) text-subtle-foreground"
      >
        <TriangleAlert
          :size="12"
          :stroke-width="2"
          aria-hidden="true"
          class="text-(--warn)"
        />
        {{ t('result.actions.jsonWarning') }}
      </span>
    </div>
  </header>
</template>
