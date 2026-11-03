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
import { useI18n } from 'vue-i18n'

// The History screen while the stored results load (ui/screens.md section 3, loading; kit
// History.jsx): placeholders where the chips, the trend and the rows or cards will be.

const { t } = useI18n()
const CHIPS = ['w-14', 'w-16', 'w-16', 'w-18', 'w-19']
const ROWS = 8
const BLOCK = 'animate-pulse rounded-(--radius-sm) bg-(--surface-3) motion-reduce:animate-none'
</script>

<template>
  <div
    aria-busy="true"
    role="status"
    class="flex flex-col gap-3.5 tablet:gap-4.5"
    data-testid="history-loading"
  >
    <!-- A live region announces its content, not its name. -->
    <span class="sr-only">{{ t('history.loading') }}</span>
    <div class="flex gap-1.5 overflow-hidden">
      <span
        v-for="(width, index) in CHIPS"
        :key="index"
        :class="[BLOCK, width, 'h-7 flex-none rounded-full']"
      />
    </div>
    <section class="flex flex-col gap-3.5 rounded-(--radius-lg) border border-(--border-subtle) bg-(--surface-2) p-3.5 shadow-card tablet:px-5 tablet:py-4">
      <span :class="[BLOCK, 'h-3.5 w-45']" />
      <div class="grid grid-cols-1 gap-5 tablet:grid-cols-3">
        <span
          v-for="index in 3"
          :key="index"
          :class="[BLOCK, 'h-30 tablet:h-32.5', index > 1 ? 'hidden tablet:block' : '']"
        />
      </div>
    </section>
    <!-- The table from the desktop breakpoint, cards below it, as the list itself (QA-59). -->
    <section
      class="hidden overflow-hidden rounded-(--radius-lg) border border-(--border-subtle) bg-(--surface-2) shadow-card desktop:block"
      data-testid="loading-table"
    >
      <div class="h-9.5 border-b border-(--border-default)" />
      <div
        v-for="index in ROWS"
        :key="index"
        class="flex items-center gap-3.5 border-b border-(--border-subtle) p-3.5 last:border-b-0"
      >
        <span :class="[BLOCK, 'h-3 w-4']" />
        <span :class="[BLOCK, 'h-3 w-27.5']" />
        <span :class="[BLOCK, 'h-3 flex-1']" />
        <span :class="[BLOCK, 'h-3 w-20']" />
        <span :class="[BLOCK, 'h-3 w-20']" />
        <span :class="[BLOCK, 'h-3 w-14']" />
      </div>
    </section>
    <div
      class="flex flex-col gap-2 desktop:hidden"
      data-testid="loading-cards"
    >
      <div
        v-for="index in 4"
        :key="index"
        class="flex flex-col gap-2.5 rounded-(--radius-lg) border border-(--border-subtle) bg-(--surface-2) p-3.5"
      >
        <span :class="[BLOCK, 'h-3.25 w-3/5']" />
        <span :class="[BLOCK, 'h-3 w-9/10']" />
      </div>
    </div>
  </div>
</template>
