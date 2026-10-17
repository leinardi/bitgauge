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
import { ArrowDown, ArrowUp } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { GradeView, LoadRow } from '@/components/result/load'

// The load card (design_system/components/measurement LoadCard.jsx, measurement.css .load): the
// bufferbloat grade as a letter in a box of its tone, the scale strip with it marked and its words,
// never color alone, with the basis; beside it a row per direction with its loaded latency, its
// source and qualifiers, and the median in ms or "—". The Test screen shows it too, with a live
// reading in the primary text color while the run goes on, and without the grade when the run has
// no idle latency to grade against.

const props = defineProps<{ grade: GradeView | null; rows: LoadRow[] }>()

const { t } = useI18n()
const DASH = '—'
const SCALE = ['A+', 'A', 'B', 'C', 'D', 'F'] as const

type Tone = 'ok' | 'warn' | 'danger'
const toneOf = (grade: (typeof SCALE)[number]): Tone => (grade === 'F' ? 'danger' : grade === 'C' || grade === 'D' ? 'warn' : 'ok')
const BOX: Record<Tone | 'none', string> = {
  ok: 'border-(--ok-border) bg-(--ok-bg) text-(--grade-good)',
  warn: 'border-(--warn-border) bg-(--warn-bg) text-(--grade-fair)',
  danger: 'border-(--danger-border) bg-(--danger-bg) text-(--grade-poor)',
  none: 'border-dashed border-(--border-strong) bg-transparent text-subtle-foreground',
}
const CELL: Record<Tone, string> = {
  ok: 'bg-(--ok-bg) font-bold text-(--grade-good)',
  warn: 'bg-(--warn-bg) font-bold text-(--grade-fair)',
  danger: 'bg-(--danger-bg) font-bold text-(--grade-poor)',
}
const DIRECTIONS = { download: { icon: ArrowDown, color: 'var(--series-download)' }, upload: { icon: ArrowUp, color: 'var(--series-upload)' } }

const letter = computed(() => props.grade?.grade ?? null)
const box = computed(() => (letter.value === null ? BOX.none : BOX[toneOf(letter.value)]))
const name = computed(() => {
  if (letter.value === null || props.grade === null) {
    return props.grade?.pending === true ? t('result.load.pendingGrade') : t('result.load.noGrade')
  }
  return t('result.load.grade', { grade: letter.value, words: props.grade.words })
})
</script>

<template>
  <section
    class="flex min-w-0 flex-row flex-wrap gap-x-5 gap-y-4 rounded-(--radius-lg) border border-border bg-card px-3.5 py-3 shadow-card desktop:px-4.5 desktop:py-4"
    :aria-label="t('result.load.title')"
    data-testid="load-card"
  >
    <div
      v-if="grade"
      class="flex max-w-(--layout-grade-max) flex-[1_0_var(--layout-grade-basis)] flex-col gap-2"
    >
      <span class="font-condensed text-(length:--text-micro) leading-(--lh-snug) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">{{ t('result.load.title') }}</span>
      <div class="flex items-center gap-2.5">
        <span
          role="img"
          :aria-label="name"
          class="flex size-(--grade-size) flex-none items-center justify-center rounded-(--radius-lg) border font-mono text-(length:--text-3xl) font-semibold tracking-(--tracking-metric)"
          :class="box"
          data-testid="load-grade"
        >{{ grade.grade ?? DASH }}</span>
        <div class="flex min-w-0 flex-col gap-1.5">
          <div
            class="flex gap-0.5"
            aria-hidden="true"
          >
            <span
              v-for="step in SCALE"
              :key="step"
              class="flex size-(--grade-cell) items-center justify-center rounded-(--radius-xs) font-mono text-(length:--text-pico) font-medium"
              :class="step === grade.grade ? CELL[toneOf(step)] : 'bg-(--surface-3) text-subtle-foreground'"
            >{{ step }}</span>
          </div>
          <span class="text-(length:--text-caption) leading-(--lh-snug) text-muted-foreground">{{ grade.words }}</span>
        </div>
      </div>
      <span
        v-if="grade.basis"
        class="text-(length:--text-micro) leading-(--lh-snug) text-pretty text-muted-foreground"
        data-testid="load-basis"
      >{{ grade.basis }}</span>
    </div>
    <div class="flex min-w-0 flex-[999_1_var(--layout-load-basis)] flex-col">
      <div
        v-for="row in rows"
        :key="row.direction"
        class="flex items-center gap-2.5 border-b border-(--border-subtle) py-1.5"
        data-testid="load-row"
      >
        <component
          :is="DIRECTIONS[row.direction].icon"
          :size="14"
          :stroke-width="2"
          aria-hidden="true"
          class="flex-none"
          :style="{ color: DIRECTIONS[row.direction].color }"
        />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-(length:--text-sm) text-foreground">{{ row.label }}</span>
          <span class="text-(length:--text-micro) leading-(--lh-compact) text-subtle-foreground">{{ row.sub }}</span>
        </span>
        <span
          class="font-mono text-(length:--text-lg) font-medium whitespace-nowrap"
          :class="row.value === null ? 'text-subtle-foreground' : row.live ? 'text-primary-text' : 'text-foreground'"
          :data-live="row.live ? '' : undefined"
        >{{ row.value ?? DASH }}<span
          v-if="row.value !== null"
          class="ml-1 font-mono text-(length:--text-caption) font-normal text-muted-foreground"
        >{{ t('result.load.ms') }}</span></span>
      </div>
    </div>
  </section>
</template>
