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
import { CircleAlert, FileJson, TriangleAlert } from '@lucide/vue'
import { shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import { notify } from '@/components/feedback/notify'
import type { Result } from '@/engine/messages'
import { serializeResult } from '@/export/serialize'
import { saveFile } from '@/lib/saveFile'

// Download JSON (ui/screens.md section 1): the finished result as a file the browser saves, made
// in memory, never sent anywhere. Its tooltip warns that the file holds the client
// IP and notes (security.md section 7) and also describes the button; where the page states the
// warning beside it, `describedBy` names that text instead and there is no tooltip, as on the
// kit's Result detail, which also confirms the download with a toast (`confirm`, ui/screens.md
// section 8). A result that fails validation is not exported: the button turns to its error state
// and says why.

const props = defineProps<{ result: Result; variant?: 'secondary' | 'ghost'; size?: 'sm' | 'md'; describedBy?: string; confirm?: boolean }>()

const { t } = useI18n()
const tipId = useId()
const errorId = useId()
const failed = shallowRef(false)

// A new result gets a new chance.
watch(
  () => props.result,
  () => {
    failed.value = false
  },
)

function download(): void {
  const file = serializeResult(props.result, new Date())
  failed.value = file === null
  if (file === null) {
    return
  }
  saveFile(file.filename, file.json, 'application/json')
  if (props.confirm === true) {
    notify({ tone: 'ok', title: t('test.export.downloaded'), message: t('test.export.downloadedFile', { file: file.filename }) })
  }
}
</script>

<template>
  <span class="group relative inline-flex flex-col items-end gap-1">
    <AppButton
      :size="size ?? 'sm'"
      :variant="failed ? 'secondary' : (variant ?? 'ghost')"
      :aria-describedby="failed ? `${describedBy ?? tipId} ${errorId}` : (describedBy ?? tipId)"
      :class="{ 'border-(--danger-border) text-(--danger-fg)': failed }"
      data-testid="download-json"
      @click="download"
    >
      <component
        :is="failed ? CircleAlert : FileJson"
        :size="size === 'md' ? 15 : 14"
        aria-hidden="true"
      />
      {{ $t('test.export.download') }}
    </AppButton>
    <span
      v-if="describedBy === undefined"
      :id="tipId"
      role="tooltip"
      class="pointer-events-none absolute right-0 bottom-[calc(100%+var(--tooltip-gap))] z-(--z-tooltip) flex items-center gap-1.5 rounded-(--radius-sm) border border-border bg-(--surface-4) px-2.5 py-1.5 text-(length:--text-caption) whitespace-nowrap text-foreground opacity-0 shadow-(--shadow-md) transition-opacity duration-(--dur-fast) group-focus-within:opacity-100 motion-reduce:transition-none group-hover:opacity-100"
    ><TriangleAlert
      :size="12"
      aria-hidden="true"
      class="text-(--warn)"
    />{{ $t('test.export.tip') }}</span>
    <span
      v-if="failed"
      :id="errorId"
      class="text-(length:--text-caption) text-(--danger-fg)"
      data-testid="download-json-error"
    >{{ $t('test.export.invalid') }}</span>
  </span>
</template>
