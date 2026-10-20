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
import type { Choice } from '@/demo/choice'

// The demo panel's About section (frontend.md section 9, kit App.jsx): the compatibility layers
// the scenario's GET /info reports on, each on by default as in the kit. The page's scheme is never
// faked: the demo is served over http, so its About always shows the HTTPS note.

defineProps<{ choice: Choice }>()
const emit = defineEmits<{ apply: [patch: Partial<Choice>] }>()

const TEXT = { about: 'About · compatibility layers' }

/** The layers in the kit's order, with its words. */
const LAYERS = [
  ['openspeedtest', 'OpenSpeedTest'],
  ['librespeed', 'LibreSpeed'],
  ['networkquality', 'networkQuality'],
] as const
</script>

<template>
  <section class="flex flex-col gap-2 border-t border-border pt-3">
    <span class="text-(length:--text-caption) font-semibold text-muted-foreground">{{ TEXT.about }}</span>
    <label
      v-for="[layer, words] in LAYERS"
      :key="layer"
      class="flex cursor-pointer items-center gap-2 text-(length:--text-caption) text-muted-foreground"
    >
      <input
        type="checkbox"
        class="size-3.5 flex-none accent-(--primary)"
        :checked="choice[layer]"
        :data-testid="`demo-layer-${layer}`"
        @change="emit('apply', { [layer]: !choice[layer] })"
      >{{ words }}</label>
  </section>
</template>
