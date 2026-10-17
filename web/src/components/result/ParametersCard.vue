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
import { ChevronDown, ChevronUp, SlidersHorizontal } from '@lucide/vue'
import { useMediaQuery } from '@vueuse/core'
import { computed, shallowRef, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ParameterGroup } from '@/components/result/parameters'

// The test parameters card (ui/screens.md section 2, kit ResultDetail.jsx): groups of label and
// value rows; on the one-column layout below the desktop breakpoint, a disclosure, closed at first.

defineProps<{ groups: ParameterGroup[] }>()

const { t } = useI18n()
const id = useId()
const narrow = useMediaQuery('(max-width: 1139.98px)')
const open = shallowRef(false)
const shown = computed(() => !narrow.value || open.value)
</script>

<template>
  <section
    class="overflow-hidden rounded-(--radius-lg) border border-(--border-subtle) bg-(--surface-2) shadow-card"
    :aria-labelledby="`${id}-title`"
    data-testid="parameters-card"
  >
    <h2
      v-if="narrow"
      :id="`${id}-title`"
      class="text-(length:--text-base) font-normal"
    >
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-2.5 px-4 py-3 text-left"
        :class="open ? 'border-b border-(--border-subtle)' : ''"
        :aria-expanded="open"
        :aria-controls="`${id}-body`"
        data-testid="parameters-toggle"
        @click="open = !open"
      >
        <SlidersHorizontal
          :size="15"
          aria-hidden="true"
          class="text-subtle-foreground"
        />
        <span class="font-semibold">{{ t('result.parameters.title') }}</span>
        <component
          :is="open ? ChevronUp : ChevronDown"
          :size="16"
          aria-hidden="true"
          class="ml-auto text-subtle-foreground"
        />
      </button>
    </h2>
    <div
      v-else
      class="flex items-center gap-2.5 border-b border-(--border-subtle) px-4 py-3"
    >
      <SlidersHorizontal
        :size="15"
        aria-hidden="true"
        class="text-subtle-foreground"
      />
      <h2
        :id="`${id}-title`"
        class="text-(length:--text-base) font-semibold"
      >
        {{ t('result.parameters.title') }}
      </h2>
    </div>
    <div
      v-show="shown"
      :id="`${id}-body`"
      class="px-4 pt-0.5 pb-2.5"
    >
      <div
        v-for="group in groups"
        :key="group.key"
        class="flex flex-col"
      >
        <h3 class="pt-3 pb-1 font-condensed text-(length:--text-micro) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">
          {{ group.title }}
        </h3>
        <dl>
          <div
            v-for="parameter in group.rows"
            :key="parameter.key"
            class="flex justify-between gap-3 border-t border-(--border-subtle) py-1.75"
            :data-testid="`parameter-${parameter.key}`"
          >
            <dt class="flex-none text-(length:--text-sm) text-muted-foreground">
              {{ parameter.label }}
            </dt>
            <dd class="min-w-0 text-right font-mono text-(length:--text-caption) text-pretty text-foreground">
              {{ parameter.value }}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>
