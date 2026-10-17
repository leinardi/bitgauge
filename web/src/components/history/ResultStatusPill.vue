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
import { useI18n } from 'vue-i18n'

import StatusPill from '@/components/status/StatusPill.vue'
import type { ResultStatus } from '@/engine/messages'

// A stored result's status in the History list (kit History.jsx): Complete as a plain neutral
// pill, Partial and Error with their tone's dot.

defineProps<{ status: ResultStatus }>()

const { t } = useI18n()
</script>

<template>
  <StatusPill
    v-if="status === 'complete'"
    :dot="false"
  >
    {{ t('history.table.status.complete') }}
  </StatusPill>
  <StatusPill
    v-else-if="status === 'partial'"
    tone="warn"
  >
    {{ t('history.table.status.partial') }}
  </StatusPill>
  <StatusPill
    v-else
    tone="danger"
  >
    {{ t('history.table.status.error') }}
  </StatusPill>
</template>
