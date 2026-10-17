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
import { Check, Copy, Info, Link } from '@lucide/vue'
import { computed, onScopeDispose, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import { settingName } from '@/components/settings/changes'
import { useSettingsForm } from '@/components/settings/form'
import LabeledCheckbox from '@/components/settings/LabeledCheckbox.vue'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import { buildSettingsUrl } from '@/lib/shareUrl'
import { readBasePath } from '@/router/base'

// The shareable settings URL (ui/url-params.md section 3, kit Settings.jsx): a read-only field
// with Copy, the "include run=1" option, and the "Not in the link" line naming the changed
// settings no parameter carries.

const COPIED_MS = 1500
// The parameter the auto-start option adds, in the mono face, as the kit sets it.
const RUN_PARAM = 'run=1'

const { t } = useI18n()
const form = useSettingsForm()
const includeRun = shallowRef(false)
const copied = shallowRef(false)
const failed = shallowRef(false)
let timer: ReturnType<typeof setTimeout> | undefined

const base = `${window.location.origin}${readBasePath(document)}`
const link = computed(() => buildSettingsUrl(base, form.current.value, form.defaults.value, form.stored.value, includeRun.value))
const notInLink = computed(() => link.value.notInLink.map((key) => settingName(key, t)).join(', '))

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(link.value.url)
    failed.value = false
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      copied.value = false
    }, COPIED_MS)
  } catch {
    // No clipboard (an insecure origin, a refused permission): the field stays selectable.
    failed.value = true
  }
}

onScopeDispose(() => clearTimeout(timer))
</script>

<template>
  <SettingsCard
    id="settings-share"
    :title="t('settings.share.title')"
    :icon="Link"
    padded
  >
    <div class="flex flex-col gap-2.5">
      <span class="text-(length:--text-caption) leading-(--lh-compact) text-subtle-foreground">{{ t('settings.share.caption') }}</span>
      <div class="flex gap-1.5">
        <input
          :value="link.url"
          readonly
          :aria-label="t('settings.share.url')"
          data-testid="share-url"
          class="h-(--input-h) min-w-0 flex-1 rounded-(--radius-md) border border-(--border-default) bg-(--surface-1) px-3 font-mono text-(length:--text-sm) text-foreground outline-none focus-visible:border-primary focus-visible:outline-(length:--focus-width) focus-visible:outline-offset-(--focus-offset) focus-visible:outline-(--focus-ring)"
          @focus="($event.target as HTMLInputElement).select()"
        >
        <AppButton
          class="w-(--control-h-md) justify-center px-0"
          :aria-label="copied ? t('settings.share.copied') : t('settings.share.copy')"
          :title="t('settings.share.copy')"
          @click="copy"
        >
          <component
            :is="copied ? Check : Copy"
            :size="15"
            aria-hidden="true"
          />
        </AppButton>
      </div>
      <span
        class="sr-only"
        role="status"
      >{{ copied ? t('settings.share.copied') : '' }}</span>
      <span
        v-if="failed"
        class="text-(length:--text-caption) text-(--danger-fg)"
      >{{ t('settings.share.copyFailed') }}</span>
      <LabeledCheckbox
        v-model="includeRun"
        class="text-(length:--text-caption) text-muted-foreground"
      >
        <i18n-t
          keypath="settings.share.includeRun"
          scope="global"
        >
          <template #param>
            <code class="font-mono">{{ RUN_PARAM }}</code>
          </template>
        </i18n-t>
      </LabeledCheckbox>
      <span
        v-if="notInLink !== ''"
        class="flex items-start gap-1.5 text-(length:--text-micro) leading-(--lh-compact) text-subtle-foreground"
        data-testid="not-in-link"
      >
        <Info
          :size="12"
          class="mt-px shrink-0"
          aria-hidden="true"
        />
        {{ t('settings.share.notInLink', { names: notInLink }) }}
      </span>
    </div>
  </SettingsCard>
</template>
