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

import { computed, type MaybeRefOrGetter, shallowRef, toValue } from 'vue'
import { useI18n } from 'vue-i18n'

import { notify } from '@/components/feedback/notify'
import type { Result } from '@/engine/messages'
import { canShareFiles, copySummary, downloadImage, imageFilename, shareImage } from '@/share/actions'
import { shareContent } from '@/share/content'
import { renderShareImage } from '@/share/render'
import { shareView } from '@/share/summary'

// One result's share (ui/flows.md section 8): its view with the label left out unless the user
// includes it, the summary text, and the three actions with their toasts. A clipboard the browser
// refuses gives no toast: the panel shows the summary selected for a manual copy instead.

export function useShare(result: MaybeRefOrGetter<Result>, units: MaybeRefOrGetter<'bits' | 'bytes'>) {
  const { t, locale } = useI18n()
  const includeLabel = shallowRef(false)
  /** The clipboard refused the last copy. */
  const denied = shallowRef(false)
  const busy = shallowRef(false)
  const canShare = canShareFiles()

  const hasLabel = computed(() => toValue(result).label !== '')
  const view = computed(() => shareView(shareContent(toValue(result), includeLabel.value), toValue(units), { t, locale: locale.value }))
  const text = computed(() => view.value.lines.join('\n'))
  const words = () => ({ wordmark: [t('app.brand.bit'), t('app.brand.gauge')] as [string, string], bufferbloat: t('share.image.bufferbloat') })

  async function image(): Promise<Blob | null> {
    busy.value = true
    try {
      const blob = await renderShareImage(view.value, words())
      if (blob === null) {
        notify({ tone: 'danger', title: t('share.image.failed') })
      }
      return blob
    } finally {
      busy.value = false
    }
  }

  async function download(): Promise<void> {
    const blob = await image()
    if (blob !== null) {
      downloadImage(blob, toValue(result).startedAt)
      notify({ tone: 'ok', title: t('share.image.saved'), message: imageFilename(toValue(result).startedAt) })
    }
  }

  async function copy(): Promise<void> {
    denied.value = !(await copySummary(text.value))
    if (!denied.value) {
      notify({ tone: 'ok', title: t('share.text.copied') })
    }
  }

  async function share(): Promise<void> {
    const blob = await image()
    if (blob !== null) {
      await shareImage(blob, toValue(result).startedAt, t('share.image.shareTitle'))
    }
  }

  return { includeLabel, hasLabel, view, text, denied, busy, canShare, download, copy, share }
}
