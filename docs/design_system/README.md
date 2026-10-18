# BitGauge Design System

> An honest, self-hosted speed test for LAN, homelab and VPN links.

The visual language, tokens, React components, UI kit and product spec for the BitGauge web UI. It
stands on its own — no external design-system dependency.

**Source:** built from the BitGauge design project (claude.ai/design/p/0146424e-80b6-4396-910f-aa2d30693359),
which was itself DS-ready. No Figma file or code repository was provided.

Production stack: **Vue 3 + Vite + TypeScript + Tailwind 4 + shadcn-vue (Reka UI)**, uPlot for charts,
`@lucide/vue` for icons, `vue-sonner` for toasts. The React components here are design-time
recreations for prototyping; the Tailwind mapping is in `tokens.md`.

## Product context

One product surface: the **BitGauge web UI**, a single-page app served by a self-hosted speed-test
server. Screens: **Test** (live gauge, throughput chart, phase indicator, metric tiles, bufferbloat
load card, quality list, save bar), **Result detail**, **History** (table, filters, trends, compare),
**Settings** (presets, streams, cap, units, theme, language) and **About / Other clients** (CLI
snippets). Full spec in `features/`.

## Index

The system is layered (atomic design): **tokens → base → components (atoms → molecules → organisms) →
templates (page shells) → screens (UI kit)**. Each rule lives in exactly one layer; a higher layer composes
the one below and never restyles it. See `CHANGELOG.md` for the structure audit.

| Path | Layer | What it is |
| --- | --- | --- |
| `styles.css` | entry | `@import`s only: tokens → base → components. Link this one file. |
| `colors_and_type.css` | tokens | IBM Plex `@font-face`, primitives, semantic tokens (dark + light), measurement layer, type scale + role tokens, line heights, spacing, layout, control sizes, radii, motion, z, semantic type classes (`.ds-*`). |
| `base.css` | base | Element defaults: box model, body font, size **and line height**, links, focus ring, selection, scrollbars, reduced motion, `.sr-only`. |
| `components/components.css` | components | Imports one CSS file per component group — the single visual definition each component renders. |
| `components/<group>/` | components | React components (`.jsx` + `.d.ts` + `.prompt.md`), the group's CSS, one `*.card.html`. |
| `components/*.md` | contracts | Behaviour, wording and accessibility contracts: `gauge`, `charts`, `tiles`, `notices`, `phase-indicator`, `save-bar`, `share-panel`, `navigation`. |
| `tokens.md` | docs | Token reference, Tailwind 4 / shadcn-vue mapping, WCAG contrast table, number formatting. |
| `ui_kits/app/` | screens | Clickable prototype (`index.html`) — a **consumer**: links `styles.css`, uses components from the bundle namespace, adds only kit-only CSS (`kit.css`, Demo panel) and fixtures (`fixtures.js`). |
| `preview/` | docs | Foundation cards: colours, type, spacing, radii, logo, app icons. |
| `assets/` | assets | Logo marks, favicons, app icons, webmanifest, `fonts/` (IBM Plex woff2, SIL OFL 1.1). |
| `features/` | spec | Product spec (maintained outside this project): `product.md`, `principles.md`, `measurement.md`, `ui/` (screens, flows, url-params, i18n-a11y). The spec decides content and behaviour. |
| `explorations/` | — | Logo explorations (history of the mark). |
| `SKILL.md` | — | Agent-Skills entry point. |
| `CHANGELOG.md` | — | Structure audit: what moved where, tokens/variants/rules added, remaining migration, open questions. |

## Components

All exported on the bundle namespace (`window.BitGaugeDesignSystem_1ab699`); looks come from the
group CSS + tokens. Components take data from props only — no sample data, no defaults that pretend to know
the server.

- **brand/** — `Icon` (+ `ICON_NAMES`), `Logo` (mark, wordmark, home link)
- **actions/** — `Button`, `StartButton`, `Link`, `Tooltip`, `Menu`, `Popover`, `OptionRows`
- **status/** — `StatusPill`, `StatusBadge`, `Chip`, `ChangedMark`
- **forms/** — `Input`, `FieldError`, `Select`, `Segmented`, `Switch`, `Toggle`, `Checkbox`, `ChoiceCard`
- **layout/** — `Card`, `Tabs`, `Table`, `MetaList`, `Stat`, `Snippet`
- **feedback/** — `Notice`, `Toast`, `ToastRegion`, `EmptyState`, `Skeleton`, `SkeletonRows`, `LiveRegion`, `SaveBar`, `FullScreenError`
- **dialog/** — `Dialog`, `Modal` (modal behaviour for custom dialogs: inert page, focus trap)
- **charts/** — `Chart`, `PhaseChart`, `Format` (number formatting)
- **gauge/** — `Gauge`
- **measurement/** — `MetricTile`, `PhaseStep`, `PhaseIndicator`, `LoadCard`, `GradeBadge`, `QualityList`, `NotMeasured`, `SharePreview`, `LastResult`
- **navigation/** — `AppHeader`, `TabBar`

### Intentional additions
- `Icon` — React wrapper over the bundled Lucide glyph map; plain-HTML cards render it (and `Logo`) with a small inline mount script.
- `Format` — the one implementation of tokens.md "Number formatting".
- `LiveRegion`, `Stat`, `LastResult` — small pieces the screens hand-rolled; now one definition each.

## UI kit

`ui_kits/app/index.html` — Test, Result detail, History, Settings, About, plus a Demo state panel
(kit-only) forcing every spec state. See `ui_kits/app/README.md`.

## Content fundamentals

Calm, exact, never breathless. BitGauge measures and reports; it never overclaims
(`features/principles.md` §2.1 Honest Numbers).

- **Sentence case** everywhere. UPPERCASE only for condensed eyebrows, table heads and status pills.
- **Second person, implied.** The UI addresses the user without "I" or "we": "Check the VPN, then retry."
- **Verb-first actions:** "Start test", "Run again", "Retry test", "Download JSON", "Copy summary", "Import JSON".
- **Every number carries its qualifier:** `low confidence`, `partial`, `insufficient data`. A direction without enough data shows no number.
- **Say what can't be verified:** "HTTP loaded responsiveness — connection sharing not verifiable". Packet loss is "Not measured", never zero.
- **Toasts are short sentences with a period:** "Summary copied.", "Result deleted."
- **Notices:** state the fact, then the reason: "Low confidence — upload: insufficient samples".
- **Destructive confirms name the count and irreversibility:** "This removes 47 results from this browser. It can't be undone."
- **Units** are a separate, smaller span; digits are tabular mono; 3 significant digits (`94.1 Mbit/s`).
- **No emoji.** No exclamation marks. Middle dot `·` separates meta ("Extended · 60 s").

## Visual foundations

- **Dark-first**, precise light theme. `data-theme="dark" | "light"` on `<html>`; "system" follows `prefers-color-scheme`.
- **Colour:** cool slate neutrals (oklch hue 255). Each hue has one meaning — teal = primary + download, violet = upload only, blue = info + latency (always dashed), green/amber/red = status and grade. Never decorative.
- **Type:** IBM Plex Sans (UI), Plex Sans Condensed (eyebrows, pills, column heads, 0.05–0.08em caps tracking), Plex Mono (every number, IP, unit, snippet; tabular). Gauge readout Mono 500 58 px; page title Sans 600 30 px.
- **Spacing:** 4 px grid with 2 px half-steps below 20. Desktop content max 1200, 40 px gutters, 20 px between sections, 16 px between tiles. Touch targets ≥ 44 px.
- **Radii:** 3 / 5 / 7 (controls) / 10 (cards) / 14 (dialogs) / full (pills, chips, switch).
- **Backgrounds:** flat token surfaces only. No imagery, gradients, textures or illustrations; the only gradient is the skeleton shimmer.
- **Elevation:** by surface lightness (`--surface-1…4`) plus 1 px hairlines. Dark cards get an inset 1 px top highlight (`--card-highlight`). Shadows only for floating layers: tooltip/toast `--shadow-md`, dialog `--shadow-pop`.
- **Cards:** `--surface-2`, 1 px `--border-subtle`, 10 px radius, optional header row with a hairline divider. No coloured left borders.
- **Tinted states:** status and selection use translucent tints (`--*-bg` ~12% alpha) with a matching `--*-border` (~32%) and a lighter `--*-fg` text.
- **Hover:** one step lighter surface (`surface-3 → 4`), primary to `--primary-hover`; ghost gains a surface. **Press:** `--primary-active` and a 0.5 px translateY. **Disabled:** 45% opacity, kept focusable with a tooltip reason when it explains something.
- **Focus:** solid 2 px `--focus-ring` with a 2 px offset on every interactive element.
- **Motion:** calm, no bounce. 120 ms hovers, 180 ms gauge tween / tile fill / page-in (4 px rise), 280 ms phase change, gauge window shift and toast slide. `--ease-out` cubic-bezier(0.22,1,0.36,1). Reduced motion removes tweening and pulsing.
- **Transparency & blur:** only the dialog scrim (`--scrim` + 2 px blur) and the glass header (`--surface-glass`).
- **Charts:** series colours as above, latency dashed on its own axis, live warm-up samples over a shaded band, Result-detail warm-up a hatched empty interval (`--chart-hatch`, ≥ 3:1), null gaps for unknown data, hairline grid in `--chart-grid`.
- **Colour is never the only signal:** grade letter, icon, label or line style always carries meaning. `--fg-faint` is non-text only.

## Iconography

- **Lucide**, outline, **1.75 px stroke**, 14–20 px, `currentColor`, round caps/joins. Production uses `@lucide/vue`; here the glyphs are bundled inline (`components/brand/Icon.jsx`), so nothing loads from a CDN.
- Common glyphs: `arrow-down` / `arrow-up` (directions), `activity` (latency), `gauge`, `circle-check`, `circle-x`, `circle-dashed` (pending), `circle-minus` (cancelled/skipped), `triangle-alert`, `info`, `wifi-off`, `copy`, `download`, `share-2`, `history`, `settings`, `timer`, `layers`, `database`, `tag`.
- No icon font, no PNG icons, **no emoji**, no unicode pictographs (only `·`, `—`, `–`, `→` as typography).
- Icons pair with text; icon-only buttons need `aria-label`.

## Logo

`assets/bitgauge-mark.svg` (colour: three gauge arcs in download teal, upload violet, dashed latency
blue; stroke colours are inline light-theme values, so it renders on its own on light grounds; on
dark grounds use the `Logo` component, which follows the theme tokens), `bitgauge-mark-mono.svg`
(`currentColor`), `favicon.svg` (two heavier arcs for 16 px in **dual-ground** mid-tones: an opaque
slate track `#7b8187`, teal `#00939a`, violet `#956ed2`, each ≥ 3:1 on white and on dark
tab strips such as `#202124` and `#35363a`, so the arcs and the track read in light and dark browser
chrome without a colour-scheme query; the asset pipeline strips embedded `<style>`, so a
`prefers-color-scheme` variant is not possible). Wordmark: "Bit" in `--fg` + "Gauge" in teal `--primary-text`, IBM Plex Sans 600,
as in the Nav and About screens. Use the `Logo` component; never redraw.

### Favicons and web manifest

The favicons, app icons and `site.webmanifest` are served from the **app's base path** (the
directory that serves `index.html`), not from an `assets/` subfolder. The manifest's `start_url`,
`scope` and `id` are `./` and its icon `src`s are bare filenames, so they resolve against the
manifest's own URL: the app root, under any base path. Head tags use relative paths for the same
reason. `favicon-16.png` and `favicon-32.png` are transparent renders of `favicon.svg` in the same
dual-ground mid-tones; the app icons (`apple-touch-icon.png`, `icon-192/512*.png`) keep their dark
tile, which carries its own ground:

```html
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="icon" href="favicon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="favicon-16.png" sizes="16x16" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
```
