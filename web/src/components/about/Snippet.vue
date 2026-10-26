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
import { Check, Copy } from '@lucide/vue'
import { computed, onScopeDispose, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { type SnippetLine, snippetText } from '@/components/about/snippets'
import AppButton from '@/components/actions/AppButton.vue'

// The kit's Snippet (design_system/components/layout Snippet.jsx, layout.css `.snip`): a block on
// the terminal surface whose lines never wrap; a long line scrolls inside the focusable block, so
// the page never scrolls sideways (ui/screens.md section 5). Copy writes the block as ShareUrlField
// does, with the copied state announced and a refused clipboard said.

defineOptions({ name: 'CodeSnippet' })

const COPIED_MS = 1500
// Lines are joined by a line break in the text itself, so a selection copies as the button does.
const LINE_BREAK = '\n'

const props = defineProps<{ caption: string | null; copyLabel: string; lines: readonly SnippetLine[] }>()

const { t } = useI18n()
// The block is named by its caption, or by its copy label when it has none.
const label = computed(() => props.caption ?? props.copyLabel)
const copied = shallowRef(false)
const failed = shallowRef(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(snippetText(props.lines))
    failed.value = false
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      copied.value = false
    }, COPIED_MS)
  } catch {
    // No clipboard (an insecure origin, a refused permission): the block stays selectable.
    failed.value = true
  }
}

onScopeDispose(() => clearTimeout(timer))
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-1.5"
    data-testid="snippet"
  >
    <span
      v-if="caption !== null"
      class="text-(length:--text-caption) text-subtle-foreground"
    >{{ caption }}</span>
    <div class="relative rounded-(--radius-md) border border-(--border-subtle) bg-(--term-bg)">
      <pre
        tabindex="0"
        :aria-label="label"
        class="m-0 overflow-x-auto overscroll-x-contain py-3 pr-12 pl-3.5 font-mono text-(length:--text-caption) leading-(--lh-relaxed) whitespace-pre text-(--term-fg) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      ><template
        v-for="(line, index) in lines"
        :key="index"
      ><span
        v-for="(part, at) in line"
        :key="at"
        :class="part.kind === 'command' ? 'text-(--term-command)' : undefined"
      >{{ part.text }}</span>{{ index < lines.length - 1 ? LINE_BREAK : '' }}</template></pre>
      <AppButton
        variant="ghost"
        size="sm"
        class="absolute top-1.5 right-1.5 w-(--control-h-sm) justify-center px-0 text-(--term-muted)"
        :aria-label="copied ? t('about.snippet.copied') : copyLabel"
        :title="copyLabel"
        @click="copy"
      >
        <component
          :is="copied ? Check : Copy"
          :size="14"
          aria-hidden="true"
        />
      </AppButton>
    </div>
    <span
      class="sr-only"
      role="status"
    >{{ copied ? t('about.snippet.copied') : '' }}</span>
    <!-- A status too, present before it has text, so the refusal is announced as "Copied" is. -->
    <span
      class="text-(length:--text-caption) text-(--danger-fg) empty:hidden"
      role="status"
      data-testid="copy-failed"
    >{{ failed ? t('about.snippet.copyFailed') : '' }}</span>
  </div>
</template>
