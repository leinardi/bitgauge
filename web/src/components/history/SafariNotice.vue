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
import { Download, TriangleAlert, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import NoticeBox from '@/components/test/NoticeBox.vue'

// The Safari hint (ui/screens.md section 3, edge-cases.md section 17; kit History.jsx): Safari may
// delete a site's storage, so the History screen recommends a JSON export there.

const emit = defineEmits<{ export: []; dismiss: [] }>()

const { t } = useI18n()
</script>

<template>
  <NoticeBox
    tone="warn"
    :icon="TriangleAlert"
    :title="t('history.safari.title')"
    :body="t('history.safari.body')"
    :live="false"
    data-testid="safari-notice"
  >
    <template #actions>
      <AppButton
        size="sm"
        @click="emit('export')"
      >
        <Download
          :size="14"
          aria-hidden="true"
        />
        {{ t('history.safari.export') }}
      </AppButton>
      <AppButton
        variant="ghost"
        size="sm"
        class="w-(--control-h-sm) justify-center px-0"
        :aria-label="t('history.safari.dismiss')"
        @click="emit('dismiss')"
      >
        <X
          :size="14"
          aria-hidden="true"
        />
      </AppButton>
    </template>
  </NoticeBox>
</template>
