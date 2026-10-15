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
import { Timer, X } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'

// The auto-start notice of the countdown (ui/flows.md section 2, kit TestScreen.jsx): the seconds
// left and why the test is about to start, with Cancel. It is a status message, info in tone.

const props = defineProps<{ remainingMs: number }>()
defineEmits<{ cancel: [] }>()

const { t, locale } = useI18n()

const seconds = computed(() => Math.max(1, Math.ceil(props.remainingMs / 1000)))
const title = computed(() => t('test.countdown.title', { n: new Intl.NumberFormat(locale.value).format(seconds.value) }))
</script>

<template>
  <div
    role="status"
    data-tone="info"
    class="flex flex-wrap items-start gap-3 rounded-(--radius-md) border border-(--info-border) bg-(--info-bg) px-4 py-3"
    data-testid="auto-start"
  >
    <Timer
      :size="16"
      aria-hidden="true"
      class="mt-0.5 flex-none text-(--info-fg)"
    />
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="text-(length:--text-sm) font-semibold text-foreground">{{ title }}</span>
      <span class="text-(length:--text-sm) text-muted-foreground">{{ $t('test.countdown.body') }}</span>
    </div>
    <AppButton
      size="sm"
      data-testid="auto-start-cancel"
      @click="$emit('cancel')"
    >
      <X
        :size="14"
        aria-hidden="true"
      />
      {{ $t('test.countdown.cancel') }}
    </AppButton>
  </div>
</template>
