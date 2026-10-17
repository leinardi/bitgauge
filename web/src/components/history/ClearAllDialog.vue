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
import { Download, Trash2, X } from '@lucide/vue'
import { useMediaQuery } from '@vueuse/core'
import { AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogOverlay, AlertDialogPortal, AlertDialogTrigger } from 'reka-ui'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import { AlertDialog, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog'

// Clear all and its confirmation (ui/screens.md section 3, ui/flows.md section 6 step 8; kit
// History.jsx, Dialog in design_system/components/dialog): the alert dialog names the count and
// offers Export JSON first, which leaves it open; clearing cannot be undone. Close cancels, as
// Cancel does. On a narrow screen the footer reads Cancel, Export JSON first, Clear, as the kit's.

defineProps<{ count: number }>()
const emit = defineEmits<{ confirm: []; exportFirst: [] }>()
const { t } = useI18n()
const narrow = useMediaQuery('(max-width: 767.98px)')
</script>

<template>
  <AlertDialog>
    <AlertDialogTrigger as-child>
      <AppButton
        variant="danger"
        size="sm"
        data-testid="clear-all"
      >
        <Trash2
          :size="14"
          aria-hidden="true"
        />
        {{ t('history.clear.action') }}
      </AppButton>
    </AlertDialogTrigger>
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-(--z-overlay) bg-(--scrim) backdrop-blur-(--scrim-blur)" />
      <AlertDialogContent
        class="fixed top-1/2 left-1/2 z-(--z-overlay) max-h-[calc(100vh-var(--space-8))] w-(--modal-w) max-w-(--modal-max-w) -translate-x-1/2 -translate-y-1/2 overflow-x-hidden max-tablet:top-(--space-16) max-tablet:translate-y-0 overflow-y-auto rounded-(--radius-xl) border border-(--border-default) bg-(--surface-2) text-foreground shadow-(--shadow-pop)"
      >
        <div class="flex gap-3.5 px-5 pt-4.5 pb-3.5">
          <span class="flex size-(--modal-icon) shrink-0 items-center justify-center rounded-(--radius-md) border border-(--danger-border) bg-(--danger-bg) text-(--danger-fg)">
            <Trash2
              :size="18"
              aria-hidden="true"
            />
          </span>
          <div class="min-w-0 flex-1">
            <AlertDialogTitle class="text-(length:--text-lg) leading-(--lh-snug) font-semibold">
              {{ t('history.clear.title') }}
            </AlertDialogTitle>
            <AlertDialogDescription class="mt-1 text-(length:--text-sm) leading-(--lh-prose) text-muted-foreground">
              {{ t('history.clear.body', { n: count }, count) }}
            </AlertDialogDescription>
          </div>
          <AlertDialogCancel as-child>
            <AppButton
              variant="ghost"
              size="sm"
              class="-mt-1 -mr-1.5 size-(--control-h-sm) self-start justify-center px-0"
              :aria-label="t('history.clear.close')"
            >
              <X
                :size="16"
                aria-hidden="true"
              />
            </AppButton>
          </AlertDialogCancel>
        </div>
        <div class="mt-3.5 flex flex-wrap items-center gap-2.5 px-5 py-4 max-tablet:flex-col-reverse max-tablet:items-stretch max-tablet:[&>*]:min-h-(--control-h-touch) max-tablet:[&>*]:justify-center">
          <AlertDialogCancel
            v-if="narrow"
            as-child
          >
            <AppButton variant="ghost">
              {{ t('history.clear.cancel') }}
            </AppButton>
          </AlertDialogCancel>
          <AppButton
            :variant="narrow ? 'secondary' : 'ghost'"
            data-testid="clear-export-first"
            @click="emit('exportFirst')"
          >
            <Download
              :size="15"
              aria-hidden="true"
            />
            {{ t('history.clear.exportFirst') }}
          </AppButton>
          <template v-if="!narrow">
            <span class="flex-1" />
            <AlertDialogCancel as-child>
              <AppButton>{{ t('history.clear.cancel') }}</AppButton>
            </AlertDialogCancel>
          </template>
          <AlertDialogAction as-child>
            <AppButton
              variant="danger-solid"
              data-testid="clear-confirm"
              @click="emit('confirm')"
            >
              <Trash2
                :size="15"
                aria-hidden="true"
              />
              {{ t('history.clear.confirm', { n: count }, count) }}
            </AppButton>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialog>
</template>
