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
import { RefreshCw, Timer } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import AppLink from '@/components/actions/AppLink.vue'
import NoticeBox from '@/components/test/NoticeBox.vue'
import { noticeViews } from '@/components/test/notices'
import type { Notice, Preset, Result } from '@/engine/messages'

// The notices area (ui/screens.md section 7): each notice an icon and text, never colour alone,
// in its tone, with up to two actions. Danger notices are alerts; the others are status messages.
// The notices sit in the page's column as siblings, as the export's TestScreen places them.

const props = withDefaults(defineProps<{ notices: Notice[]; result?: Result | null }>(), { result: null })
defineEmits<{ retry: []; preset: [preset: Preset] }>()

const { t, locale } = useI18n()

const views = computed(() => noticeViews(props.notices, { t, locale: locale.value, result: props.result }).map((view, index) => ({ key: `${index}`, view })))
</script>

<template>
  <NoticeBox
    v-for="{ key, view } in views"
    :key="key"
    :tone="view.tone"
    :icon="view.icon"
    :title="view.title"
    :body="view.body"
    data-testid="notice"
  >
    <template
      v-if="view.actions.length > 0"
      #actions
    >
      <template
        v-for="action in view.actions.slice(0, 2)"
        :key="action.label"
      >
        <AppButton
          v-if="action.kind === 'retry'"
          size="sm"
          @click="$emit('retry')"
        >
          <RefreshCw
            :size="14"
            aria-hidden="true"
          />
          {{ action.label }}
        </AppButton>
        <AppButton
          v-else-if="action.kind === 'preset'"
          size="sm"
          @click="$emit('preset', action.preset)"
        >
          <Timer
            :size="14"
            aria-hidden="true"
          />
          {{ action.label }}
        </AppButton>
        <AppLink
          v-else
          :href="action.href"
          external
        >
          {{ action.label }}
        </AppLink>
      </template>
    </template>
  </NoticeBox>
</template>
