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
import { Info, Minus, TrendingUp, TriangleAlert } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { type CompareRow, verdictWord } from '@/components/history/compare'

// One row's change in the compare view (kit History.jsx): better with a rising arrow, worse with a
// warning sign, same or not comparable with a dash, and a parameter that differs with an info
// sign, or a warning sign when it keeps the results apart. Words carry it, never the color alone.

const props = withDefaults(defineProps<{ row: CompareRow; small?: boolean }>(), { small: false })

const { t } = useI18n()

const view = computed(() => {
  const { row } = props
  if (row.differs !== undefined) {
    if (row.differs === null) {
      return { icon: Minus, tone: 'text-subtle-foreground', word: t('history.compare.same') }
    }
    return row.differs === 'apart'
      ? { icon: TriangleAlert, tone: 'text-(--warn-fg)', word: t('history.compare.differs') }
      : { icon: Info, tone: 'text-muted-foreground', word: t('history.compare.differs') }
  }
  switch (row.verdict) {
    case 'better':
      return { icon: TrendingUp, tone: 'text-(--ok-fg)', word: verdictWord('better', t) }
    case 'worse':
      return { icon: TriangleAlert, tone: 'text-(--warn-fg)', word: verdictWord('worse', t) }
    case 'same':
    case 'not-comparable':
      return { icon: Minus, tone: 'text-subtle-foreground', word: verdictWord(row.verdict, t) }
    default:
      return null
  }
})
</script>

<template>
  <span
    v-if="view !== null"
    class="inline-flex items-center gap-1.5"
    :class="[view.tone, small ? 'text-(length:--text-micro)' : 'text-(length:--text-caption)']"
    data-testid="compare-change"
  >
    <component
      :is="view.icon"
      :size="small ? 11 : 13"
      :stroke-width="2"
      aria-hidden="true"
    />
    <span
      v-if="row.change"
      class="font-mono"
    >{{ row.change }}</span>
    <span>{{ view.word }}</span>
  </span>
</template>
