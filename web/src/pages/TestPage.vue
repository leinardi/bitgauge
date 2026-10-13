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
import ConnectionStrip from '@/components/connection/ConnectionStrip.vue'
import SettingsSummary from '@/components/connection/SettingsSummary.vue'
import OfflineNotice from '@/components/OfflineNotice.vue'
import { useInfo } from '@/composables/useInfo'
import { useRun } from '@/composables/useRun'

// The Test screen (ui/screens.md section 1): its idle and offline states so far; the gauge, the
// run and the result fill it in later. The engine's Worker starts with the page, is configured
// with the server's defaults as soon as they are known, and ends when the page unmounts.

const { info, reachability, refresh } = useInfo()
const { defaults } = useRun()
const host = window.location.host
</script>

<template>
  <main class="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 px-4 py-6 sm:px-10">
    <h1 class="sr-only">
      {{ $t('test.title') }}
    </h1>
    <OfflineNotice
      v-if="reachability === 'unreachable'"
      :host="host"
      @retry="refresh"
    />
    <div class="flex flex-wrap items-end justify-between gap-x-7 gap-y-3">
      <ConnectionStrip :info="reachability === 'unreachable' ? null : info" />
      <SettingsSummary
        v-if="reachability === 'connected' && defaults !== null"
        :settings="defaults"
        :defaults="defaults"
      />
    </div>
    <p
      v-if="reachability === 'connected'"
      class="text-(length:--text-base) text-muted-foreground"
    >
      {{ $t('test.empty') }}
    </p>
  </main>
</template>
