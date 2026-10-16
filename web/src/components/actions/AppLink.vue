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
import { ExternalLink } from '@lucide/vue'

// The kit's Link (design_system/components/actions Link.jsx, actions.css `.link`): a standalone
// text action in one weight and one color, at the size of the text around it. `external` marks a
// link that leaves the app: it opens in a new tab and carries the external-link icon.

defineProps<{ href: string; external?: boolean }>()
</script>

<template>
  <a
    :href="href"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener noreferrer' : undefined"
    class="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-primary-text no-underline hover:text-(--primary-hover) hover:underline hover:underline-offset-2"
  >
    <slot />
    <ExternalLink
      v-if="external"
      :size="12"
      aria-hidden="true"
    />
  </a>
</template>
