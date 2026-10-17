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
import { Shield } from '@lucide/vue'
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import AppLink from '@/components/actions/AppLink.vue'
import type { ConfidenceItem, ConfidenceView } from '@/components/result/confidence'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import StatusPill from '@/components/status/StatusPill.vue'

// The confidence and notices card (ui/screens.md section 2, kit ResultDetail.jsx): the lowest
// confidence as a pill, then two groups, the directions' confidence and the notices, each item with
// its icon in its tone, its title and its text.

const props = defineProps<{ view: ConfidenceView }>()

const { t } = useI18n()
const id = useId()

const ICON_TONES: Record<ConfidenceItem['tone'], string> = {
  ok: 'text-(--ok)',
  warn: 'text-(--warn)',
  danger: 'text-(--danger)',
  info: 'text-(--info)',
  neutral: 'text-subtle-foreground',
}

const pill = computed(() => {
  switch (props.view.level) {
    case 'normal':
      return { tone: 'ok' as const, text: t('result.confidence.level.normal') }
    case 'low':
      return { tone: 'warn' as const, text: t('result.confidence.level.low') }
    case 'cpu-bound':
      return { tone: 'warn' as const, text: t('result.confidence.level.cpuBound') }
    default:
      return null
  }
})
const groups = computed(() => [
  { key: 'confidence', title: t('result.confidence.group'), items: props.view.confidence, empty: t('result.confidence.none') },
  { key: 'notices', title: t('result.confidence.notices'), items: props.view.notices, empty: '' },
])
</script>

<template>
  <SettingsCard
    :id="id"
    :title="t('result.confidence.title')"
    :icon="Shield"
    data-testid="confidence-card"
  >
    <template
      v-if="pill"
      #actions
    >
      <StatusPill
        :tone="pill.tone"
        size="md"
        data-testid="confidence-level"
      >
        {{ pill.text }}
      </StatusPill>
    </template>
    <div class="grid grid-cols-1 gap-x-6 px-4 pt-1 pb-2 desktop:grid-cols-2">
      <div
        v-for="group in groups"
        :key="group.key"
        class="flex min-w-0 flex-col"
      >
        <h3 class="pt-2.5 pb-1 font-condensed text-(length:--text-micro) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">
          {{ group.title }}
        </h3>
        <ul :data-testid="`confidence-${group.key}`">
          <li
            v-for="(item, index) in group.items"
            :key="index"
            class="flex gap-2.5 border-t border-(--border-subtle) py-2.25"
          >
            <component
              :is="item.icon"
              :size="15"
              :stroke-width="2"
              aria-hidden="true"
              class="mt-0.5 flex-none"
              :class="ICON_TONES[item.tone]"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="text-(length:--text-sm) leading-(--lh-compact) font-medium">{{ item.title }}</span>
              <span class="text-(length:--text-caption) leading-(--lh-compact) text-pretty text-muted-foreground">{{ item.body }}</span>
              <AppLink
                v-if="item.link"
                :href="item.link.href"
                external
                class="mt-0.5 self-start text-(length:--text-caption)"
              >
                {{ item.link.label }}
              </AppLink>
            </div>
          </li>
          <li
            v-if="group.items.length === 0 && group.empty"
            class="border-t border-(--border-subtle) py-2.25 text-(length:--text-caption) text-subtle-foreground"
          >
            {{ group.empty }}
          </li>
        </ul>
      </div>
    </div>
  </SettingsCard>
</template>
