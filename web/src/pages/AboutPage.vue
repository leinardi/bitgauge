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
import { ExternalLink, Layers } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BrandLogo from '@/components/brand/BrandLogo.vue'
import OfflineNotice from '@/components/OfflineNotice.vue'
import AppButton from '@/components/actions/AppButton.vue'
import AppLink from '@/components/actions/AppLink.vue'
import GithubIcon from '@/components/brand/GithubIcon.vue'
import NoticeBox from '@/components/test/NoticeBox.vue'
import { useInfo } from '@/composables/useInfo'
import { links } from '@/lib/links'

// The About screen (ui/screens.md section 5, design_system kit About.jsx), as v0.1 has it: the
// layers for other clients arrive in v0.3, so there are no snippets; what BitGauge is, its build,
// license, source, privacy and a methodology summary of the v0.1 metrics.

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
    { key: 'license', label: t('about.facts.license'), value: t('about.facts.licenseValue') },
    { key: 'server', label: t('about.facts.serverName'), value: server?.name ?? t('about.facts.unknown') },
  ]
})
</script>

<template>
  <main
    id="main"
    tabindex="-1"
    class="focus:outline-none mx-auto grid w-full max-w-(--layout-max) flex-1 grid-cols-1 content-start gap-6 px-(--layout-gutter-compact) pt-4 pb-6 desktop:grid-cols-[minmax(0,1fr)_var(--layout-rail)] desktop:px-(--layout-gutter) desktop:pt-6 desktop:pb-10"
  >
    <div class="flex flex-col gap-4">
      <header class="flex flex-col gap-1.5">
        <h1 class="text-(length:--text-3xl) leading-(--lh-snug) font-semibold tracking-(--tracking-tight) desktop:text-(length:--text-4xl) desktop:leading-(--lh-tight)">
          {{ t('about.clients.title') }}
        </h1>
        <p class="max-w-160 text-(length:--text-base) leading-(--lh-prose) text-muted-foreground">
          {{ t('about.clients.intro') }}
        </p>
      </header>
      <OfflineNotice
        v-if="reachability === 'unreachable'"
        :host="host"
        :body="t('about.unreachable', { host })"
        @retry="refresh"
      />
      <NoticeBox
        tone="info"
        :icon="Layers"
        :title="t('about.clients.v03Title')"
        :body="t('about.clients.v03Body')"
        :live="false"
      />
    </div>
    <aside class="flex min-w-0 flex-col gap-4">
      <section class="overflow-hidden rounded-(--radius-lg) border border-border bg-card shadow-card">
        <div class="flex flex-col gap-0.5 border-b border-border px-4 pt-4.5 pb-3.5">
          <span class="inline-flex items-center gap-3 text-(length:--text-xl) leading-(--lh-tight) font-semibold tracking-(--tracking-tight) text-foreground">
            <BrandLogo :size="40" />
            <span>{{ t('app.brand.bit') }}<span class="text-primary-text">{{ t('app.brand.gauge') }}</span></span>
          </span>
          <span class="pl-13 text-(length:--text-caption) leading-(--lh-snug) text-subtle-foreground">{{ t('about.tagline') }}</span>
        </div>
        <div class="px-4 pt-1 pb-2">
          <dl class="m-0 grid grid-cols-1">
            <div
              v-for="fact in facts"
              :key="fact.key"
              class="flex items-center justify-between gap-2.5 border-b border-border py-2"
              :data-testid="`about-${fact.key}`"
            >
              <dt class="flex min-w-0 flex-1 flex-col text-(length:--text-sm) text-foreground">
                <span>{{ fact.label }}</span>
              </dt>
              <dd
                class="m-0 font-mono text-(length:--text-sm) whitespace-nowrap"
                :class="fact.value === t('about.facts.unknown') ? 'text-subtle-foreground' : 'text-foreground'"
              >
                {{ fact.value }}
              </dd>
            </div>
          </dl>
        </div>
        <div class="flex flex-col gap-2 px-4 pt-2 pb-4">
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
              :href="links.license"
              target="_blank"
              rel="noopener noreferrer"
            >{{ t('about.licenseFile') }}</a>
          </AppButton>
        </div>
      </section>
      <section class="flex flex-col gap-2.5 rounded-(--radius-lg) border border-border bg-card p-4 shadow-card">
        <h2 class="font-(family-name:--font-cond) text-(length:--text-micro) leading-(--lh-snug) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">
          {{ t('about.methodology.title') }}
        </h2>
        <p class="text-(length:--text-sm) leading-(--lh-prose) text-muted-foreground">
          {{ t('about.methodology.summary') }}
        </p>
        <AppLink
          :href="links.methodology"
          external
        >
          {{ t('about.methodology.link') }}
        </AppLink>
      </section>
      <section class="flex flex-col gap-2.5 rounded-(--radius-lg) border border-border bg-card p-4 shadow-card">
        <h2 class="font-(family-name:--font-cond) text-(length:--text-micro) leading-(--lh-snug) font-semibold tracking-(--tracking-caps) text-subtle-foreground uppercase">
          {{ t('about.privacy.title') }}
        </h2>
        <p class="text-(length:--text-sm) leading-(--lh-prose) text-muted-foreground">
          {{ t('about.privacy.body') }}
        </p>
      </section>
    </aside>
  </main>
</template>
