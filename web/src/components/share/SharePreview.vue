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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BrandLogo from '@/components/brand/BrandLogo.vue'
import type { ShareView } from '@/share/summary'

// The share image's preview (design_system/components/measurement SharePreview.jsx, share-panel.md):
// the 1200 × 630 image scaled into its card, always in the dark theme, with exactly the parts the
// image draws (share/render.ts). Named for assistive technology by the summary it carries.

const props = defineProps<{ view: ShareView }>()

const { t } = useI18n()
const TONES = {
  ok: 'border-(--ok-border) bg-(--ok-bg) text-(--grade-good)',
  warn: 'border-(--warn-border) bg-(--warn-bg) text-(--grade-fair)',
  danger: 'border-(--danger-border) bg-(--danger-bg) text-(--grade-poor)',
} as const
const COLORS = { download: 'var(--series-download)', upload: 'var(--series-upload)' }

const tone = computed(() => {
  const letter = props.view.grade?.letter
  return letter === 'F' ? TONES.danger : letter === 'C' || letter === 'D' ? TONES.warn : TONES.ok
})
const label = computed(() => t('share.image.preview', { summary: props.view.lines.join(', ') }))
</script>

<template>
  <div
    data-theme="dark"
    role="img"
    :aria-label="label"
    class="flex aspect-(--share-aspect) flex-col justify-between rounded-(--radius-md) border border-(--border-default) bg-(--bg-base) px-4 py-3.5 text-foreground"
    data-testid="share-preview"
  >
    <div class="flex min-w-0 items-center gap-1.5">
      <BrandLogo :size="15" />
      <span class="text-(length:--text-micro) leading-(--lh-tight) font-semibold tracking-(--tracking-tight)">{{ t('app.brand.bit') }}<span class="text-primary-text">{{ t('app.brand.gauge') }}</span></span>
      <span class="ml-auto truncate font-mono text-(length:--text-pico) text-subtle-foreground">{{ view.head }}</span>
    </div>
    <div class="flex items-end gap-4.5">
      <div
        v-for="block in view.blocks"
        :key="block.direction"
        class="flex flex-col"
      >
        <span
          class="font-condensed text-(length:--type-share-label) font-semibold tracking-(--tracking-caps) uppercase"
          :style="{ color: COLORS[block.direction] }"
        >{{ block.label }}</span>
        <span
          class="font-mono text-(length:--type-share-value) leading-none font-medium"
          :class="block.value === '—' ? 'text-subtle-foreground' : ''"
        >{{ block.value }}<span class="ml-0.75 font-sans text-(length:--text-nano) text-muted-foreground">{{ block.unit }}</span></span>
        <span
          v-if="block.qualifier"
          class="text-(length:--text-pico) text-(--warn-fg)"
        >{{ block.qualifier }}</span>
      </div>
      <span
        v-if="view.grade"
        class="ml-auto flex items-center gap-1.5"
      >
        <span
          class="flex size-(--grade-size-sm) items-center justify-center rounded-(--radius-sm) border font-mono text-(length:--text-md) font-semibold"
          :class="tone"
        >{{ view.grade.letter }}</span>
        <span class="flex flex-col text-(length:--text-pico) leading-(--lh-snug)">
          <b>{{ view.grade.word }}</b>
          <span class="text-subtle-foreground">{{ t('share.image.bufferbloat') }}</span>
        </span>
      </span>
    </div>
    <div class="flex flex-wrap gap-x-3 gap-y-1 font-mono text-(length:--text-pico) text-muted-foreground">
      <span
        v-for="(item, index) in view.foot"
        :key="index"
      >{{ item }}</span>
      <span class="ml-auto text-subtle-foreground">{{ view.server }}</span>
    </div>
  </div>
</template>
