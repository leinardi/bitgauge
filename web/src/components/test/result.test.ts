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

// The result's actions on the Test screen: Download JSON, named exactly so for the accuracy harness,
// with its warning as the description and the file made in memory; the result bar's complete
// variants (saved, being saved, not saved), its partial and error ones; and the failure notice of
// the Error state.

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'

import DownloadJson from '@/components/test/DownloadJson.vue'
import ResultBar from '@/components/test/ResultBar.vue'
import RunFailure from '@/components/test/RunFailure.vue'
import type { PhaseView, RunError } from '@/composables/useRunState'
import type { PhaseName } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { resultFixture } from '@/test/fixtures'

function mountWith<T extends Component>(component: T, props: Record<string, unknown>) {
  return mount(component, { props, global: { plugins: [createAppI18n('', ['en'])] }, attachTo: document.body } as never)
}

/** Captures the blob the button makes and the link it clicks. */
function captureDownload() {
  const blobs: Blob[] = []
  const created = vi.fn((blob: Blob) => {
    blobs.push(blob)
    return 'blob:http://127.0.0.1/1'
  })
  const revoked = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = created
      static override revokeObjectURL = revoked
    },
  )
  const clicked: HTMLAnchorElement[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this)
  })
  return { blobs, created, revoked, clicked }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('Download JSON', () => {
  it('is named exactly Download JSON and described by its warning', () => {
    const wrapper = mountWith(DownloadJson, { result: resultFixture() })
    const button = wrapper.get('button')
    expect(button.text()).toBe('Download JSON')
    expect(button.get('svg').attributes('aria-hidden')).toBe('true')
    const tip = document.getElementById(button.attributes('aria-describedby') ?? '')
    expect(tip?.getAttribute('role')).toBe('tooltip')
    expect(tip?.textContent?.trim()).toBe('Contains your IP address and notes')
  })

  it('saves the export through a blob: URL under the result\'s file name, then releases the URL', async () => {
    vi.useFakeTimers()
    const { blobs, revoked, clicked } = captureDownload()
    const result = resultFixture({ startedAt: new Date(2026, 9, 8, 14, 2, 11).toISOString() })
    const wrapper = mountWith(DownloadJson, { result })
    await wrapper.get('button').trigger('click')
    expect(clicked).toHaveLength(1)
    expect(clicked[0]?.href).toBe('blob:http://127.0.0.1/1')
    expect(clicked[0]?.download).toBe('bitgauge-2026-10-08-1402.json')
    expect(document.querySelector('a[download]')).toBeNull()
    expect(blobs[0]?.type).toBe('application/json')
    const file = JSON.parse(await (blobs[0]?.text() ?? Promise.resolve(''))) as { format: string; results: unknown[] }
    expect(file).toMatchObject({ format: 'bitgauge.history', formatVersion: 1, results: [result] })
    expect(revoked).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revoked).toHaveBeenCalledWith('blob:http://127.0.0.1/1')
  })

  it('shows its error state, and saves nothing, for a result that fails validation', async () => {
    const { created, clicked } = captureDownload()
    const wrapper = mountWith(DownloadJson, { result: { ...resultFixture(), durationMs: -5 } })
    await wrapper.get('button').trigger('click')
    expect(created).not.toHaveBeenCalled()
    expect(clicked).toHaveLength(0)
    const button = wrapper.get('button')
    expect(button.text()).toBe('Download JSON')
    const error = wrapper.get('[data-testid="download-json-error"]')
    expect(error.text()).toBe("This result failed validation, so it can't be exported.")
    expect(button.attributes('aria-describedby')?.split(' ')).toContain(error.attributes('id'))
  })
})

describe('the result bar', () => {
  it('says a complete result is saved to history, with the time the run ended', () => {
    const startedAt = new Date(2026, 9, 8, 14, 2, 11)
    const wrapper = mountWith(ResultBar, { result: resultFixture({ startedAt: startedAt.toISOString(), durationMs: 28_600 }), save: 'saved' })
    expect(wrapper.get('[role="status"]').text()).toContain('Saved to history')
    expect(wrapper.get('[data-testid="result-bar-time"]').text()).toBe(new Intl.DateTimeFormat('en', { timeStyle: 'medium' }).format(new Date(startedAt.getTime() + 28_600)))
    expect(wrapper.find('[data-testid="result-bar-body"]').exists()).toBe(false)
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Download JSON'])
  })

  it('says a complete result is not saved where history is unavailable or the save failed', () => {
    const saving = mountWith(ResultBar, { result: resultFixture(), save: 'saving' })
    expect(saving.get('[role="status"]').text()).toContain('Test complete')
    expect(saving.find('[data-testid="result-bar-body"]').exists()).toBe(false)
    const unavailable = mountWith(ResultBar, { result: resultFixture(), save: 'unavailable' })
    expect(unavailable.get('[role="status"]').text()).toContain('Test complete')
    expect(unavailable.get('[data-testid="result-bar-body"]').text()).toBe('History is unavailable in this browser mode — results are not saved.')
    const failed = mountWith(ResultBar, { result: resultFixture(), save: 'failed' })
    expect(failed.get('[data-testid="result-bar-body"]').text()).toBe('Not saved to history. Download the JSON to keep it.')
  })

  it.each(['partial', 'error'] as const)('says a %s result is not saved, and offers its JSON', (status) => {
    const wrapper = mountWith(ResultBar, { result: resultFixture({ status }), save: null })
    expect(wrapper.get('[role="status"]').text()).toBe('Partial results are not saved')
    expect(wrapper.find('[data-testid="result-bar-time"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Download the JSON to keep them.')
    expect(wrapper.get('button').text()).toBe('Download JSON')
    // Where history is unavailable, the bar says so instead.
    expect(mountWith(ResultBar, { result: resultFixture({ status }), save: 'unavailable' }).get('[data-testid="result-bar-body"]').text()).toContain('History is unavailable')
  })
})

describe('the failure notice', () => {
  const ORDER = ['idle', 'download', 'upload'] as const
  const phases = (overrides: Partial<Record<PhaseName, PhaseView>>): Record<PhaseName, PhaseView> => ({
    info: { state: 'finished' },
    idle: { state: 'pending' },
    download: { state: 'pending' },
    upload: { state: 'pending' },
    ...overrides,
  })
  const failure = (error: RunError, shown: Record<PhaseName, PhaseView>) => {
    const wrapper = mountWith(RunFailure, { error, phases: shown, order: ORDER, server: 'Basement NAS' })
    return wrapper.get('[role="alert"]').findAll('span').map((span) => span.text().replace(/\u00a0/gu, ' '))
  }

  it('names the server, the cause by the error\'s message key, where the phase stopped and what finished before it', () => {
    expect(failure({ code: 'requests-failed', phase: 'download', partial: true }, phases({ idle: { state: 'finished' }, download: { state: 'failed', ranMs: 6400 } }))).toEqual([
      'Connection to Basement NAS lost — 3 requests in a row failed during download',
      'Download stopped at 6.4 s. Latency finished before the error.',
    ])
    expect(failure({ code: 'network-changed', phase: 'idle', partial: false }, phases({ idle: { state: 'failed', ranMs: 1200 } }))).toEqual([
      'Connection to Basement NAS lost — the network changed',
      'The test stopped at 1.2 s, during latency. No phase finished.',
    ])
    expect(failure({ code: 'server-restarted', phase: 'upload', partial: true }, phases({ idle: { state: 'finished' }, download: { state: 'finished' }, upload: { state: 'failed', ranMs: 3000 } }))[1]).toBe(
      'Upload stopped at 3.0 s. Latency and download finished before the error.',
    )
  })

  it('names no phase for an engine defect', () => {
    expect(failure({ code: 'internal', phase: null, partial: false }, phases({}))).toEqual(['Test failed', 'The test stopped because of an internal error.'])
  })

  it('says the test stopped while connecting when the info phase failed', () => {
    expect(failure({ code: 'server-unreachable', phase: 'info', partial: false }, phases({ info: { state: 'failed' } }))).toEqual([
      'Connection to Basement NAS lost — server stopped responding',
      'The test stopped while connecting.',
    ])
  })
})
