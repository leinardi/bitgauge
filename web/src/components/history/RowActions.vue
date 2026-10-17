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
import { Ellipsis, ExternalLink, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

// A result's action menu in the History list (ui/screens.md section 3; kit History.jsx, Menu in
// design_system/components/actions): open its detail, or delete it at once with an undo toast.

defineProps<{ name: string; touch?: boolean }>()
const emit = defineEmits<{ open: []; remove: [] }>()

const { t } = useI18n()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <AppButton
        variant="ghost"
        :size="touch ? 'md' : 'sm'"
        :class="touch ? 'mt-1 size-11 justify-center px-0' : 'w-(--control-h-sm) justify-center px-0'"
        :aria-label="t('history.table.actions', { label: name })"
        data-testid="row-actions"
        @click.stop
      >
        <Ellipsis
          :size="touch ? 15 : 14"
          aria-hidden="true"
        />
      </AppButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      class="w-40 rounded-(--radius-md) border-(--border-default) bg-(--surface-2) p-1 shadow-(--shadow-pop)"
    >
      <DropdownMenuItem
        class="h-(--control-h-item) gap-2 px-2 text-(length:--text-sm)"
        @select="emit('open')"
      >
        <ExternalLink
          :size="14"
          aria-hidden="true"
        />
        {{ t('history.table.open') }}
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        class="h-(--control-h-item) gap-2 px-2 text-(length:--text-sm) text-(--danger-fg)"
        data-testid="row-delete"
        @select="emit('remove')"
      >
        <Trash2
          :size="14"
          aria-hidden="true"
        />
        {{ t('history.table.delete') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
