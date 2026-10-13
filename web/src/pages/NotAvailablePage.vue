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
import { Button } from '@/components/ui/button'

// History, Settings and Result detail keep their routes in v0.1 and render this page
// (ui/screens.md section 1).
</script>

<template>
  <main
    id="main"
    tabindex="-1"
    class="focus:outline-none mx-auto flex w-full max-w-[1200px] flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center"
  >
    <h1 class="text-(length:--text-2xl) font-semibold tracking-(--tracking-tight)">
      {{ $t('notAvailable.title') }}
    </h1>
    <p class="text-(length:--text-base) text-muted-foreground">
      {{ $t('notAvailable.body') }}
    </p>
    <Button
      as-child
      variant="outline"
    >
      <RouterLink to="/">
        {{ $t('notAvailable.back') }}
      </RouterLink>
    </Button>
  </main>
</template>
