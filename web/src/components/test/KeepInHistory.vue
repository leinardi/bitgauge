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
import { CircleCheck, History } from '@lucide/vue'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import AppButton from '@/components/actions/AppButton.vue'
import { notify } from '@/components/feedback/notify'
import { useHistory } from '@/composables/useHistory'
import type { Result } from '@/engine/messages'

// Keep in history (ui/flows.md section 4, design_system/components save-bar.md): saves a partial or
// error result, which is not saved otherwise, and confirms with an undo toast; Undo removes it from
// history again, and the bar offers Keep once more. When the toast goes, the result stays kept. The
// component stays mounted while the result is kept, its button hidden, so the toast's Undo still
// reaches the bar; an Undo for a result the bar no longer shows only removes that result. Its size
// follows the actions beside it: small in the result bar, medium in the Result detail's header.

const props = withDefaults(defineProps<{ result: Result; size?: 'sm' | 'md' }>(), { size: 'sm' })
const kept = defineModel<boolean>('kept', { required: true })

const { t } = useI18n()
const history = useHistory()
const busy = shallowRef(false)

const kind = (result: Result) => (result.status === 'error' ? t('test.bar.kinds.error') : t('test.bar.kinds.partial'))

async function undo(id: string): Promise<void> {
  await history.remove([id])
  if (props.result.id === id) {
    kept.value = false
  }
  notify({ tone: 'info', icon: CircleCheck, title: t('test.bar.removed') })
}

async function keep(): Promise<void> {
  const { result } = props
  busy.value = true
  const saved = await history.save(result)
  busy.value = false
  if (!saved) {
    notify({ tone: 'danger', title: t('test.bar.keepFailed') })
    return
  }
  if (props.result.id === result.id) {
    kept.value = true
  }
  notify({ tone: 'info', icon: History, title: t('test.bar.keptToast', { kind: kind(result) }), undo: { label: t('test.bar.undo'), onClick: () => void undo(result.id) } })
}
</script>

<template>
  <AppButton
    v-if="!kept"
    :size="size"
    :disabled="busy"
    data-testid="keep-in-history"
    @click="keep"
  >
    <History
      :size="14"
      aria-hidden="true"
    />
    {{ t('test.bar.keep') }}
  </AppButton>
</template>
