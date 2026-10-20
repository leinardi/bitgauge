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
import { Check, CircleAlert, CircleCheck, CircleMinus, CircleX, Gamepad, Info, Signal, Tv, Video } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import type { ExperienceName, QualityView } from '@/components/result/qualityList'
import NotMeasured from '@/components/test/NotMeasured.vue'
import NotMeasuredWhy from '@/components/test/NotMeasuredWhy.vue'
import type { ScoreBand } from '@/engine/messages'
import { links } from '@/lib/links'

// The quality list (design_system/components/measurement QualityList.jsx, measurement.css .qlist):
// "Good for" with the basis chip when the scores rest on one direction, a row per experience with
// its band as a badge of its tone, icon and name, never color alone, or the inputs it is missing
// in the subtle color, and the upper-bound note. The Result detail adds the packet-loss row.

defineProps<{ view: QualityView; packetLoss?: boolean }>()

const { t } = useI18n()

const ICONS: Record<ExperienceName, typeof Tv> = { streaming: Tv, gaming: Gamepad, rtc: Video }
const BANDS: Record<ScoreBand, { icon: typeof Tv; tone: string }> = {
  great: { icon: CircleCheck, tone: 'border-(--ok-border) bg-(--ok-bg) text-(--ok-fg)' },
  good: { icon: Check, tone: 'border-(--ok-border) bg-(--ok-bg) text-(--ok-fg)' },
  average: { icon: CircleMinus, tone: 'border-(--warn-border) bg-(--warn-bg) text-(--warn-fg)' },
  poor: { icon: CircleAlert, tone: 'border-(--warn-border) bg-(--warn-bg) text-(--warn-fg)' },
  bad: { icon: CircleX, tone: 'border-(--danger-border) bg-(--danger-bg) text-(--danger-fg)' },
}
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-1 rounded-(--radius-lg) border border-border bg-card px-3.5 py-3 shadow-card desktop:px-4.5 desktop:py-4"
    data-testid="quality-list"
  >
    <span class="mb-1 flex flex-wrap items-center gap-1.5 font-(family-name:--font-cond) text-(length:--text-micro) leading-(--lh-snug) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">
      {{ t('result.quality.title') }}
      <span
        v-if="view.basis"
        class="inline-flex h-(--pill-h-sm) items-center rounded-full border border-(--border-default) bg-(--surface-2) px-2.5 font-sans text-(length:--text-micro) font-medium tracking-normal whitespace-nowrap text-muted-foreground normal-case"
        data-testid="quality-basis"
      >{{ view.basis }}</span>
    </span>
    <div
      v-for="row in view.rows"
      :key="row.experience"
      class="flex min-h-(--list-row-h) items-center gap-2.5 border-b border-(--border-subtle)"
      data-testid="quality-row"
    >
      <span
        class="inline-flex text-subtle-foreground"
        aria-hidden="true"
      >
        <component
          :is="ICONS[row.experience]"
          :size="16"
        />
      </span>
      <span class="flex-1 text-(length:--text-sm) text-foreground">{{ row.name }}</span>
      <span
        v-if="row.band"
        class="inline-flex h-(--pill-h) items-center gap-1.5 rounded-full border pr-2.5 pl-2 font-(family-name:--font-cond) text-(length:--text-micro) leading-none font-semibold tracking-(--tracking-caps-tight) whitespace-nowrap uppercase"
        :class="BANDS[row.band].tone"
      >
        <component
          :is="BANDS[row.band].icon"
          :size="13"
          :stroke-width="2"
          aria-hidden="true"
          class="flex-none"
        />
        {{ row.text }}
      </span>
      <span
        v-else
        class="text-(length:--text-caption) text-subtle-foreground"
      >{{ row.text }}</span>
    </div>
    <div
      v-if="packetLoss"
      class="flex min-h-(--list-row-h) items-center gap-2.5 border-b border-(--border-subtle)"
    >
      <span
        class="inline-flex text-subtle-foreground"
        aria-hidden="true"
      >
        <Signal :size="16" />
      </span>
      <span class="flex-1 text-(length:--text-sm) text-foreground">{{ t('result.quality.packetLoss') }}</span>
      <span class="inline-flex flex-none items-center gap-2 text-(length:--text-caption)">
        <NotMeasured />
        <NotMeasuredWhy :href="links.packetLoss" />
      </span>
    </div>
    <span class="mt-1.5 flex items-center gap-1.5 text-(length:--text-micro) leading-(--lh-compact) text-subtle-foreground">
      <Info
        :size="12"
        aria-hidden="true"
        class="flex-none"
      />
      {{ t('result.quality.upperBound') }}
    </span>
  </div>
</template>
