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
import { Copy, Download, FileText, Image, Share } from '@lucide/vue'
import { computed, nextTick, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import SharePreview from '@/components/share/SharePreview.vue'
import NoticeBox from '@/components/test/NoticeBox.vue'
import { Checkbox } from '@/components/ui/checkbox'
import { useShare } from '@/composables/useShare'
import type { Result } from '@/engine/messages'

// The share panel (ui/screens.md section 2, ui/flows.md section 8, design_system/components
// share-panel.md): the share image's preview with "include label", off by default, Download image
// and, where the browser can share files, Share; then the text summary exactly as it is copied, with
// Copy. Where the clipboard is refused, the summary gets focus with its whole text selected for a
// copy by hand. The Result detail shows it beside the metrics, the Test screen in a dialog: there,
// as the kit's share dialog (TestScreen.jsx), the actions leave the cards for the dialog's footer,
// Share via… (only where files can be shared), Copy summary and Download image, the primary one.

const props = withDefaults(defineProps<{ result: Result; units: 'bits' | 'bytes'; inDialog?: boolean }>(), { inDialog: false })

const { t } = useI18n()
const imageId = useId()
const textId = useId()
const includeId = useId()
const { includeLabel, hasLabel, view, denied, busy, canShare, download, copy, share } = useShare(
  () => props.result,
  () => props.units,
)
const summary = useTemplateRef<HTMLPreElement>('summary')
const includeNote = computed(() => (hasLabel.value ? t('share.include.note', { label: props.result.label }) : t('share.include.none')))
const LINE_BREAK = '\n'
// In the dialog, the kit's small mono (ds-mono-sm) and its summary as a Snippet in a padded card.
const MONO_SMALL = 'font-mono text-(length:--text-caption) tracking-(--tracking-tight) text-muted-foreground'
const SNIPPET = 'overflow-x-auto overscroll-x-contain rounded-(--radius-md) border border-(--border-subtle) px-3.5 py-3 text-(length:--text-caption) whitespace-pre'

watch(denied, async (denied) => {
  if (!denied) {
    return
  }
  await nextTick()
  const element = summary.value
  if (element === null) {
    return
  }
  element.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(element)
  selection?.removeAllRanges()
  selection?.addRange(range)
})
</script>

<template>
  <div
    :class="inDialog ? 'flex flex-col' : 'flex flex-col gap-4'"
    data-testid="share-panel"
  >
    <div :class="inDialog ? 'flex flex-col gap-3 px-5' : 'contents'">
      <SettingsCard
        :id="imageId"
        :title="t('share.image.title')"
        :icon="Image"
        :level="inDialog ? 3 : 2"
      >
        <template #actions>
          <span :class="inDialog ? MONO_SMALL : undefined">{{ t('share.image.size') }}</span>
        </template>
        <div
          class="flex flex-col gap-3"
          :class="inDialog ? 'p-4' : 'p-3.5'"
        >
          <SharePreview :view="view" />
          <!-- In the dialog the label holds its box and reads on one line, its note in the small mono,
               as the kit's share dialog; on the Result detail the note goes under it. -->
          <label
            v-if="inDialog"
            class="flex items-center gap-2 text-(length:--text-sm)"
            :class="hasLabel ? 'cursor-pointer' : 'text-subtle-foreground'"
          >
            <Checkbox
              v-model="includeLabel"
              :disabled="!hasLabel"
              data-testid="include-label"
            />
            {{ t('share.include.label') }}
            <span :class="MONO_SMALL">{{ includeNote }}</span>
          </label>
          <div
            v-else
            class="flex items-start gap-2"
          >
            <Checkbox
              :id="includeId"
              v-model="includeLabel"
              :disabled="!hasLabel"
              class="mt-0.5"
              data-testid="include-label"
            />
            <label
              :for="includeId"
              class="flex flex-col gap-px text-(length:--text-sm)"
              :class="hasLabel ? 'cursor-pointer' : 'text-subtle-foreground'"
            >
              {{ t('share.include.label') }}
              <span class="text-(length:--text-micro) text-subtle-foreground">{{ includeNote }}</span>
            </label>
          </div>
          <div
            v-if="!inDialog"
            class="grid gap-2"
            :class="canShare ? 'grid-cols-2' : 'grid-cols-1'"
          >
            <AppButton
              v-if="canShare"
              class="justify-center"
              :title="t('share.image.shareHint')"
              :disabled="busy"
              data-testid="share-image"
              @click="share"
            >
              <Share
                :size="15"
                aria-hidden="true"
              />
              {{ t('share.image.share') }}
            </AppButton>
            <AppButton
              class="justify-center"
              :disabled="busy"
              data-testid="download-image"
              @click="download"
            >
              <Download
                :size="15"
                aria-hidden="true"
              />
              {{ t('share.image.save') }}
            </AppButton>
          </div>
        </div>
      </SettingsCard>
      <SettingsCard
        :id="textId"
        :title="t('share.text.heading')"
        :icon="FileText"
        :level="inDialog ? 3 : 2"
        :padded="inDialog"
      >
        <template
          v-if="!inDialog"
          #actions
        >
          <AppButton
            variant="ghost"
            size="sm"
            :aria-label="t('share.text.copy')"
            data-testid="copy-summary"
            @click="copy"
          >
            <Copy
              :size="14"
              aria-hidden="true"
            />
            {{ t('share.text.copyShort') }}
          </AppButton>
        </template>
        <NoticeBox
          v-if="denied"
          tone="warn"
          :icon="Copy"
          :title="t('share.text.denied')"
          :body="t('share.text.deniedBody')"
          attached
          data-testid="copy-denied"
        />
        <pre
          ref="summary"
          tabindex="0"
          :aria-label="t('share.text.heading')"
          class="m-0 bg-(--term-bg) font-mono leading-(--lh-relaxed) text-(--term-fg) select-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          :class="[denied ? 'outline-2 -outline-offset-2 outline-ring' : '', inDialog ? SNIPPET : 'px-4 py-3 text-(length:--text-micro) whitespace-pre-wrap']"
          data-testid="share-summary"
        >{{ view.lines.join(LINE_BREAK) }}</pre>
      </SettingsCard>
    </div>
    <div
      v-if="inDialog"
      class="sticky bottom-0 mt-3.5 flex flex-wrap items-center justify-end gap-2.5 bg-(--surface-2) px-5 py-4 max-tablet:flex-col-reverse max-tablet:items-stretch max-tablet:[&>*]:justify-center"
      data-testid="share-actions"
    >
      <AppButton
        v-if="canShare"
        variant="ghost"
        :title="t('share.image.shareHint')"
        :disabled="busy"
        data-testid="share-image"
        @click="share"
      >
        <Share
          :size="15"
          aria-hidden="true"
        />
        {{ t('share.image.shareVia') }}
      </AppButton>
      <AppButton
        data-testid="copy-summary"
        @click="copy"
      >
        <Copy
          :size="15"
          aria-hidden="true"
        />
        {{ t('share.text.copy') }}
      </AppButton>
      <AppButton
        variant="primary"
        :disabled="busy"
        data-testid="download-image"
        @click="download"
      >
        <Download
          :size="15"
          aria-hidden="true"
        />
        {{ t('share.image.save') }}
      </AppButton>
    </div>
  </div>
</template>
