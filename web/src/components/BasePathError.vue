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
import { CircleAlert, ExternalLink, RefreshCw, Terminal } from '@lucide/vue'

import BrandLogo from '@/components/brand/BrandLogo.vue'
import AppButton from '@/components/actions/AppButton.vue'
import type { BasePathMismatch } from '@/lib/basePath'
import { links } from '@/lib/links'

// The base-path error of edge-cases.md section 20 (design_system kit TestScreen.jsx): the page is
// not where the server's base path puts it, so no API call can reach the server and nothing else
// loads. It names both paths and links to the sub-path instructions.

defineProps<{ mismatch: BasePathMismatch }>()

function reload(): void {
  window.location.reload()
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-background text-foreground">
    <main
      role="alert"
      aria-labelledby="base-path-title"
      class="flex min-h-(--layout-error-min-h-compact) flex-1 items-start justify-center px-(--layout-gutter-compact) pt-6 pb-10 desktop:min-h-(--layout-error-min-h) desktop:px-(--layout-gutter) desktop:py-16"
    >
      <div class="flex w-full max-w-error flex-col gap-5">
        <span class="inline-flex items-center gap-2 text-(length:--text-md) leading-(--lh-tight) font-semibold tracking-(--tracking-tight)">
          <BrandLogo :size="22" />
          <span>{{ $t('app.brand.bit') }}<span class="text-primary-text">{{ $t('app.brand.gauge') }}</span></span>
        </span>
        <div class="flex flex-col gap-2.5">
          <span class="flex items-center gap-1.5 font-(family-name:--font-cond) text-(length:--text-micro) leading-(--lh-snug) font-semibold tracking-(--tracking-caps) text-(--danger-fg) uppercase">
            <CircleAlert
              :size="13"
              :stroke-width="2.25"
              aria-hidden="true"
            />
            {{ $t('app.basePath.eyebrow') }}
          </span>
          <h1
            id="base-path-title"
            class="text-(length:--type-state-title-compact) leading-(--lh-tight) font-semibold tracking-(--tracking-tight) text-pretty desktop:text-(length:--type-state-title)"
          >
            {{ $t('app.basePath.title') }}
          </h1>
          <p
            v-if="mismatch.apiBasePath === null"
            class="text-(length:--text-base) leading-(--lh-prose) text-pretty text-muted-foreground"
          >
            {{ $t('app.basePath.body', { basePath: mismatch.basePath, pagePath: mismatch.pagePath }) }}
          </p>
          <p
            v-else
            class="text-(length:--text-base) leading-(--lh-prose) text-pretty text-muted-foreground"
          >
            {{ $t('app.basePath.apiBody', { basePath: mismatch.basePath, apiBasePath: mismatch.apiBasePath }) }}
          </p>
        </div>
        <dl class="m-0 grid grid-cols-1">
          <div class="flex items-center justify-between gap-2.5 border-b border-border py-2">
            <dt class="flex min-w-0 flex-1 flex-col text-(length:--text-sm) text-foreground">
              <span>{{ $t('app.basePath.pagePath') }}</span>
            </dt>
            <dd class="m-0 font-mono text-(length:--text-sm) whitespace-nowrap text-foreground">
              {{ mismatch.pagePath }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-2.5 border-b border-border py-2">
            <dt class="flex min-w-0 flex-1 flex-col text-(length:--text-sm) text-foreground">
              <span>{{ $t('app.basePath.serverBasePath') }}</span>
            </dt>
            <dd class="m-0 font-mono text-(length:--text-sm) whitespace-nowrap text-foreground">
              {{ mismatch.basePath }}
            </dd>
          </div>
          <div
            v-if="mismatch.apiBasePath !== null"
            class="flex items-center justify-between gap-2.5 border-b border-border py-2"
          >
            <dt class="flex min-w-0 flex-1 flex-col text-(length:--text-sm) text-foreground">
              <span>{{ $t('app.basePath.apiBasePath') }}</span>
            </dt>
            <dd class="m-0 font-mono text-(length:--text-sm) whitespace-nowrap text-(--danger-fg)">
              {{ mismatch.apiBasePath }}
            </dd>
          </div>
        </dl>
        <section
          class="overflow-hidden rounded-(--radius-lg) border border-border bg-card shadow-card"
          :aria-label="$t('app.basePath.hintLabel')"
        >
          <div class="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <span class="inline-flex text-subtle-foreground">
              <Terminal
                :size="15"
                aria-hidden="true"
              />
            </span>
            <h2 class="text-(length:--text-base) font-semibold">
              {{ $t('app.basePath.hintTitle') }}
            </h2>
          </div>
          <div class="p-4">
            <span class="text-(length:--text-sm) leading-normal text-muted-foreground">{{ $t('app.basePath.hint') }}</span>
          </div>
        </section>
        <div class="flex flex-wrap gap-2">
          <AppButton
            variant="primary"
            @click="reload"
          >
            <RefreshCw
              :size="15"
              aria-hidden="true"
            />
            {{ $t('app.basePath.reload') }}
          </AppButton>
          <AppButton
            as-child
          >
            <a
              :href="links.subPathGuide"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink
                :size="15"
                aria-hidden="true"
              />
              {{ $t('app.basePath.docs') }}
            </a>
          </AppButton>
        </div>
      </div>
    </main>
  </div>
</template>
