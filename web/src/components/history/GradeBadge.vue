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

import { gradeWord } from '@/components/history/rows'
import type { Bufferbloat } from '@/engine/messages'

// The bufferbloat grade as the History list shows it (kit History.jsx): the letter in a box of the
// grade's tone, named in full for assistive technology; a dash without a grade.

const props = withDefaults(defineProps<{ grade: Bufferbloat['grade'] | null; large?: boolean }>(), { large: false })

const { t } = useI18n()
const DASH = '—'

const TONES = {
  ok: 'border-(--ok-border) bg-(--ok-bg) text-(--ok-fg)',
  warn: 'border-(--warn-border) bg-(--warn-bg) text-(--warn-fg)',
  danger: 'border-(--danger-border) bg-(--danger-bg) text-(--danger-fg)',
  none: 'border-(--border-subtle) bg-transparent text-subtle-foreground',
} as const

const tone = computed(() => {
  switch (props.grade) {
    case 'A+':
    case 'A':
    case 'B':
      return TONES.ok
    case 'C':
    case 'D':
      return TONES.warn
    case 'F':
      return TONES.danger
    default:
      return TONES.none
  }
})

const name = computed(() => (props.grade === null ? t('history.table.noGrade') : t('history.table.grade', { grade: props.grade, word: gradeWord(props.grade, t) })))
</script>

<template>
  <span
    role="img"
    :aria-label="name"
    :title="name"
    class="inline-flex items-center justify-center rounded-(--radius-sm) border font-mono text-(length:--text-caption) font-semibold"
    :class="[tone, large ? 'h-6 w-7' : 'h-5.5 w-6.5']"
  >{{ grade ?? DASH }}</span>
</template>
