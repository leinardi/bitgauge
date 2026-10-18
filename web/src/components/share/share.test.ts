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

// The share panel (ui/flows.md section 8, share-panel.md): the preview and the summary say exactly
// what is shared, the label only once included; Download image and Copy summary confirm with a
// toast; a refused clipboard selects the summary for a manual copy instead; Share shows only where
// the browser can share files; on the Test screen the same panel opens in a dialog.

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'vue-sonner'

import ShareDialog from '@/components/share/ShareDialog.vue'
import SharePanel from '@/components/share/SharePanel.vue'
import { createAppI18n } from '@/i18n'
import { saveFile } from '@/lib/saveFile'
import { renderShareImage } from '@/share/render'
import { resultFixture } from '@/test/fixtures'

vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))
vi.mock('@/lib/saveFile', () => ({ saveFile: vi.fn() }))
vi.mock('@/share/render', () => ({ renderShareImage: vi.fn() }))

const PNG = new Blob(['png'], { type: 'image/png' })
const RESULT = resultFixture({ label: 'Home Wi-Fi', note: 'neighbor streaming' })

function browser(parts: { writeText?: (text: string) => Promise<void>; share?: boolean }) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: parts.writeText === undefined ? undefined : { writeText: parts.writeText } })
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: parts.share === true ? () => true : undefined })
  Object.defineProperty(navigator, 'share', { configurable: true, value: parts.share === true ? vi.fn().mockResolvedValue(undefined) : undefined })
}

function mountPanel(result = RESULT) {
  return mount(SharePanel, { props: { result, units: 'bits' }, global: { plugins: [createAppI18n('', ['en'])] }, attachTo: document.body })
}

beforeEach(() => {
  vi.mocked(renderShareImage).mockResolvedValue(PNG)
})

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('the share panel', () => {
  it('previews the summary without the label, IP, note or browser until the label is included', async () => {
    browser({})
    const panel = mountPanel()
    const summary = () => panel.get('[data-testid="share-summary"]').text()
    expect(summary().split('\n')[0]).toBe('BitGauge')
    for (const secret of ['Home Wi-Fi', '192.168.1.42', 'neighbor', 'Firefox']) {
      expect(summary()).not.toContain(secret)
      expect(panel.get('[data-testid="share-preview"]').text()).not.toContain(secret)
    }
    expect(panel.text()).toContain('Adds “Home Wi-Fi” to the image and the text.')
    await panel.get('[data-testid="include-label"]').trigger('click')
    expect(summary().split('\n')[0]).toBe('BitGauge · Home Wi-Fi')
    expect(panel.get('[data-testid="share-preview"]').text()).toContain('Home Wi-Fi')
    expect(panel.get('[data-testid="share-preview"]').attributes('aria-label')).toBe(`Share image: ${summary().split('\n').join(', ')}`)
  })

  it('offers no label to include for a result without one', () => {
    browser({})
    const panel = mountPanel(resultFixture())
    expect(panel.get('[data-testid="include-label"]').attributes('disabled')).toBeDefined()
    expect(panel.text()).toContain('no label set')
  })

  it('downloads the image it renders from the previewed view, and confirms', async () => {
    browser({})
    const panel = mountPanel()
    expect(panel.find('[data-testid="share-image"]').exists()).toBe(false)
    await panel.get('[data-testid="download-image"]').trigger('click')
    await flushPromises()
    const [view] = vi.mocked(renderShareImage).mock.lastCall ?? []
    expect(view?.lines.join('\n')).toBe(panel.get('[data-testid="share-summary"]').text())
    expect(saveFile).toHaveBeenCalledWith(expect.stringMatching(/^bitgauge-\d{4}-\d{2}-\d{2}-\d{4}\.png$/), PNG, 'image/png')
    expect(toast.success).toHaveBeenCalledWith('Image downloaded.')
  })

  it('says so when the browser cannot make the image', async () => {
    browser({})
    vi.mocked(renderShareImage).mockResolvedValue(null)
    const panel = mountPanel()
    await panel.get('[data-testid="download-image"]').trigger('click')
    await flushPromises()
    expect(saveFile).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith("The browser couldn't make the image.")
  })

  it('copies the summary as previewed, and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    browser({ writeText })
    const panel = mountPanel()
    await panel.get('[data-testid="copy-summary"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(panel.get('[data-testid="share-summary"]').text())
    expect(toast.success).toHaveBeenCalledWith('Summary copied.')
    expect(panel.find('[data-testid="copy-denied"]').exists()).toBe(false)
  })

  it('selects the summary for a manual copy where the clipboard is refused, with no toast', async () => {
    browser({ writeText: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')) })
    const panel = mountPanel()
    await panel.get('[data-testid="copy-summary"]').trigger('click')
    await flushPromises()
    expect(toast.success).not.toHaveBeenCalled()
    expect(panel.get('[data-testid="copy-denied"]').text()).toContain('Clipboard access was denied')
    const summary = panel.get('[data-testid="share-summary"]').element
    expect(document.activeElement).toBe(summary)
    expect(window.getSelection()?.toString()).toBe(summary.textContent)
  })

  it('passes the image to the share sheet where the browser can share files', async () => {
    browser({ share: true })
    const panel = mountPanel()
    await panel.get('[data-testid="share-image"]').trigger('click')
    await flushPromises()
    expect(navigator.share).toHaveBeenCalledWith({ files: [expect.any(File)], title: 'BitGauge result' })
  })
})

describe('the share dialog', () => {
  it('opens the share panel from Share, titled and described', async () => {
    browser({})
    const wrapper = mount(ShareDialog, { props: { result: RESULT, units: 'bits' }, global: { plugins: [createAppI18n('', ['en'])] }, attachTo: document.body })
    expect(document.querySelector('[data-testid="share-dialog"]')).toBeNull()
    await wrapper.get('[data-testid="share-open"]').trigger('click')
    await flushPromises()
    const dialog = document.querySelector('[data-testid="share-dialog"]')
    expect(dialog?.getAttribute('role')).toBe('dialog')
    expect(dialog?.textContent).toContain('Share result')
    expect(dialog?.textContent).toContain('Your IP address and notes are never included.')
    expect(dialog?.querySelector('[data-testid="share-panel"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('moves the actions to its footer, as the kit does: Copy summary, then Download image, the primary', async () => {
    browser({})
    const wrapper = mount(ShareDialog, { props: { result: RESULT, units: 'bits' }, global: { plugins: [createAppI18n('', ['en'])] }, attachTo: document.body })
    await wrapper.get('[data-testid="share-open"]').trigger('click')
    await flushPromises()
    const footer = document.querySelector('[data-testid="share-actions"]')
    const actions = [...(footer?.querySelectorAll('button') ?? [])].map((button) => button.getAttribute('data-testid'))
    expect(actions).toEqual(['copy-summary', 'download-image'])
    expect(footer?.querySelector('[data-testid="download-image"]')?.className).toContain('bg-primary')
    expect(document.querySelectorAll('[data-testid="copy-summary"]')).toHaveLength(1)
    wrapper.unmount()
  })
})
