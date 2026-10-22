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

// The kit's Toast (ui/screens.md section 8): its tone, title and message; an undo toast's countdown,
// drawn each second and paused with the toaster, announced once as it first reads; the action,
// which closes the toast after it runs; and Dismiss.

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AppToast from '@/components/feedback/AppToast.vue'
import { createAppI18n } from '@/i18n'

const mountToast = (props: InstanceType<typeof AppToast>['$props']) => mount(AppToast, { props, global: { plugins: [createAppI18n('', ['en'])] } })

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the toast', () => {
  it('draws its title and message in its tone, with Dismiss', async () => {
    const toast = mountToast({ tone: 'ok', title: 'Image downloaded.', message: 'bitgauge-2026-10-08-1402.png' })
    expect(toast.text()).toContain('Image downloaded.')
    expect(toast.text()).toContain('bitgauge-2026-10-08-1402.png')
    expect(toast.get('[data-testid="toast"]').classes()).toContain('border-(--ok-border)')
    expect(toast.find('[data-testid="toast-action"]').exists()).toBe(false)
    await toast.get('[data-testid="toast-dismiss"]').trigger('click')
    expect(toast.emitted('closeToast')).toHaveLength(1)
  })

  it('counts the undo time down each second, pauses with the toaster, and announces it once', async () => {
    const toast = mountToast({ tone: 'info', title: 'Result deleted.', countdownS: 8, action: { label: 'Undo', onClick: () => undefined } })
    const countdown = () => toast.get('[data-testid="toast-countdown"]')
    expect(countdown().text()).toBe('Undo within 8 s.')
    expect(countdown().attributes('aria-hidden')).toBe('true')
    await vi.advanceTimersByTimeAsync(3000)
    expect(countdown().text()).toBe('Undo within 5 s.')
    await toast.setProps({ isPaused: true })
    await vi.advanceTimersByTimeAsync(3000)
    expect(countdown().text()).toBe('Undo within 5 s.')
    await toast.setProps({ isPaused: false })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(countdown().text()).toBe('Undo within 1 s.')
    expect(toast.get('.sr-only').text()).toBe('Undo within 8 s.')
  })

  it('runs its action, then closes', async () => {
    const onClick = vi.fn()
    const toast = mountToast({ tone: 'info', title: 'Kept in history as partial.', action: { label: 'Undo', onClick } })
    await toast.get('[data-testid="toast-action"]').trigger('click')
    expect(onClick).toHaveBeenCalledOnce()
    expect(toast.emitted('closeToast')).toHaveLength(1)
  })
})
