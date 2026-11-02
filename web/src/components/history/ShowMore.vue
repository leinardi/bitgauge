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
import { ChevronDown } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'

// Below the History list (ui/screens.md section 3): how many of the filtered results are shown,
// and the button that adds the next ones, up to `step` at a time.

const props = defineProps<{ shown: number; total: number; step: number }>()
defineEmits<{ more: [] }>()

const { t, locale } = useI18n()
const number = (value: number) => new Intl.NumberFormat(locale.value).format(value)
const next = computed(() => Math.min(props.step, props.total - props.shown))
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
    data-testid="history-more"
  >
    <span class="font-mono text-(length:--text-sm) text-subtle-foreground">{{ t('history.more.showing', { shown: number(shown), total: number(total) }) }}</span>
    <AppButton
      size="sm"
      data-testid="history-show-more"
      @click="$emit('more')"
    >
      <ChevronDown
        :size="14"
        aria-hidden="true"
      />
      {{ t('history.more.button', { n: number(next) }) }}
    </AppButton>
  </div>
</template>
