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

import { Button } from '@/components/ui/button'

// The offline state (ui/screens.md section 1, ui/flows.md section 1): GET /api/v1/info failed, so
// the server is unreachable until Retry succeeds.

defineProps<{ host: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div
    role="alert"
    class="flex flex-wrap items-center gap-3 rounded-(--radius-md) border border-(--danger-border) bg-(--danger-bg) px-4 py-3"
  >
    <ServerOff
      :size="17"
      aria-hidden="true"
      class="flex-none text-(--danger-fg)"
    />
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="text-(length:--text-sm) font-semibold text-foreground">{{ $t('app.offline.title') }}</span>
      <span class="text-(length:--text-sm) text-muted-foreground">{{ $t('app.offline.body', { host }) }}</span>
    </div>
    <Button
      variant="outline"
      size="sm"
      @click="$emit('retry')"
    >
      <RefreshCw
        :size="14"
        aria-hidden="true"
      />
      {{ $t('app.offline.retry') }}
    </Button>
  </div>
</template>
