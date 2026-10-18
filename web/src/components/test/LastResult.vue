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
import { History } from '@lucide/vue'
import { useIntervalFn, useNow } from '@vueuse/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import { rowView } from '@/components/history/rows'
import type { Result } from '@/engine/messages'
import { formatAgo } from '@/lib/format'

// The last result line in the idle state (ui/screens.md section 1; design_system/components
// measurement LastResult): when the latest saved result ran, its headline numbers and its label,
// linking to its detail. One unit follows both rates when they share it.

const props = defineProps<{ result: Result; units: 'bits' | 'bytes' }>()

const SEPARATOR = ' · '

const { t, locale } = useI18n()
// Read again each minute, so the line stays true while the page sits idle.
const now = useNow({ scheduler: (tick) => useIntervalFn(tick, 60_000) })

const when = computed(() => formatAgo(Date.parse(props.result.startedAt), now.value.getTime(), locale.value))
const values = computed(() => {
  const row = rowView(props.result, props.units, locale.value)
  const shared = row.download !== null && row.upload !== null && row.download.unit === row.upload.unit
  const down = row.download === null ? '—' : shared ? row.download.number : `${row.download.number} ${row.download.unit}`
  const up = row.upload === null ? '—' : `${row.upload.number} ${row.upload.unit}`
  return [`↓ ${down}`, `↑ ${up}`, ...(row.latency === null ? [] : [`${row.latency} ms`])].join(SEPARATOR)
})
const label = computed(() => (props.result.label === '' ? '' : `${SEPARATOR}${props.result.label}`))
</script>

<template>
  <RouterLink
    :to="`/result/${encodeURIComponent(result.id)}`"
    class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 self-start text-(length:--text-caption) text-subtle-foreground no-underline hover:text-muted-foreground"
    data-testid="last-result"
  >
    <History
      :size="13"
      aria-hidden="true"
    />
    <!-- Each part is its own flex item, spaced by the gap and wrapping as a whole, as the kit's are. -->
    {{ t('test.lastResult.when', { when }) }}{{ SEPARATOR }}<span class="font-mono text-muted-foreground">{{ values }}</span>{{ label }} <span class="font-semibold text-primary-text">{{ t('test.lastResult.view') }}</span>
  </RouterLink>
</template>
