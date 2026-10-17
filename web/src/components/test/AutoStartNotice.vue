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
import NoticeBox from '@/components/test/NoticeBox.vue'

// The auto-start notice of the countdown (ui/flows.md section 2, kit TestScreen.jsx): the seconds
// left and why the test is about to start, a link's `run` or the stored Auto-start, with Cancel. It
// is a status message, info in tone.

const props = defineProps<{ remainingMs: number; fromLink: boolean }>()
defineEmits<{ cancel: [] }>()

const { t, locale } = useI18n()

const seconds = computed(() => Math.max(1, Math.ceil(props.remainingMs / 1000)))
const title = computed(() => t('test.countdown.title', { n: new Intl.NumberFormat(locale.value).format(seconds.value) }))
</script>

<template>
  <NoticeBox
    tone="info"
    :icon="Timer"
    :title="title"
    :body="fromLink ? $t('test.countdown.body') : $t('test.countdown.bodyStored')"
    data-testid="auto-start"
  >
    <template #actions>
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
    </template>
  </NoticeBox>
</template>
