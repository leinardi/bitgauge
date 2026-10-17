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
import { LOGO_BOX, LOGO_PATHS, LOGO_STROKE } from '@/components/brand/logo'

// The BitGauge mark, full geometry (design_system components/brand/Logo.jsx, brand/logo.ts): the
// track, the download and upload arcs and the dashed latency arc, colored by the series tokens
// through classes. Decorative: the wordmark or the link around it names it.
defineProps<{ size: number }>()

const VIEW_BOX = `0 0 ${LOGO_BOX} ${LOGO_BOX}`
const DASH = LOGO_STROKE.latencyDash.join(' ')
</script>

<template>
  <svg
    :width="size"
    :height="size"
    :view-box.camel="VIEW_BOX"
    aria-hidden="true"
    class="block flex-none"
  >
    <path
      :d="LOGO_PATHS.track"
      fill="none"
      stroke="currentColor"
      :stroke-opacity="LOGO_STROKE.trackOpacity"
      :stroke-width="LOGO_STROKE.width"
      stroke-linecap="round"
    />
    <path
      :d="LOGO_PATHS.download"
      fill="none"
      class="stroke-series-download"
      :stroke-width="LOGO_STROKE.width"
      stroke-linecap="round"
    />
    <path
      :d="LOGO_PATHS.upload"
      fill="none"
      class="stroke-series-upload"
      :stroke-width="LOGO_STROKE.width"
      stroke-linecap="round"
    />
    <path
      :d="LOGO_PATHS.latency"
      fill="none"
      class="stroke-series-latency"
      :stroke-width="LOGO_STROKE.latencyWidth"
      :stroke-dasharray="DASH"
    />
  </svg>
</template>
