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
import type { TimedText } from '@/lib/timeText'

// Text with its dates in <time> elements (src/lib/timeText.ts).

defineProps<{ runs: TimedText }>()
</script>

<template>
  <template
    v-for="(run, index) in runs"
    :key="index"
  >
    <time
      v-if="run.datetime !== undefined"
      :datetime="run.datetime"
    >{{ run.text }}</time>
    <template v-else>
      {{ run.text }}
    </template>
  </template>
</template>
