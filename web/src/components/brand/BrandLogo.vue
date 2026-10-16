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
// The BitGauge mark, full geometry (design_system components/brand/Logo.jsx): the track, the
// download and upload arcs and the dashed latency arc, colored by the series tokens through
// classes. Decorative: the wordmark or the link around it names it.
defineProps<{ size: number }>()
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    aria-hidden="true"
    class="block flex-none"
  >
    <path
      d="M14.32 53.68 A25 25 0 1 1 49.68 53.68"
      fill="none"
      stroke="currentColor"
      stroke-opacity=".14"
      stroke-width="5"
      stroke-linecap="round"
    />
    <path
      d="M14.32 53.68 A25 25 0 1 1 53.65 23.5"
      fill="none"
      class="stroke-series-download"
      stroke-width="5"
      stroke-linecap="round"
    />
    <path
      d="M19.98 48.02 A17 17 0 0 1 32 19"
      fill="none"
      class="stroke-series-upload"
      stroke-width="5"
      stroke-linecap="round"
    />
    <path
      d="M25.64 42.36 A9 9 0 0 1 27.5 28.21"
      fill="none"
      class="stroke-series-latency"
      stroke-width="4"
      stroke-dasharray="2.6 3"
    />
  </svg>
</template>
