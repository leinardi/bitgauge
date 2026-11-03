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
// with its warning as the description and the file made in memory; the save bar of a complete
// result (saved, being saved, not saved), with its label field, suggestions and Share; the status
// bar of a partial or error one, with Keep in history and its undo toast; the Details link; and the
// failure notice of the Error state.

import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Component, shallowRef } from 'vue'

import { notify } from '@/components/feedback/notify'
import DownloadJson from '@/components/test/DownloadJson.vue'
import ResultBar from '@/components/test/ResultBar.vue'
import RunFailure from '@/components/test/RunFailure.vue'
import SaveBar from '@/components/test/SaveBar.vue'
import type { PhaseView, RunError } from '@/composables/useRunState'
import type { PhaseName, Result } from '@/engine/messages'
import { createAppI18n } from '@/i18n'
import { resultFixture } from '@/test/fixtures'

const history = vi.hoisted(() => ({
  results: { value: [] as Result[] },
  save: vi.fn<(result: Result) => Promise<boolean>>(),
  edit: vi.fn(),
  remove: vi.fn<(ids: readonly string[]) => Promise<Result[]>>(),
}))

vi.mock('@/composables/useHistory', () => ({ useHistory: () => history }))
vi.mock('@/components/feedback/notify', () => ({ notify: vi.fn() }))

beforeEach(() => {
  history.results = shallowRef<Result[]>([])
  history.save.mockResolvedValue(true)
  history.edit.mockResolvedValue(undefined)
  history.remove.mockResolvedValue([])
})

function mountWith<T extends Component>(component: T, props: Record<string, unknown>) {
  return mount(component, { props, global: { plugins: [createAppI18n('', ['en'])], stubs: { RouterLink: RouterLinkStub } }, attachTo: document.body } as never)
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

describe('the save bar', () => {
  const stored = (id: string, label: string, contextLabel = '') => resultFixture({ id: `a1b2c3d4-0000-4000-8000-00000000000${id}`, label, client: { ...resultFixture().client, contextLabel } })

  it('says a complete result is saved to history, with the time the run ended, Share, Download JSON and Details', () => {
    const startedAt = new Date(2026, 9, 8, 14, 2, 11)
    const wrapper = mountWith(SaveBar, { result: resultFixture({ startedAt: startedAt.toISOString(), durationMs: 28_600 }), save: 'saved', units: 'bits' })
    expect(wrapper.get('[role="status"]').text()).toContain('Saved to history')
    expect(wrapper.get('[data-testid="result-bar-time"]').text()).toBe(new Intl.DateTimeFormat('en', { timeStyle: 'medium' }).format(new Date(startedAt.getTime() + 28_600)))
    expect(wrapper.find('[data-testid="result-bar-body"]').exists()).toBe(false)
    // The fixture's context label is the one suggestion.
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['LAN', 'Share', 'Download JSON'])
    expect(wrapper.getComponent(RouterLinkStub).props('to')).toBe(`/result/${resultFixture().id}`)
    expect(wrapper.get('[data-testid="result-details"]').text()).toBe('Details')
    expect(wrapper.get<HTMLInputElement>('[data-testid="result-label-field"]').element.value).toBe('')
  })

  it('says a complete result is not saved where history is unavailable or the save failed, with no label field', () => {
    const saving = mountWith(SaveBar, { result: resultFixture(), save: 'saving', units: 'bits' })
    expect(saving.get('[role="status"]').text()).toContain('Test complete')
    expect(saving.find('[data-testid="result-bar-body"]').exists()).toBe(false)
    expect(saving.find('[data-testid="result-label-field"]').exists()).toBe(false)
    const unavailable = mountWith(SaveBar, { result: resultFixture(), save: 'unavailable', units: 'bits' })
    expect(unavailable.get('[role="status"]').text()).toContain('Test complete')
    expect(unavailable.get('[data-testid="result-bar-body"]').text()).toBe('History is unavailable in this browser mode — results are not saved.')
    expect(unavailable.find('[data-testid="share-open"]').exists()).toBe(true)
    const failed = mountWith(SaveBar, { result: resultFixture(), save: 'failed', units: 'bits' })
    expect(failed.get('[data-testid="result-bar-body"]').text()).toBe('Not saved to history. Download the JSON to keep it.')
  })

  it('suggests the context label and the 5 most recent distinct labels of history', () => {
    history.results.value = [stored('1', 'Office'), stored('2', 'Home Wi-Fi'), stored('3', 'Office'), stored('4', ''), stored('5', 'Garage'), stored('6', 'VPN'), stored('7', 'Attic'), stored('8', 'Cellar')]
    const result = stored('9', '', 'Basement')
    const wrapper = mountWith(SaveBar, { result, save: 'saved', units: 'bits' })
    expect(wrapper.findAll('[data-testid="label-suggestion"]').map((chip) => chip.text())).toEqual(['Basement', 'Office', 'Home Wi-Fi', 'Garage', 'VPN', 'Attic'])
  })

  it('saves the label as it is typed, once the typing pauses, and at once for a suggestion', async () => {
    vi.useFakeTimers()
    history.results.value = [stored('1', 'Office')]
    const result = stored('9', '')
    const wrapper = mountWith(SaveBar, { result, save: 'saved', units: 'bits' })
    await wrapper.get('[data-testid="result-label-field"]').setValue('Home')
    expect(history.edit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(history.edit).toHaveBeenCalledWith(result.id, { label: 'Home' })
    const chip = wrapper.get('[data-testid="label-suggestion"]')
    await chip.trigger('click')
    expect(history.edit).toHaveBeenLastCalledWith(result.id, { label: 'Office' })
    expect(chip.attributes('aria-pressed')).toBe('true')
    expect(wrapper.get<HTMLInputElement>('[data-testid="result-label-field"]').element.value).toBe('Office')
  })
})

describe('the status bar of a partial or error result', () => {
  const partial = () => resultFixture({ status: 'partial', notices: [{ code: 'stopped-early', direction: 'upload', coveredMs: 3000 }] })
  /** The bar with its kept model held as the Test screen holds it. */
  function mountBar(props: Record<string, unknown>) {
    const wrapper: ReturnType<typeof mountWith> = mountWith(ResultBar, { kept: false, 'onUpdate:kept': (kept: boolean) => wrapper.setProps({ kept }), ...props })
    return wrapper
  }

  it.each(['partial', 'error'] as const)('says a %s result is not saved, and offers Keep in history, its JSON and Details', (status) => {
    const wrapper = mountBar({ result: { ...partial(), status }, save: null })
    // An error result names itself, never "partial" (QA-112).
    expect(wrapper.get('[role="status"]').text()).toBe(status === 'error' ? 'Results of a failed test are not saved' : 'Partial results are not saved')
    expect(wrapper.find('[data-testid="result-bar-time"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="result-bar-body"]').exists()).toBe(false)
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Keep in history', 'Download JSON'])
    expect(wrapper.get('[data-testid="result-details"]').text()).toBe('Details')
  })

  it('offers no Keep where history is unavailable or no phase finished, and says why', () => {
    const unavailable = mountBar({ result: partial(), save: 'unavailable' })
    expect(unavailable.get('[data-testid="result-bar-body"]').text()).toBe('History is unavailable in this browser mode — results are not saved.')
    expect(unavailable.find('[data-testid="keep-in-history"]').exists()).toBe(false)
    const { idle: _idle, ...withoutIdle } = resultFixture()
    const nothing = mountBar({ result: { ...withoutIdle, status: 'error', download: { ...resultFixture().download!, status: 'error' }, upload: undefined }, save: null })
    expect(nothing.get('[data-testid="result-bar-body"]').text()).toBe('No phase finished, so there is nothing to keep in history.')
    expect(nothing.find('[data-testid="keep-in-history"]').exists()).toBe(false)
  })

  it.each(['partial', 'error'] as const)('keeps a %s result, says so with an undo toast, and Undo removes it again', async (status) => {
    const result = { ...partial(), status }
    const wrapper = mountBar({ result, save: null })
    await wrapper.get('[data-testid="keep-in-history"]').trigger('click')
    await flushPromises()
    expect(history.save).toHaveBeenCalledWith(result)
    expect(wrapper.get('[role="status"]').text()).toBe(`Saved as ${status}`)
    expect(wrapper.find('[data-testid="keep-in-history"]').exists()).toBe(false)
    const [notice] = vi.mocked(notify).mock.lastCall ?? []
    expect(notice).toMatchObject({ tone: 'info', title: `Kept in history as ${status}.`, undo: { label: 'Undo' } })
    notice?.undo?.onClick()
    await flushPromises()
    expect(history.remove).toHaveBeenCalledWith([result.id])
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ tone: 'info', title: 'Removed from history.' }))
    expect(wrapper.get('[role="status"]').text()).toBe(status === 'error' ? 'Results of a failed test are not saved' : 'Partial results are not saved')
    expect(wrapper.find('[data-testid="keep-in-history"]').exists()).toBe(true)
  })

  it('hands the focus to Download JSON once kept, and back to Keep after the toast\'s Undo (QA-55)', async () => {
    const wrapper = mountBar({ result: partial(), save: null })
    const keep = wrapper.get<HTMLButtonElement>('[data-testid="keep-in-history"]')
    keep.element.focus()
    await keep.trigger('click')
    await flushPromises()
    expect(document.activeElement?.textContent?.trim()).toBe('Download JSON')
    // The toast's Undo has the focus, and goes with its toast.
    const toast = document.body.appendChild(document.createElement('button'))
    toast.focus()
    const [notice] = vi.mocked(notify).mock.lastCall ?? []
    notice?.undo?.onClick()
    toast.remove()
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="keep-in-history"]').element)
    wrapper.unmount()
  })

  it('keeps the focus on Keep while it saves, and takes no second press', async () => {
    let finish: (saved: boolean) => void = () => undefined
    history.save.mockReturnValue(new Promise<boolean>((resolve) => (finish = resolve)))
    const wrapper = mountBar({ result: partial(), save: null })
    const keep = wrapper.get<HTMLButtonElement>('[data-testid="keep-in-history"]')
    keep.element.focus()
    await keep.trigger('click')
    await keep.trigger('click')
    expect([keep.attributes('aria-disabled'), keep.attributes('disabled')]).toEqual(['true', undefined])
    expect(document.activeElement).toBe(keep.element)
    expect(history.save).toHaveBeenCalledTimes(1)
    finish(true)
    await flushPromises()
    wrapper.unmount()
  })

  it('says when the browser refused to keep the result, and offers Keep again', async () => {
    history.save.mockResolvedValue(false)
    const wrapper = mountBar({ result: partial(), save: null })
    await wrapper.get('[data-testid="keep-in-history"]').trigger('click')
    await flushPromises()
    expect(notify).toHaveBeenCalledWith({ tone: 'danger', title: 'The browser refused to store the result.' })
    expect(wrapper.find('[data-testid="keep-in-history"]').exists()).toBe(true)
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

  it('names only the known cause of a rate limit, never three refusals, with the same body', () => {
    const shown = phases({ idle: { state: 'finished' }, download: { state: 'failed', ranMs: 2300 } })
    expect(failure({ code: 'rate-limited', phase: 'download', partial: true }, shown)).toEqual([
      'Basement NAS rate-limited a request during download; the test stopped after 3 consecutive request failures.',
      'Download stopped at 2.3 s. Latency finished before the error.',
    ])
    expect(failure({ code: 'server-busy', phase: 'download', partial: true }, shown)).toEqual([
      'Basement NAS was busy and refused a request during download; the test stopped after 3 consecutive request failures.',
      'Download stopped at 2.3 s. Latency finished before the error.',
    ])
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
