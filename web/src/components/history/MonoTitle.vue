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
// A notice title that names a file or an origin, set in mono (kit History.jsx, its ds-num spans).

defineProps<{ keypath: string; name: string; value: string }>()
</script>

<template>
  <i18n-t
    :keypath="keypath"
    scope="global"
  >
    <template #[name]>
      <span class="font-mono tabular-nums">{{ value }}</span>
    </template>
  </i18n-t>
</template>
