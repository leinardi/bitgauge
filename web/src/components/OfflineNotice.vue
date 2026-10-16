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
import { RefreshCw, ServerOff } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import NoticeBox from '@/components/test/NoticeBox.vue'

// The offline state (ui/screens.md section 1, ui/flows.md section 1): GET /api/v1/info failed, so
// the server is unreachable until a check, automatic or Retry, succeeds. A screen can say what that
// means for it in its own body. Drawn as the export's danger Notice with Retry as its action.

defineProps<{ host: string; body?: string }>()
defineEmits<{ retry: [] }>()

const { t } = useI18n()
</script>

<template>
  <NoticeBox
    tone="danger"
    :icon="ServerOff"
    :title="t('app.offline.title')"
    :body="body ?? t('app.offline.body', { host })"
  >
    <template #actions>
      <AppButton
        size="sm"
        @click="$emit('retry')"
      >
        <RefreshCw
          :size="14"
          aria-hidden="true"
        />
        {{ t('app.offline.retry') }}
      </AppButton>
    </template>
  </NoticeBox>
</template>
