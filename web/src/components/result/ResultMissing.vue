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
import { History, Search, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import AppButton from '@/components/actions/AppButton.vue'

// A Result detail with no result to show (ui/screens.md section 2, kit ResultDetail.jsx): not found,
// for an id that is in neither history nor memory, or deleted, just after Delete; both link to
// History. It fills the page below its margins, as the kit's stretched status box does.

defineProps<{ deleted: boolean }>()

const { t } = useI18n()
</script>

<template>
  <div
    role="status"
    class="mx-auto my-10 flex max-w-110 flex-1 flex-col items-center gap-3 text-center desktop:my-24"
    data-testid="result-missing"
  >
    <span class="flex size-12 items-center justify-center rounded-(--radius-lg) border border-(--border-default) bg-(--surface-2) text-subtle-foreground">
      <component
        :is="deleted ? Trash2 : Search"
        :size="22"
        aria-hidden="true"
      />
    </span>
    <h1 class="mt-1 text-(length:--text-2xl) font-semibold tracking-(--tracking-tight)">
      {{ deleted ? t('result.notFound.deletedTitle') : t('result.notFound.title') }}
    </h1>
    <p class="text-(length:--text-sm) leading-(--lh-prose) text-pretty text-muted-foreground">
      {{ deleted ? t('result.notFound.deletedBody') : t('result.notFound.body') }}
    </p>
    <AppButton
      as-child
      variant="primary"
      class="mt-2"
    >
      <RouterLink to="/history">
        <History
          :size="15"
          aria-hidden="true"
        />
        {{ t('result.notFound.history') }}
      </RouterLink>
    </AppButton>
  </div>
</template>
