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
import { ExternalLink, RefreshCw, Timer } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { noticeView, type Tone } from '@/components/test/notices'
import { Button } from '@/components/ui/button'
import type { Notice, Preset } from '@/engine/messages'

// The notices area (ui/screens.md section 7): each notice an icon and text, never colour alone,
// in its tone, with up to two actions. Danger notices are alerts; the others are status messages.

const props = defineProps<{ notices: Notice[] }>()
defineEmits<{ retry: []; preset: [preset: Preset] }>()

const { t, locale } = useI18n()

const TONES: Record<Tone, { box: string; icon: string }> = {
  info: { box: 'border-(--info-border) bg-(--info-bg)', icon: 'text-(--info-fg)' },
  warn: { box: 'border-(--warn-border) bg-(--warn-bg)', icon: 'text-(--warn-fg)' },
  danger: { box: 'border-(--danger-border) bg-(--danger-bg)', icon: 'text-(--danger-fg)' },
  neutral: { box: 'border-input bg-muted', icon: 'text-subtle-foreground' },
}

const views = computed(() => props.notices.map((notice, index) => ({ key: `${notice.code}-${index}`, view: noticeView(notice, { t, locale: locale.value }) })))
</script>

<template>
  <ul
    v-if="views.length > 0"
    :aria-label="$t('notices.label')"
    class="flex flex-col gap-2"
  >
    <li
      v-for="{ key, view } in views"
      :key="key"
    >
      <div
        :role="view.tone === 'danger' ? 'alert' : 'status'"
        :data-tone="view.tone"
        class="flex flex-wrap items-start gap-3 rounded-(--radius-md) border px-4 py-3"
        :class="TONES[view.tone].box"
        data-testid="notice"
      >
        <component
          :is="view.icon"
          :size="16"
          aria-hidden="true"
          class="mt-0.5 flex-none"
          :class="TONES[view.tone].icon"
        />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="text-(length:--text-sm) font-semibold text-foreground">{{ view.title }}</span>
          <span class="text-(length:--text-sm) text-muted-foreground">{{ view.body }}</span>
        </div>
        <div
          v-if="view.actions.length > 0"
          class="flex gap-2"
        >
          <template
            v-for="action in view.actions.slice(0, 2)"
            :key="action.label"
          >
            <Button
              v-if="action.kind === 'retry'"
              variant="outline"
              size="sm"
              @click="$emit('retry')"
            >
              <RefreshCw
                :size="14"
                aria-hidden="true"
              />
              {{ action.label }}
            </Button>
            <Button
              v-else-if="action.kind === 'preset'"
              variant="outline"
              size="sm"
              @click="$emit('preset', action.preset)"
            >
              <Timer
                :size="14"
                aria-hidden="true"
              />
              {{ action.label }}
            </Button>
            <Button
              v-else
              as="a"
              variant="ghost"
              size="sm"
              :href="action.href"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ action.label }}
              <ExternalLink
                :size="14"
                aria-hidden="true"
              />
            </Button>
          </template>
        </div>
      </div>
    </li>
  </ul>
</template>
