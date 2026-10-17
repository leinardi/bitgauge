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
import { TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

// A chart's table (design_system/components/charts PhaseChart.jsx children, kit ResultDetail.jsx
// .tbl): the first column names the row's span, the others are numbers, right-aligned in mono; a
// long or wide table scrolls under its sticky header in one region the keyboard can reach. The
// footer says how the numbers are made.

defineProps<{
  label: string
  columns: string[]
  rows: string[][]
  foot: string
}>()

const HEAD = 'sticky top-0 h-auto bg-(--surface-2) px-2.5 py-2 font-(family-name:--font-cond) text-(length:--text-micro) font-semibold tracking-(--tracking-caps-tight) text-subtle-foreground uppercase'
const CELL = 'px-2.5 py-1.5 font-mono text-(length:--text-caption) whitespace-nowrap'
</script>

<template>
  <div
    role="region"
    tabindex="0"
    :aria-label="label"
    class="-mx-1 overflow-auto"
    :class="rows.length > 10 ? 'max-h-90' : ''"
    data-testid="window-table"
  >
    <table class="w-full caption-bottom border-collapse text-sm">
      <TableCaption class="sr-only">
        {{ label }}
      </TableCaption>
      <TableHeader class="[&_tr]:border-(--border-default)">
        <TableRow class="hover:bg-transparent">
          <TableHead
            v-for="(column, index) in columns"
            :key="column"
            :class="[HEAD, index === 0 ? 'text-left' : 'text-right']"
          >
            {{ column }}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow
          v-for="(row, index) in rows"
          :key="index"
          class="border-(--border-subtle) hover:bg-transparent"
        >
          <TableCell
            v-for="(cell, column) in row"
            :key="column"
            :class="[CELL, column === 0 ? 'text-left text-muted-foreground' : column === 1 ? 'text-right text-muted-foreground' : 'text-right text-foreground']"
          >
            {{ cell }}
          </TableCell>
        </TableRow>
      </TableBody>
    </table>
  </div>
  <p class="text-(length:--text-micro) leading-(--lh-normal) text-pretty text-subtle-foreground">
    {{ foot }}
  </p>
</template>
