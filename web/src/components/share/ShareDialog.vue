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
import { Share2, X } from '@lucide/vue'
import { DialogClose, DialogContent, DialogOverlay, DialogPortal } from 'reka-ui'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import SharePanel from '@/components/share/SharePanel.vue'
import { Dialog, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { Result } from '@/engine/messages'

// Share on the Test screen (ui/screens.md section 1, ui/flows.md section 8; kit TestScreen.jsx,
// Dialog wide): the save bar's Share opens the Result detail's share panel as a focus-trapped
// dialog, which Escape closes with the focus back on Share. The whole dialog scrolls, under its
// sticky footer of actions, as the kit's does.

defineProps<{ result: Result; units: 'bits' | 'bytes' }>()

const { t } = useI18n()
const open = shallowRef(false)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <AppButton
        variant="ghost"
        size="sm"
        data-testid="share-open"
      >
        <Share2
          :size="14"
          aria-hidden="true"
        />
        {{ t('share.open') }}
      </AppButton>
    </DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-(--z-overlay) bg-(--scrim) backdrop-blur-(--scrim-blur)" />
      <DialogContent
        class="fixed inset-x-0 top-0 z-(--z-overlay) flex max-h-full flex-col overflow-x-hidden overflow-y-auto overscroll-contain rounded-b-(--radius-xl) border border-(--border-default) bg-(--surface-2) text-foreground shadow-(--shadow-pop) tablet:top-16 tablet:left-1/2 tablet:max-h-[calc(100vh-var(--space-20))] tablet:w-(--modal-w-wide) tablet:max-w-(--modal-max-w) tablet:-translate-x-1/2 tablet:rounded-(--radius-xl)"
        data-testid="share-dialog"
      >
        <div class="flex items-start gap-3.5 px-5 pt-4.5 pb-3.5">
          <span class="flex size-(--modal-icon) shrink-0 items-center justify-center rounded-(--radius-md) border border-(--primary-border) bg-(--primary-bg) text-primary">
            <Share2
              :size="18"
              aria-hidden="true"
            />
          </span>
          <div class="min-w-0 flex-1">
            <DialogTitle class="text-(length:--text-lg) leading-(--lh-snug) font-semibold">
              {{ t('share.title') }}
            </DialogTitle>
            <DialogDescription class="mt-1 text-(length:--text-sm) leading-(--lh-prose) text-muted-foreground">
              {{ t('share.description') }}
            </DialogDescription>
          </div>
          <DialogClose as-child>
            <AppButton
              variant="ghost"
              size="sm"
              class="size-(--control-h-sm) justify-center px-0"
              :aria-label="t('share.close')"
            >
              <X
                :size="16"
                aria-hidden="true"
              />
            </AppButton>
          </DialogClose>
        </div>
        <SharePanel
          :result="result"
          :units="units"
          in-dialog
        />
      </DialogContent>
    </DialogPortal>
  </Dialog>
</template>
