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
import { HardDrive } from '@lucide/vue'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import MonoTitle from '@/components/history/MonoTitle.vue'
import NoticeBox from '@/components/test/NoticeBox.vue'

// The per-origin notice (ui/screens.md section 3, edge-cases.md section 8; kit History.jsx): the
// history is stored only in this browser, for the address the page was opened at; Why? explains
// that another address shows a separate history, and that export moves it.

defineProps<{ origin: string }>()

const { t } = useI18n()
const why = shallowRef(false)
</script>

<template>
  <NoticeBox
    tone="info"
    :icon="HardDrive"
    :title="t('history.origin.title', { origin })"
    :body="why ? t('history.origin.body') : undefined"
    :live="false"
    data-testid="origin-notice"
  >
    <template #title>
      <MonoTitle
        keypath="history.origin.title"
        name="origin"
        :value="origin"
      />
    </template>
    <template #actions>
      <AppButton
        variant="ghost"
        size="sm"
        :aria-expanded="why"
        @click="why = !why"
      >
        {{ t('history.origin.why') }}
      </AppButton>
    </template>
  </NoticeBox>
</template>
