# BitGauge Design System

> An honest, self-hosted speed test for LAN, homelab and VPN links.

The visual language, tokens, React components, UI kit and product spec for the BitGauge web UI. It
stands on its own — no external design-system dependency.

**Source:** built from the BitGauge design project (claude.ai/design/p/0146424e-80b6-4396-910f-aa2d30693359),
which was itself DS-ready. No Figma file or code repository was provided.

Production stack: **Vue 3 + Vite + TypeScript + Tailwind 4 + shadcn-vue (Reka UI)**, uPlot for charts,
`lucide-vue-next` for icons, `vue-sonner` for toasts. The React components here are design-time
recreations for prototyping; the Tailwind mapping is in `tokens.md`.

## Product context

One product surface: the **BitGauge web UI**, a single-page app served by a self-hosted speed-test
server. Screens: **Test** (live gauge, throughput chart, phase indicator, metric tiles, bufferbloat
load card, quality list, save bar), **Result detail**, **History** (table, filters, trends, compare),
**Settings** (presets, streams, cap, units, theme, language) and **About / Other clients** (CLI
snippets). Full spec in `features/`.

## Index

| Path | What it is |
| --- | --- |
| `styles.css` | Entry point — `@import`s tokens + kit CSS. Link this one file. |
| `colors_and_type.css` | All tokens: self-hosted IBM Plex `@font-face`, primitives, semantic tokens (dark + light), measurement layer, type, spacing, radii, motion, z. |
| `tokens.md` | Token reference, Tailwind 4 mapping, WCAG contrast table, number formatting. |
| `components/<group>/` | React components (`.jsx` + `.d.ts` + `.prompt.md`) and one `*.card.html` per group. |
| `components/*.md` | Behaviour contracts: `gauge`, `charts`, `tiles`, `notices`, `phase-indicator`, `save-bar`, `share-panel`. |
| `ui_kits/app/` | Clickable prototype of the web UI (`index.html`) + kit CSS (`app.css`, `buttons.css`, `badges.css`, `inputs.css`, `surfaces.css`, `tables.css`, `dialog.css`) and `bg-lib.js`. |
| `preview/` | Foundation cards: colours, type, spacing, radii, logo, app icons. |
| `assets/` | Logo marks, favicons, app icons, webmanifest, `fonts/` (IBM Plex woff2, SIL OFL 1.1). |
| `features/` | Product spec: `product.md`, `principles.md`, `ui/` (screens, flows, url-params, i18n-a11y). The spec decides content and behaviour. |
| `explorations/` | Logo explorations (history of the mark). |
| `SKILL.md` | Agent-Skills entry point. |

## Components

All exported on the bundle namespace; styles come from `styles.css` classes + tokens.

- **brand/** — `Icon` (+ `ICON_NAMES`), `Logo`
- **actions/** — `Button`, `Tooltip`
- **status/** — `StatusPill`, `StatusBadge`, `Chip`
- **feedback/** — `Notice`, `Toast`, `EmptyState`, `Skeleton`, `SkeletonRows`
- **forms/** — `Input`, `Segmented`, `Switch`, `Toggle`
- **layout/** — `Card`, `Tabs`, `Table`
- **dialog/** — `Dialog`
- **gauge/** — `Gauge`
- **measurement/** — `MetricTile`, `PhaseStep`

The inventory follows the kit's CSS families and the component contracts. Charts (uPlot), the
share image, save bar and share panel live in the UI kit only (see `components/*.md`).

### Intentional additions
- `Icon` — React wrapper over the kit's bundled Lucide glyph map (`<bg-icon>` in the kit).
- `Logo` — React wrapper over the kit's `<bg-logo>` element.

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
- **Notices:** title states the fact ("Low confidence result"), detail says why with numbers ("Upload collected 18 samples; 30 are recommended.").
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
- **Charts:** series colours as above, latency dashed on its own axis, null gaps for unknown data, hairline grid in `--fg-faint`.
- **Colour is never the only signal:** grade letter, icon, label or line style always carries meaning. `--fg-faint` is non-text only.

## Iconography

- **Lucide**, outline, **1.75 px stroke**, 14–20 px, `currentColor`, round caps/joins. Production uses `lucide-vue-next`; here the glyphs are bundled inline (`components/brand/Icon.jsx`, kit `bg-lib.js` → `<bg-icon>`), so nothing loads from a CDN.
- Common glyphs: `arrow-down` / `arrow-up` (directions), `activity` (latency), `gauge`, `circle-check`, `circle-x`, `circle-dashed` (pending), `circle-minus` (cancelled/skipped), `triangle-alert`, `info`, `wifi-off`, `copy`, `download`, `share-2`, `history`, `settings`, `timer`, `layers`, `database`, `tag`.
- No icon font, no PNG icons, **no emoji**, no unicode pictographs (only `·`, `—`, `–`, `→` as typography).
- Icons pair with text; icon-only buttons need `aria-label`.

## Logo

`assets/bitgauge-mark.svg` (colour: three gauge arcs in download teal, upload violet, dashed latency
blue), `bitgauge-mark-mono.svg` (`currentColor`), `favicon.svg` (two heavier arcs for 16 px).
Wordmark: "BitGauge" in IBM Plex Sans 600. Use the `Logo` component; never redraw.
