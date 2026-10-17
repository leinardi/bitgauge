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
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import FieldError from '@/components/settings/FieldError.vue'
import { useSettingsForm } from '@/components/settings/form'

// The kit's Input (design_system/components/forms Input.jsx, forms.css `.input`) as a setting's
// typed value (ui/screens.md section 4): the edit is checked when the field is left or on Enter. A
// valid one is committed and saved; an invalid one stays in the field with its error beneath, is
// not saved, and leaves the focus where the user puts it. Escape restores the saved value.

const props = defineProps<{
  id: string
  /** The saved value, as the field shows it. */
  value: string
  label: string
  suffix?: string
  /** The reason `text` is invalid, or null. */
  validate: (text: string) => string | null
  disabled?: boolean
  mono?: boolean
  placeholder?: string
  inputmode?: 'numeric' | 'decimal' | 'text'
  /** The caller shows the error, under its own row of fields, with the id `<id>-error`. */
  detachedError?: boolean
}>()
const emit = defineEmits<{ commit: [text: string]; error: [message: string | null] }>()
// The width and the rest of the caller's attributes go to the shell, not to the column around it.
defineOptions({ inheritAttrs: false })

const { t } = useI18n()
const form = useSettingsForm()
const draft = shallowRef<string | null>(null)
const error = shallowRef<string | null>(null)
const errorId = computed(() => `${props.id}-error`)
const restores = computed(() => (props.suffix === undefined ? props.value : `${props.value} ${props.suffix}`))

function show(message: string | null): void {
  error.value = message
  form.invalid(props.id, message !== null)
  emit('error', message)
}

function message(text: string): string | null {
  const reason = props.validate(text.trim())
  return reason === null ? null : `${reason} ${t('settings.errors.notSaved', { value: restores.value })}`
}

function edit(event: Event): void {
  draft.value = (event.target as HTMLInputElement).value
  // Once shown, the error follows the edit.
  if (error.value !== null) {
    show(message(draft.value))
  }
}

function check(): void {
  if (draft.value === null) {
    return
  }
  const reason = message(draft.value)
  show(reason)
  if (reason === null) {
    const text = draft.value.trim()
    draft.value = null
    emit('commit', text)
  }
}

function restore(): void {
  draft.value = null
  show(null)
}

function key(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    check()
  } else if (event.key === 'Escape' && draft.value !== null) {
    event.preventDefault()
    restore()
  }
}

// A value changed elsewhere, a reset, replaces the edit.
watch(() => props.value, restore)
onScopeDispose(() => form.invalid(props.id, false))
</script>

<template>
  <div class="flex flex-col items-end gap-1.5">
    <div
      class="flex h-(--input-h) items-center gap-2 rounded-(--radius-md) border bg-(--surface-1) px-3 text-(length:--text-sm) text-foreground transition-[border-color] duration-(--dur-fast) focus-within:outline-(length:--focus-width) focus-within:outline-offset-(--focus-offset) focus-within:outline-(--focus-ring) motion-reduce:transition-none"
      :class="[error === null ? 'border-(--border-default) focus-within:border-primary' : 'border-(--danger-border) focus-within:border-(--danger)', disabled ? 'opacity-45' : '', mono ? 'font-mono' : '']"
      :aria-disabled="disabled ? 'true' : undefined"
      v-bind="$attrs"
    >
      <input
        :id="id"
        type="text"
        :value="draft ?? value"
        :aria-label="label"
        :aria-invalid="error !== null ? 'true' : undefined"
        :aria-describedby="error !== null ? errorId : undefined"
        :disabled="disabled"
        :placeholder="placeholder"
        :inputmode="inputmode ?? 'numeric'"
        autocomplete="off"
        class="w-full min-w-0 flex-1 border-none bg-transparent text-inherit outline-none placeholder:text-subtle-foreground disabled:cursor-not-allowed"
        :class="mono ? 'font-mono' : 'font-sans'"
        @input="edit"
        @blur="check"
        @keydown="key"
      >
      <span
        v-if="suffix !== undefined"
        class="shrink-0 text-subtle-foreground"
      >{{ suffix }}</span>
    </div>
    <FieldError
      v-if="error !== null && !detachedError"
      :id="errorId"
    >
      {{ error }}
    </FieldError>
  </div>
</template>
