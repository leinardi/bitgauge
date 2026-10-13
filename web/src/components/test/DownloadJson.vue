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

import { Button } from '@/components/ui/button'
import type { Result } from '@/engine/messages'
import { serializeResult } from '@/export/serialize'

// Download JSON (ui/screens.md section 1): the finished result as a file the browser saves, made
// in memory as a blob: URL, never sent anywhere. Its tooltip warns that the file holds the client
// IP and notes (security.md section 7) and also describes the button. A result that fails
// validation is not exported: the button turns to its error state and says why.

const props = defineProps<{ result: Result; variant?: 'default' | 'secondary' | 'ghost' }>()

const REVOKE_AFTER_MS = 10_000

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
  const url = URL.createObjectURL(new Blob([file.json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.filename
  document.body.append(link)
  link.click()
  link.remove()
  // Some browsers read the blob after the click returns; the URL is released once they have.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}
</script>

<template>
  <span class="group relative inline-flex flex-col items-end gap-1">
    <Button
      size="sm"
      :variant="failed ? 'outline' : (variant ?? 'ghost')"
      :aria-describedby="failed ? `${tipId} ${errorId}` : tipId"
      :class="{ 'border-(--danger-border) text-(--danger-fg)': failed }"
      data-testid="download-json"
      @click="download"
    >
      <component
        :is="failed ? CircleAlert : FileJson"
        aria-hidden="true"
      />
      {{ $t('test.export.download') }}
    </Button>
    <span
      :id="tipId"
      role="tooltip"
      class="pointer-events-none absolute right-0 bottom-[calc(100%+7px)] z-(--z-tooltip) flex items-center gap-1.5 rounded-(--radius-sm) border border-border bg-(--surface-4) px-2.5 py-1.5 text-(length:--text-caption) whitespace-nowrap text-foreground opacity-0 shadow-(--shadow-md) transition-opacity duration-(--dur-fast) group-focus-within:opacity-100 motion-reduce:transition-none group-hover:opacity-100"
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
