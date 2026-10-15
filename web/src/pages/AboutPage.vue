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
import { ExternalLink } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BrandLogo from '@/components/brand/BrandLogo.vue'
import OfflineNotice from '@/components/OfflineNotice.vue'
import AppButton from '@/components/actions/AppButton.vue'
import AppLink from '@/components/actions/AppLink.vue'
import GithubIcon from '@/components/brand/GithubIcon.vue'
import { useInfo } from '@/composables/useInfo'
import { links } from '@/lib/links'

// The About screen (ui/screens.md section 5, design_system kit About.jsx), as v0.1 has it: the
// layers for other clients arrive in v0.3, so there are no snippets; what BitGauge is, its build,
// licence, source, privacy, credits and a methodology summary of the v0.1 metrics.

const { t, locale } = useI18n()
const { info, reachability, refresh } = useInfo()
const host = window.location.host

function buildDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(date)
}

// Until GET /info first answers the facts are dashes; "server unreachable" only once it failed.
const facts = computed(() => {
  const server = reachability.value === 'unreachable' ? null : info.value?.server
  const unknownVersion = reachability.value === 'unreachable' ? t('about.facts.versionUnreachable') : t('about.facts.unknown')
  return [
    {
      key: 'version',
      label: t('about.facts.version'),
      value: server ? t('about.facts.build', { version: server.version, commit: server.commit, date: buildDate(server.buildDate) }) : unknownVersion,
    },
    { key: 'licence', label: t('about.facts.licence'), value: t('about.facts.licenceValue') },
    { key: 'server', label: t('about.facts.serverName'), value: server?.name ?? t('about.facts.unknown') },
  ]
})

const credits = computed(() => [
  { name: t('about.credits.openspeedtest.name'), what: t('about.credits.openspeedtest.what') },
  { name: t('about.credits.librespeed.name'), what: t('about.credits.librespeed.what') },
  { name: t('about.credits.cloudflare.name'), what: t('about.credits.cloudflare.what') },
  { name: t('about.credits.apple.name'), what: t('about.credits.apple.what') },
  { name: t('about.credits.waveform.name'), what: t('about.credits.waveform.what') },
])
</script>

<template>
  <main
    id="main"
    tabindex="-1"
    class="focus:outline-none mx-auto grid w-full max-w-(--layout-max) flex-1 grid-cols-1 content-start gap-6 px-4 pt-4 pb-6 sm:px-10 sm:pt-6 sm:pb-12 lg:grid-cols-[minmax(0,1fr)_var(--layout-rail)]"
  >
    <div class="flex flex-col gap-4">
      <header class="flex flex-col gap-2">
        <h1 class="text-(length:--text-3xl) leading-(--lh-snug) font-semibold tracking-(--tracking-tight) sm:text-(length:--text-4xl) sm:leading-(--lh-tight)">
          {{ t('about.clients.title') }}
        </h1>
        <p class="text-(length:--text-base) leading-(--lh-prose) text-muted-foreground">
          {{ t('about.clients.v03') }}
        </p>
      </header>
      <OfflineNotice
        v-if="reachability === 'unreachable'"
        :host="host"
        @retry="refresh"
      />
    </div>
    <aside class="flex flex-col gap-4">
      <section class="flex flex-col gap-4 rounded-(--radius-md) border border-border bg-card p-4">
        <div class="flex items-center gap-3">
          <BrandLogo :size="40" />
          <div class="flex flex-col">
            <span class="text-(length:--text-xl) font-semibold tracking-(--tracking-tight)">{{ t('app.brand.bit') }}<span class="text-primary-text">{{ t('app.brand.gauge') }}</span></span>
            <span class="text-(length:--text-sm) text-muted-foreground">{{ t('about.tagline') }}</span>
          </div>
        </div>
        <dl class="flex flex-col border-t border-border">
          <div
            v-for="fact in facts"
            :key="fact.key"
            class="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-border py-2"
            :data-testid="`about-${fact.key}`"
          >
            <dt class="text-(length:--text-sm) text-muted-foreground">
              {{ fact.label }}
            </dt>
            <dd class="font-mono text-(length:--text-caption) text-foreground">
              {{ fact.value }}
            </dd>
          </div>
        </dl>
        <div class="flex flex-col gap-2">
          <AppButton
            as-child
            block
          >
            <a
              :href="links.source"
              target="_blank"
              rel="noopener noreferrer"
            >
              <GithubIcon :size="15" />
              {{ t('about.source') }}
              <ExternalLink
                :size="14"
                aria-hidden="true"
              />
            </a>
          </AppButton>
          <AppButton
            as-child
            variant="ghost"
            size="sm"
            block
          >
            <a
              :href="links.licence"
              target="_blank"
              rel="noopener noreferrer"
            >{{ t('about.licenceFile') }}</a>
          </AppButton>
        </div>
      </section>
      <section class="flex flex-col gap-2 rounded-(--radius-md) border border-border bg-card p-4">
        <h2 class="font-(family-name:--font-cond) text-(length:--text-micro) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">
          {{ t('about.methodology.title') }}
        </h2>
        <p class="text-(length:--text-sm) leading-normal text-muted-foreground">
          {{ t('about.methodology.summary') }}
        </p>
        <AppLink
          :href="links.methodology"
          external
        >
          {{ t('about.methodology.link') }}
        </AppLink>
      </section>
      <section class="flex flex-col gap-2 rounded-(--radius-md) border border-border bg-card p-4">
        <h2 class="font-(family-name:--font-cond) text-(length:--text-micro) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">
          {{ t('about.privacy.title') }}
        </h2>
        <p class="text-(length:--text-sm) leading-normal text-muted-foreground">
          {{ t('about.privacy.body') }}
        </p>
      </section>
      <section class="flex flex-col gap-2 rounded-(--radius-md) border border-border bg-card p-4">
        <h2 class="font-(family-name:--font-cond) text-(length:--text-micro) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">
          {{ t('about.credits.title') }}
        </h2>
        <ul class="flex flex-col gap-2">
          <li
            v-for="credit in credits"
            :key="credit.name"
            class="flex flex-col"
          >
            <span class="text-(length:--text-sm) font-medium text-foreground">{{ credit.name }}</span>
            <span class="text-(length:--text-caption) text-muted-foreground">{{ credit.what }}</span>
          </li>
        </ul>
        <p class="text-(length:--text-caption) leading-normal text-subtle-foreground">
          {{ t('about.credits.trademark') }}
        </p>
      </section>
    </aside>
  </main>
</template>
