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
import BrandLogo from '@/components/brand/BrandLogo.vue'

// The About screen (ui/screens.md section 5): its title here; the version, licence, privacy,
// credits and methodology summary fill it in later.
</script>

<template>
  <main class="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-3 px-4 py-10">
    <div class="flex items-center gap-3">
      <BrandLogo :size="40" />
      <div class="flex flex-col">
        <h1 class="text-(length:--text-2xl) font-semibold tracking-(--tracking-tight)">
          {{ $t('about.title') }}
        </h1>
        <p class="text-(length:--text-sm) text-muted-foreground">
          {{ $t('about.tagline') }}
        </p>
      </div>
    </div>
  </main>
</template>
