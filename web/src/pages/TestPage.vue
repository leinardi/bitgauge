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
import { onMounted, watch } from 'vue'

import { useInfo } from '@/composables/useInfo'
import { useWorker, type WorkerBridge } from '@/composables/useWorker'
import { settingsFromDefaults } from '@/lib/defaults'
import { readBasePath } from '@/router/base'

// The Test screen (ui/screens.md section 1). This version renders its empty state only; the gauge,
// the run and the result fill it in later. The engine's Worker starts with the page and is
// configured with the server's defaults as soon as they are known.

const { info } = useInfo()
let bridge: WorkerBridge | null = null

function configure(): void {
  const settings = info.value === null ? null : settingsFromDefaults(info.value.defaults)
  if (bridge !== null && settings !== null) {
    bridge.post({ type: 'configure', settings, basePath: readBasePath(document) })
  }
}

// Started in a hook of this component, the Worker ends when the page unmounts.
onMounted(() => {
  bridge = useWorker()
  configure()
})
watch(info, configure)
</script>

<template>
  <main class="mx-auto flex w-full max-w-[1200px] flex-1 flex-col items-center justify-center gap-2 px-4 py-10">
    <h1 class="sr-only">
      {{ $t('test.title') }}
    </h1>
    <p class="text-(length:--text-base) text-muted-foreground">
      {{ $t('test.empty') }}
    </p>
  </main>
</template>
