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
import { RotateCcw, X } from '@lucide/vue'
import { AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogOverlay, AlertDialogPortal, AlertDialogTrigger } from 'reka-ui'
import { nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import { AlertDialog, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { moveFocus } from '@/lib/focus'

// Reset all to defaults and its confirmation (ui/screens.md section 4; kit Settings.jsx, Dialog in
// design_system/components/dialog): the shadcn-vue alert dialog in the kit's modal, danger in tone,
// naming the settings that return to their defaults. Close cancels, as Cancel does.

const props = defineProps<{ names: string[]; focusAfter?: () => Element | null | undefined }>()
const emit = defineEmits<{ confirm: [] }>()
const { t } = useI18n()

// Confirmed, the trigger is disabled, so focus goes where focusAfter says (ui/i18n-a11y.md 2.3).
let confirmed = false
function confirm(): void {
  confirmed = true
  emit('confirm')
}
function restore(event: Event): void {
  if (confirmed && props.focusAfter !== undefined) {
    event.preventDefault()
    void nextTick(() => moveFocus(props.focusAfter?.()))
  }
  confirmed = false
}
</script>

<template>
  <AlertDialog>
    <AlertDialogTrigger as-child>
      <AppButton
        size="sm"
        block
        variant="danger"
        :disabled="names.length === 0"
      >
        <RotateCcw
          :size="14"
          aria-hidden="true"
        />
        {{ t('settings.changed.resetAll') }}
      </AppButton>
    </AlertDialogTrigger>
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-(--z-overlay) bg-(--scrim) backdrop-blur-(--scrim-blur)" />
      <AlertDialogContent
        class="fixed top-1/2 left-1/2 z-(--z-overlay) max-h-[calc(100vh-var(--space-8))] w-(--modal-w) max-w-(--modal-max-w) -translate-x-1/2 -translate-y-1/2 overflow-x-hidden max-tablet:top-(--space-16) max-tablet:max-h-[calc(100dvh-var(--space-16)-var(--space-4))] max-tablet:translate-y-0 overflow-y-auto rounded-(--radius-xl) border border-(--border-default) bg-(--surface-2) text-foreground shadow-(--shadow-pop)"
        @close-auto-focus="restore"
      >
        <div class="flex gap-3.5 px-5 pt-4.5 pb-3.5">
          <span class="flex size-(--modal-icon) shrink-0 items-center justify-center rounded-(--radius-md) border border-(--danger-border) bg-(--danger-bg) text-(--danger-fg)">
            <RotateCcw
              :size="18"
              aria-hidden="true"
            />
          </span>
          <div class="min-w-0 flex-1">
            <AlertDialogTitle class="text-(length:--text-lg) leading-(--lh-snug) font-semibold">
              {{ t('settings.changed.confirmTitle') }}
            </AlertDialogTitle>
            <AlertDialogDescription class="mt-1 text-(length:--text-sm) leading-(--lh-prose) text-muted-foreground">
              {{ t('settings.changed.confirmBody', { n: names.length, names: names.join(', ') }, names.length) }}
            </AlertDialogDescription>
          </div>
          <AlertDialogCancel as-child>
            <AppButton
              variant="ghost"
              size="sm"
              class="-mt-1 -mr-1.5 size-(--control-h-sm) self-start justify-center px-0"
              :aria-label="t('settings.changed.close')"
            >
              <X
                :size="16"
                aria-hidden="true"
              />
            </AppButton>
          </AlertDialogCancel>
        </div>
        <div class="mt-3.5 flex flex-wrap items-center justify-end gap-2.5 px-5 py-4 max-tablet:flex-col-reverse max-tablet:items-stretch max-tablet:[&>*]:justify-center">
          <AlertDialogCancel as-child>
            <AppButton>{{ t('settings.changed.cancel') }}</AppButton>
          </AlertDialogCancel>
          <AlertDialogAction as-child>
            <AppButton
              variant="danger"
              @click="confirm"
            >
              <RotateCcw
                :size="15"
                aria-hidden="true"
              />
              {{ t('settings.changed.confirm') }}
            </AppButton>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialog>
</template>
