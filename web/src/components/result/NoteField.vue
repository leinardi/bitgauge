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
import { FileText } from '@lucide/vue'
import { shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { Textarea } from '@/components/ui/textarea'
import { useResultEdit } from '@/components/result/edits'
import { useDebouncedSave } from '@/composables/useDebouncedSave'

// The note (ui/screens.md section 2, kit ResultDetail.jsx): a text area saved with the result in
// history as it changes, a moment after the last keystroke, and at once when the field loses focus
// or the page leaves or is hidden; Download JSON waits for it. Its text is the field's own while it
// is open, so a save landing late never rewrites what is being typed. A result that is not in
// history shows the field read-only, with the "No note" placeholder and no hint, described by the
// header's reason, as the kit's does; an editable one has no placeholder.

const props = defineProps<{
  /** The result the note belongs to; a new one starts the field afresh. */
  id: string
  note: string
  /** The id of the header's reason the note cannot be saved; null when it can. */
  reasonId: string | null
  /** Saves the note of the result `id`; resolves once it is written. */
  save: (id: string, note: string) => Promise<unknown>
}>()

const { t } = useI18n()
const fieldId = useId()
const hintId = useId()
const text = shallowRef(props.note)
// Each save names the result it was typed for, which a new result's arrival does not change.
const { schedule, flush } = useDebouncedSave<{ id: string; note: string }>(({ id, note }) => props.save(id, note))
// Download JSON waits for the note typed (QA-110).
useResultEdit(flush)

function input(value: string | number): void {
  text.value = String(value)
  schedule({ id: props.id, note: text.value })
}

watch(
  () => props.id,
  () => {
    void flush()
    text.value = props.note
  },
)
</script>

<template>
  <section class="flex flex-col gap-2.5 rounded-(--radius-lg) border border-(--border-subtle) bg-(--surface-2) px-4 py-3.5 shadow-card">
    <label
      :for="fieldId"
      class="flex items-center gap-1.5 font-condensed text-(length:--text-micro) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase"
    >
      <FileText
        :size="13"
        aria-hidden="true"
      />
      {{ t('result.note.label') }}
    </label>
    <Textarea
      :id="fieldId"
      :model-value="text"
      :rows="3"
      :placeholder="reasonId === null ? undefined : t('result.note.placeholder')"
      :readonly="reasonId !== null"
      :aria-describedby="reasonId ?? hintId"
      class="min-h-0 field-sizing-fixed resize-y rounded-(--radius-md) border-(--border-default) bg-(--surface-1) px-2.5 py-2 text-(length:--text-sm) leading-(--lh-normal) text-foreground shadow-none read-only:resize-none read-only:border-(--border-subtle) read-only:bg-(--surface-2) read-only:text-muted-foreground md:text-(length:--text-sm)"
      data-testid="note-field"
      @update:model-value="input"
      @blur="void flush()"
    />
    <span
      v-if="reasonId === null"
      :id="hintId"
      class="text-(length:--text-micro) text-subtle-foreground"
    >{{ t('result.note.hint') }}</span>
  </section>
</template>
