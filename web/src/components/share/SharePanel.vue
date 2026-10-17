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
import { nextTick, useId, useTemplateRef, watch } from 'vue'
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
// copy by hand. The Result detail shows it beside the metrics, the Test screen in a dialog.

const props = defineProps<{ result: Result; units: 'bits' | 'bytes' }>()

const { t } = useI18n()
const imageId = useId()
const textId = useId()
const includeId = useId()
const { includeLabel, hasLabel, view, denied, busy, canShare, download, copy, share } = useShare(
  () => props.result,
  () => props.units,
)
const summary = useTemplateRef<HTMLPreElement>('summary')
const LINE_BREAK = '\n'

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
    class="flex flex-col gap-4"
    data-testid="share-panel"
  >
    <SettingsCard
      :id="imageId"
      :title="t('share.image.title')"
      :icon="Image"
    >
      <template #actions>
        <span class="font-mono text-(length:--text-micro) text-subtle-foreground">{{ t('share.image.size') }}</span>
      </template>
      <div class="flex flex-col gap-3 p-3.5">
        <SharePreview :view="view" />
        <div class="flex items-start gap-2">
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
            <span class="text-(length:--text-micro) text-subtle-foreground">{{ hasLabel ? t('share.include.note', { label: result.label }) : t('share.include.none') }}</span>
          </label>
        </div>
        <div
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
              :size="16"
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
              :size="16"
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
    >
      <template #actions>
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
        class="m-3 mb-0"
        data-testid="copy-denied"
      />
      <pre
        ref="summary"
        tabindex="0"
        :aria-label="t('share.text.heading')"
        class="m-0 bg-(--term-bg) px-4 py-3 font-mono text-(length:--text-micro) leading-(--lh-relaxed) whitespace-pre-wrap text-(--term-fg) select-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        :class="denied ? 'outline-2 -outline-offset-2 outline-ring' : ''"
        data-testid="share-summary"
      >{{ view.lines.join(LINE_BREAK) }}</pre>
    </SettingsCard>
  </div>
</template>
