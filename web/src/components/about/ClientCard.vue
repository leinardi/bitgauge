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
import { CircleMinus, Globe, Info, Monitor, Terminal, TriangleAlert } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import Snippet from '@/components/about/Snippet.vue'
import { type Layer, type SnippetBlock, layerSnippets } from '@/components/about/snippets'
import SettingsCard from '@/components/settings/SettingsCard.vue'
import StatusPill from '@/components/status/StatusPill.vue'

// One layer of the About screen (ui/screens.md section 5, kit About.jsx): its snippets when the
// layer is on, or when the server is unreachable and its flag unknown, which the "Not confirmed"
// pill says; otherwise the note that the operator can enable it.

const props = defineProps<{ layer: Layer; state: 'on' | 'off' | 'unknown'; base: string; name: string; insecure: boolean }>()

const ICONS = { openspeedtest: Globe, librespeed: Terminal, networkquality: Monitor }

const { t } = useI18n()
const texts = computed((): Record<Layer, { name: string; tag: string; desc: string; offWhat: string; note: string | null }> => ({
  openspeedtest: { name: t('about.layers.openspeedtest.name'), tag: t('about.layers.openspeedtest.tag'), desc: t('about.layers.openspeedtest.desc'), offWhat: t('about.layers.openspeedtest.offWhat'), note: t('about.layers.openspeedtest.note') },
  librespeed: { name: t('about.layers.librespeed.name'), tag: t('about.layers.librespeed.tag'), desc: t('about.layers.librespeed.desc'), offWhat: t('about.layers.librespeed.offWhat'), note: null },
  networkquality: { name: t('about.layers.networkquality.name'), tag: t('about.layers.networkquality.tag'), desc: t('about.layers.networkquality.desc'), offWhat: t('about.layers.networkquality.offWhat'), note: t('about.layers.networkquality.note') },
}))
const text = computed(() => texts.value[props.layer])
const labels = computed((): Record<SnippetBlock['key'], { caption: string | null; copy: string }> => ({
  ostUrl: { caption: null, copy: t('about.snippets.ostUrl.copy') },
  serverList: { caption: t('about.snippets.serverList.caption'), copy: t('about.snippets.serverList.copy') },
  localJson: { caption: null, copy: t('about.snippets.localJson.copy') },
  serverJson: { caption: t('about.snippets.serverJson.caption'), copy: t('about.snippets.serverJson.copy') },
  nqConfig: { caption: null, copy: t('about.snippets.nqConfig.copy') },
  nqVerbose: { caption: t('about.snippets.nqVerbose.caption'), copy: t('about.snippets.nqVerbose.copy') },
}))
const blocks = computed(() => layerSnippets(props.layer, props.base, props.name).map((block) => ({ ...block, ...labels.value[block.key] })))
</script>

<template>
  <SettingsCard
    :id="`about-layer-${layer}-title`"
    :title="text.name"
    :icon="ICONS[layer]"
    :data-testid="`about-layer-${layer}`"
  >
    <template #actions>
      <StatusPill :dot="false">
        {{ text.tag }}
      </StatusPill>
      <StatusPill
        v-if="state === 'off'"
        :dot="false"
        dashed
      >
        {{ t('about.layers.off') }}
      </StatusPill>
      <StatusPill
        v-if="state === 'unknown'"
        :dot="false"
        dashed
      >
        {{ t('about.layers.notConfirmed') }}
      </StatusPill>
    </template>
    <div
      v-if="state !== 'off'"
      class="flex flex-col gap-2 px-4 pt-3 pb-4"
    >
      <span class="text-(length:--text-sm) leading-(--lh-normal) text-muted-foreground">{{ text.desc }}</span>
      <Snippet
        v-for="block in blocks"
        :key="block.key"
        :caption="block.caption"
        :copy-label="block.copy"
        :lines="block.lines"
      />
      <span
        v-if="layer === 'networkquality' && insecure"
        class="flex items-start gap-2 text-(length:--text-caption) leading-(--lh-normal) text-muted-foreground"
        data-testid="about-https-note"
      >
        <TriangleAlert
          :size="14"
          class="shrink-0 text-(--warn)"
          aria-hidden="true"
        />
        {{ t('about.layers.networkquality.https') }}
      </span>
      <span
        v-if="text.note !== null"
        class="flex items-start gap-2 text-(length:--text-caption) leading-(--lh-normal) text-muted-foreground"
      >
        <Info
          :size="14"
          class="shrink-0 text-(--info)"
          aria-hidden="true"
        />
        {{ text.note }}
      </span>
    </div>
    <div
      v-else
      class="flex items-start gap-2.5 px-4 pt-3.5 pb-4"
    >
      <CircleMinus
        :size="16"
        class="shrink-0 text-subtle-foreground"
        aria-hidden="true"
      />
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="text-(length:--text-sm) font-medium">{{ t('about.layers.offTitle') }}</span>
        <span class="text-(length:--text-caption) leading-(--lh-snug) text-subtle-foreground">{{ text.offWhat }}</span>
      </div>
    </div>
  </SettingsCard>
</template>
