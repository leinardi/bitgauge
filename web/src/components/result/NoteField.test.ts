/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * BitGauge is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
 */
// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import NoteField from '@/components/result/NoteField.vue'
import { createAppI18n } from '@/i18n'
import { MAX_NOTE } from '@/lib/resultLimits'

describe('the note admission limit (QA-123)', () => {
  it('keeps an oversized edit visible without saving or truncating it', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const field = mount(NoteField, { props: { id: 'record', note: 'saved', reasonId: null, save }, global: { plugins: [createAppI18n('', ['en'])] } })
    const input = field.get<HTMLTextAreaElement>('textarea')
    const tooLong = '🛰'.repeat(MAX_NOTE + 1)
    await input.setValue(tooLong)
    await input.trigger('blur')
    await flushPromises()
    expect(input.element.value).toBe(tooLong)
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(field.get('[role="alert"]').text()).toContain('Not saved')
    expect(save).not.toHaveBeenCalled()
    await input.setValue('🛰'.repeat(MAX_NOTE))
    await input.trigger('blur')
    await flushPromises()
    expect(save).toHaveBeenCalledWith('record', '🛰'.repeat(MAX_NOTE))
    field.unmount()
  })

  it('preserves a previously stored long note without rewriting it on mount or unmount', () => {
    const save = vi.fn()
    const note = 'x'.repeat(MAX_NOTE + 1)
    const field = mount(NoteField, { props: { id: 'record', note, reasonId: null, save }, global: { plugins: [createAppI18n('', ['en'])] } })
    expect(field.get<HTMLTextAreaElement>('textarea').element.value).toBe(note)
    field.unmount()
    expect(save).not.toHaveBeenCalled()
  })
})
