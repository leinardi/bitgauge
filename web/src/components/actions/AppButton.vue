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
import { Primitive, type PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

import { cn } from '@/lib/utils'

// The kit's Button (design_system/components/actions: Button.jsx, actions.css): one anatomy in
// sizes sm, md, lg and xl (the Start button's), and the variants the app uses. Every button and button-styled link of the
// app is one of these; the focus ring is base.css's. `as="a"` with an href renders the link form.
// Each size states its leading after its font size: tailwind-merge drops a leading set before one.

type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'
type AppButtonSize = 'sm' | 'md' | 'lg' | 'xl'

const props = withDefaults(defineProps<PrimitiveProps & { variant?: AppButtonVariant; size?: AppButtonSize; block?: boolean; class?: HTMLAttributes['class'] }>(), {
  as: 'button',
  variant: 'secondary',
  size: 'md',
  block: false,
  class: undefined,
})

const SIZES: Record<AppButtonSize, string> = {
  sm: 'h-(--control-h-sm) px-2.5 text-(length:--text-caption) leading-(--lh-tight)',
  md: 'h-(--control-h-md) px-3.5 text-(length:--text-sm) leading-(--lh-tight)',
  lg: 'h-(--control-h-lg) px-4 text-(length:--text-sm) leading-(--lh-tight)',
  xl: 'h-(--control-h-xl) gap-2.5 px-5 text-(length:--text-md) leading-(--lh-tight)',
}

const VARIANTS: Record<AppButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-(--primary-hover) hover:text-primary-foreground active:bg-(--primary-active)',
  secondary: 'border-input bg-secondary text-secondary-foreground hover:bg-(--surface-4) hover:text-foreground',
  ghost: 'bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  danger: 'border-(--danger-border) bg-transparent text-(--danger-fg) hover:bg-(--danger-bg) hover:text-(--danger-fg)',
  'danger-solid': 'bg-(--danger-solid) text-(--fg-on-solid) hover:bg-(--danger-solid-hover) hover:text-(--fg-on-solid)',
}
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn(
      'inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-(--radius-md) border border-transparent font-sans font-semibold whitespace-nowrap no-underline transition-[background-color,border-color] duration-(--dur-fast) disabled:pointer-events-none disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 motion-reduce:transition-none [&_svg]:shrink-0',
      SIZES[props.size],
      VARIANTS[props.variant],
      props.block && 'w-full justify-center',
      props.class,
    )"
  >
    <slot />
  </Primitive>
</template>
