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
import { useResizeObserver } from '@vueuse/core'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import BrandLogo from '@/components/brand/BrandLogo.vue'
import type { QualifierTone, ShareView } from '@/share/summary'

// The share image's preview (design_system components/measurement SharePreview.jsx, share-panel.md
// "Share image layout"): the image's 480 × 252 reference box, always in the dark theme, scaled to
// the panel's width, so the preview is the PNG (share/render.ts draws the same box at 2.5×) at any
// width. The header on top, the foot on the bottom padding, and between them the group of number
// row and qualifier stacks, centered, with the grade and its words on the number row; both numbers
// share one row whatever their qualifiers.
// Named for assistive technology by the summary it carries.

const props = defineProps<{ view: ShareView }>()

const { t } = useI18n()
const TONES = {
  ok: 'border-(--ok-border) bg-(--ok-bg) text-(--grade-good)',
  warn: 'border-(--warn-border) bg-(--warn-bg) text-(--grade-fair)',
  danger: 'border-(--danger-border) bg-(--danger-bg) text-(--grade-poor)',
} as const
const QUALIFIER_TONES: Record<QualifierTone, string> = { muted: '', warn: 'text-(--warn-fg)', danger: 'text-(--danger-fg)' }
const COLUMNS = ['col-start-1', 'col-start-2'] as const
const COLORS = { download: 'var(--series-download)', upload: 'var(--series-upload)' }

const frame = useTemplateRef<HTMLElement>('frame')
const box = useTemplateRef<HTMLElement>('box')
const scale = shallowRef(1)
// The box keeps its token size; the frame's width scales it, as the image is the box at 2.5×.
useResizeObserver(frame, () => {
  const width = box.value?.offsetWidth ?? 0
  scale.value = width > 0 ? (frame.value?.clientWidth ?? width) / width : 1
})

const tone = computed(() => {
  const letter = props.view.grade?.letter
  return letter === 'F' ? TONES.danger : letter === 'C' || letter === 'D' ? TONES.warn : TONES.ok
})
const label = computed(() => t('share.image.preview', { summary: props.view.lines.join(', ') }))
</script>

<template>
  <div
    ref="frame"
    data-theme="dark"
    role="img"
    :aria-label="label"
    class="relative aspect-(--share-aspect) w-full overflow-hidden rounded-(--radius-md) bg-(--bg-base) shadow-[0_0_0_var(--border-width)_var(--border-default)]"
    data-testid="share-preview"
  >
    <div
      ref="box"
      class="absolute top-0 left-0 box-border flex h-(--share-h) w-(--share-w) origin-top-left flex-col bg-(--bg-base) px-(--share-pad-x) py-(--share-pad-y) text-foreground"
      :style="{ transform: `scale(${scale})` }"
    >
      <div class="flex h-(--share-header-h) min-w-0 flex-none items-center gap-4.5">
        <span class="inline-flex flex-none items-center gap-2 text-(length:--text-md) leading-(--lh-tight) font-semibold tracking-(--tracking-tight)">
          <BrandLogo :size="20" />
          <span>{{ t('app.brand.bit') }}<span class="text-primary-text">{{ t('app.brand.gauge') }}</span></span>
        </span>
        <span
          v-if="view.head"
          class="ml-auto min-w-0 truncate font-mono text-(length:--type-share-head) text-subtle-foreground"
        >{{ view.head }}</span>
      </div>
      <div class="flex min-h-0 flex-1 items-center py-(--share-gap-min)">
        <div class="grid w-full grid-cols-[repeat(2,var(--share-block-w))_minmax(0,1fr)] grid-rows-[var(--share-label-h)_var(--type-share-value)_auto] gap-x-3.5 gap-y-0.75">
          <template
            v-for="(block, index) in view.blocks"
            :key="block.direction"
          >
            <span
              class="row-start-1 self-end font-condensed text-(length:--type-share-label) leading-(--share-label-h) font-semibold tracking-(--tracking-caps) whitespace-nowrap uppercase"
              :class="COLUMNS[index]"
              :style="{ color: COLORS[block.direction] }"
            >{{ block.label }}</span>
            <span
              class="row-start-2 flex items-baseline font-mono text-(length:--type-share-value) leading-none font-medium tracking-normal whitespace-nowrap"
              :class="[COLUMNS[index], block.value === '—' ? 'text-subtle-foreground' : '']"
            >{{ block.value }}<span
              v-if="block.unit"
              class="ml-1 font-sans text-(length:--type-share-unit) font-normal text-muted-foreground"
            >{{ block.unit }}</span></span>
            <span
              v-if="block.qualifiers.length > 0"
              class="row-start-3 mt-0.5 flex flex-col font-mono text-(length:--type-share-qual) leading-(--lh-snug) text-muted-foreground"
              :class="COLUMNS[index]"
            >
              <span
                v-for="qualifier in block.qualifiers"
                :key="qualifier.text"
                :class="QUALIFIER_TONES[qualifier.tone]"
              >{{ qualifier.text }}</span>
            </span>
          </template>
          <span
            v-if="view.grade"
            class="col-start-3 row-start-2 flex items-center gap-1.5 self-center justify-self-end"
          >
            <span
              class="flex size-(--share-grade-size) items-center justify-center rounded-(--radius-md) border font-mono text-(length:--type-share-grade) font-semibold tracking-(--tracking-metric)"
              :class="tone"
            >{{ view.grade.letter }}</span>
            <span class="flex flex-col items-start text-(length:--type-share-meta) leading-(--lh-snug) whitespace-nowrap">
              <b>{{ view.grade.word }}</b>
              <span class="text-subtle-foreground">{{ t('share.image.bufferbloat') }}</span>
              <span
                v-if="view.grade.basis"
                class="text-subtle-foreground"
              >{{ view.grade.basis }}</span>
            </span>
          </span>
        </div>
      </div>
      <div class="flex flex-none flex-wrap items-baseline gap-x-3.5 gap-y-0.75 font-mono text-(length:--type-share-meta) leading-(--lh-snug) text-muted-foreground">
        <span
          v-for="(item, index) in view.foot"
          :key="index"
          class="whitespace-nowrap"
        >{{ item }}</span>
        <span class="ml-auto flex min-w-0 whitespace-nowrap text-subtle-foreground">
          <span class="block max-w-(--share-server-max) min-w-0 truncate">{{ view.server }}</span>{{ `\u00a0·\u00a0${view.date}` }}
        </span>
      </div>
    </div>
  </div>
</template>
