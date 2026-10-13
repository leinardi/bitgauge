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
import { CircleX } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { RunError } from '@/composables/useRunState'

// What failed and in which phase (ui/screens.md section 1, Error; ui/flows.md section 5), as a
// danger notice at the head of the notices: the error's message key words the cause, and an
// engine defect says the test stopped because of an internal error, naming no phase.

const props = defineProps<{ error: RunError; kept: boolean }>()

const { t } = useI18n()

const title = computed(() => {
  switch (props.error.code === 'internal' ? null : props.error.phase) {
    case 'info':
      return t('test.failure.info')
    case 'idle':
      return t('test.failure.idle')
    case 'download':
      return t('test.failure.download')
    case 'upload':
      return t('test.failure.upload')
    default:
      return t('test.failure.title')
  }
})

const CAUSES: Record<RunError['code'], () => string> = {
  internal: () => t('test.failure.internal'),
  'invalid-settings': () => t('errors.invalid-settings'),
  'requests-failed': () => t('errors.requests-failed'),
  'network-changed': () => t('errors.network-changed'),
  'server-restarted': () => t('errors.server-restarted'),
  'server-unreachable': () => t('errors.server-unreachable'),
}

const cause = computed(() => CAUSES[props.error.code]())
</script>

<template>
  <div
    role="alert"
    data-tone="danger"
    class="flex items-start gap-3 rounded-(--radius-md) border border-(--danger-border) bg-(--danger-bg) px-4 py-3"
    data-testid="run-failure"
  >
    <CircleX
      :size="16"
      aria-hidden="true"
      class="mt-0.5 flex-none text-(--danger-fg)"
    />
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="text-(length:--text-sm) font-semibold text-foreground">{{ title }}</span>
      <span class="text-(length:--text-sm) text-muted-foreground">{{ cause }}</span>
      <span
        v-if="kept"
        class="text-(length:--text-sm) text-muted-foreground"
      >{{ $t('test.failure.kept') }}</span>
    </div>
  </div>
</template>
