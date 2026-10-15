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
  <main
    role="alert"
    aria-labelledby="base-path-title"
    class="flex min-h-dvh justify-center bg-background px-4 py-10 text-foreground sm:px-10"
  >
    <div class="flex w-full max-w-[600px] flex-col gap-5.5">
      <span class="flex items-center gap-2 text-(length:--text-md) font-semibold tracking-(--tracking-tight)">
        <BrandLogo :size="22" />
        <span>{{ $t('app.brand.bit') }}<span class="text-primary-text">{{ $t('app.brand.gauge') }}</span></span>
      </span>
      <div class="flex flex-col gap-2.5">
        <span class="flex items-center gap-1.5 font-(family-name:--font-cond) text-(length:--text-micro) font-semibold tracking-(--tracking-caps) text-(--danger-fg) uppercase">
          <CircleAlert
            :size="13"
            aria-hidden="true"
          />
          {{ $t('app.basePath.eyebrow') }}
        </span>
        <h1
          id="base-path-title"
          class="text-(length:--type-state-title-compact) leading-(--lh-tight) font-semibold tracking-(--tracking-tight) min-[1140px]:text-(length:--type-state-title)"
        >
          {{ $t('app.basePath.title') }}
        </h1>
        <p
          v-if="mismatch.apiBasePath === null"
          class="text-(length:--text-base) leading-(--lh-prose) text-muted-foreground"
        >
          {{ $t('app.basePath.body', { basePath: mismatch.basePath, pagePath: mismatch.pagePath }) }}
        </p>
        <p
          v-else
          class="text-(length:--text-base) leading-(--lh-prose) text-muted-foreground"
        >
          {{ $t('app.basePath.apiBody', { basePath: mismatch.basePath, apiBasePath: mismatch.apiBasePath }) }}
        </p>
      </div>
      <dl class="flex flex-col border-t border-border">
        <div class="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-border py-2.25">
          <dt class="text-(length:--text-sm) text-muted-foreground">
            {{ $t('app.basePath.pagePath') }}
          </dt>
          <dd class="font-mono text-(length:--text-caption)">
            {{ mismatch.pagePath }}
          </dd>
        </div>
        <div class="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-border py-2.25">
          <dt class="text-(length:--text-sm) text-muted-foreground">
            {{ $t('app.basePath.serverBasePath') }}
          </dt>
          <dd class="font-mono text-(length:--text-caption)">
            {{ mismatch.basePath }}
          </dd>
        </div>
        <div
          v-if="mismatch.apiBasePath !== null"
          class="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-border py-2.25"
        >
          <dt class="text-(length:--text-sm) text-muted-foreground">
            {{ $t('app.basePath.apiBasePath') }}
          </dt>
          <dd class="font-mono text-(length:--text-caption) text-(--danger-fg)">
            {{ mismatch.apiBasePath }}
          </dd>
        </div>
      </dl>
      <section
        class="overflow-hidden rounded-(--radius-md) border border-border bg-card"
        :aria-label="$t('app.basePath.hintLabel')"
      >
        <div class="flex items-center gap-2 border-b border-border px-4 py-2.5 text-(length:--text-sm) font-semibold">
          <Terminal
            :size="15"
            aria-hidden="true"
          />
          {{ $t('app.basePath.hintTitle') }}
        </div>
        <div class="flex flex-col gap-2.5 px-4 pt-3.5 pb-4">
          <p class="text-(length:--text-sm) leading-normal text-muted-foreground">
            {{ $t('app.basePath.hint') }}
          </p>
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
</template>
