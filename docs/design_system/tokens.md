# Tokens

Source: `colors_and_type.css` (tokens) and `base.css` (element defaults: body font, size **and line height**, links, focus). Theme with `data-theme="dark" | "light"` on `<html>` (dark is
`:root`'s default). Density with `data-density="compact"`.

## Colour — semantic

| Token | Role |
| --- | --- |
| `--bg-void`, `--bg-base` | App background |
| `--surface-1…4` | Panels → cards (2) → inputs/hover (3) → pressed (4) |
| `--border-subtle / -default / -strong` | Hairlines |
| `--fg`, `--fg-muted` | Primary and secondary text |
| `--fg-subtle` | Smallest allowed text: captions, placeholders, table heads, "—", pending values. Never on `--surface-4` (about 4.0:1); use `--fg-muted` there |
| `--fg-faint` | **Non-text only:** ticks, dividers, decorative icons |
| `--primary`, `-hover`, `-active`, `-fg` | Primary fill + its label |
| `--primary-text` | Teal as text: links, Edit, View, "changed", selected chips |
| `--primary-bg`, `--primary-border` | Selected state tint |
| `--focus-ring` (`--ring` alias) | Solid 2 px focus outline, 2 px offset |
| `--ok / --warn / --danger / --info` + `-fg -bg -border` | Status triads: base for icons and dots, `-fg` for text, `-bg` / `-border` for tints |
| `--danger-solid`, `--danger-solid-hover` | Destructive fills; label in `--fg-on-solid` |
| `--term-bg`, `--term-fg` | Code and snippet surface (dark in both themes) |
| `--scrim`, `--surface-glass`, `--fg-on-solid` | Overlays |

### Measurement layer

| Token | Role |
| --- | --- |
| `--series-download` | Download line, arc, legend (teal) |
| `--series-upload` | Upload line, arc, legend (violet; this is its only meaning) |
| `--series-latency` | Latency series, always **dashed** |
| `--sending` | Faint upload "sending" line (client-side progress) |
| `--chart-grid` | Chart gridlines (hairline, non-text; ≈ 1.2:1, never for marks that must be seen) |
| `--chart-hatch` | Warm-up marks: Result-detail hatch lines and the live band's edges (≥ 3:1 against `--surface-1/2`) |
| `--chart-band` | Fill of the live warm-up band (tint; its edges carry the contrast) |
| `--grade-good / -fair / -poor` | Bufferbloat grade tone: A+/A/B → good, C/D → fair, F → poor. The letter is the signal. |
| `--quality-great / -good / -average / -poor / -bad` | AIM quality bands; always with icon + label |

## Tailwind 4 mapping

```css
/* tokens.css — import styles.css (colors_and_type.css) first */
@theme inline {
  /* shadcn-vue / Reka UI semantic set — every key a library expects is mapped, so nothing falls back
     to an unstyled default or currentColor. */
  --color-background: var(--bg-base);          --color-foreground: var(--fg);
  --color-card: var(--surface-2);              --color-card-foreground: var(--fg);
  --color-popover: var(--surface-2);           --color-popover-foreground: var(--fg);
  --color-primary: var(--primary);             --color-primary-foreground: var(--primary-fg);
  --color-secondary: var(--surface-3);         --color-secondary-foreground: var(--fg);        /* = Button secondary */
  --color-muted: var(--surface-3);             --color-muted-foreground: var(--fg-muted);
  --color-accent: var(--surface-3);            --color-accent-foreground: var(--fg);           /* hover / highlighted rows, menu items */
  --color-destructive: var(--danger-solid);    --color-destructive-foreground: var(--fg-on-solid);
  --color-border: var(--border-subtle);        --color-input: var(--border-default);
  --color-ring: var(--focus-ring);             /* ring-2 ring-offset-2 */
  --color-chart-1: var(--series-download);     --color-chart-2: var(--series-upload);
  --color-chart-3: var(--series-latency);      --color-chart-4: var(--sending);
  --color-chart-5: var(--fg-subtle);
  --color-sidebar: var(--surface-1);           --color-sidebar-foreground: var(--fg);
  --color-sidebar-primary: var(--primary);     --color-sidebar-primary-foreground: var(--primary-fg);
  --color-sidebar-accent: var(--surface-3);    --color-sidebar-accent-foreground: var(--fg);
  --color-sidebar-border: var(--border-subtle); --color-sidebar-ring: var(--focus-ring);
  /* BitGauge additions */
  --color-subtle-foreground: var(--fg-subtle);
  --color-primary-text: var(--primary-text);
  --color-ok: var(--ok);   --color-ok-foreground: var(--ok-fg);   --color-ok-bg: var(--ok-bg);   --color-ok-border: var(--ok-border);
  --color-warn: var(--warn); --color-warn-foreground: var(--warn-fg); --color-warn-bg: var(--warn-bg); --color-warn-border: var(--warn-border);
  --color-danger: var(--danger); --color-danger-foreground: var(--danger-fg); --color-danger-bg: var(--danger-bg); --color-danger-border: var(--danger-border);
  --color-info: var(--info); --color-info-foreground: var(--info-fg); --color-info-bg: var(--info-bg); --color-info-border: var(--info-border);
  --color-series-download: var(--series-download);
  --color-series-upload: var(--series-upload);
  --color-series-latency: var(--series-latency);
  --color-sending: var(--sending);
  --color-chart-grid: var(--chart-grid);
  --color-chart-hatch: var(--chart-hatch); --color-chart-band: var(--chart-band);
  --color-grade-good: var(--grade-good); --color-grade-fair: var(--grade-fair); --color-grade-poor: var(--grade-poor);
  --color-quality-great: var(--quality-great); --color-quality-good: var(--quality-good);
  --color-quality-average: var(--quality-average); --color-quality-poor: var(--quality-poor);
  --color-quality-bad: var(--quality-bad);
  --color-term: var(--term-bg); --color-term-foreground: var(--term-fg);
  --radius: 7px;   /* = --radius-md. Same-named theme keys can't reference themselves, so these are literals */
  --font-sans: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --font-condensed: var(--font-cond);
  --leading-normal: var(--lh-normal);
  --leading-display: var(--lh-display);  --leading-stat: var(--lh-stat);  /* leading-none (1) is Tailwind's own = --lh-none */
  --text-pico: 9px;                    /* = --text-pico (same-named key: literal) */
  --breakpoint-desktop: 1140px;        /* = --breakpoint-desktop → `desktop:` variant. Breakpoints must be literals */
  --breakpoint-tablet: 768px;          /* = --breakpoint-tablet (also Tailwind's default md) */
  --radius-2xs: 2px;                   /* = --radius-2xs (same-named key: literal) */
  --shadow-card: inset 0 1px 0 var(--card-highlight);   /* = --shadow-card */
  --shadow-ring-danger: 0 0 0 3px var(--danger-bg);    /* = --shadow-ring-danger */
  --blur-scrim: var(--scrim-blur);
  --spacing-tooltip: var(--tooltip-gap);
  --container-error: var(--layout-error-max);
  --container-measure-xs: var(--layout-measure-xs); --container-measure-sm: var(--layout-measure-sm);
  --container-measure-md: var(--layout-measure-md);
}
/* Destructive is the solid fill (--danger-solid) so a destructive Button label meets 4.5:1;
   outline-danger text uses text-danger-foreground. --fg-faint is non-text only: no text-faint utility.
   Optical steps need no mapping: Tailwind's spacing multiplier already gives p-0.25 = 1 px, 0.75 = 3, 1.25 = 5,
   1.75 = 7 (= --space-0-25 … --space-1-75). Tailwind has no theme keys for border width, opacity or SVG strokes:
   use border-(length:--border-width-strong), opacity-(--opacity-disabled), stroke-(length:--chart-stroke). */
```

Frontend aliases also resolve: `--surface-background`, `--surface-elevated`, `--surface-muted`,
`--text-primary/-secondary/-muted/-inverse`, `--status-info/-success/-warning/-error`,
`--action-primary/-danger/-disabled`.

## Contrast — WCAG 2.2 AA

Text needs 4.5:1. Graphics, series lines, gauge arcs, status icons and dots, and the focus ring
need 3:1. Measured against `--bg-base` and `--surface-2`; tinted rows composite the translucent
`-bg` over that surface first. `--fg-subtle` is not allowed on `--surface-4` (about 4.0:1).

| Token | Use | Min | Dark · base | Dark · surface-2 | Light · base | Light · surface-2 |
| --- | --- | --- | --- | --- | --- | --- |
| `--fg` | text | 4.5 | 17.3 | 14.9 | 14.9 | 16.7 |
| `--fg-muted` | text | 4.5 | 9.5 | 8.2 | 6.6 | 7.4 |
| `--fg-subtle` | text | 4.5 | 6.2 | 5.4 | 4.9 | 5.5 |
| `--fg-faint` | non-text | 3.0 | 4.1 | 3.6 | 3.8 | 4.3 |
| `--primary-text` | text | 4.5 | 10.1 | 8.7 | 5.0 | 5.6 |
| `--primary` | fill | 3.0 | 10.1 | 8.7 | 4.6 | 5.2 |
| `--primary-fg` on `--primary` | button label | 4.5 | 10.4 | — | 5.1 | — |
| `--fg-on-solid` on `--danger-solid` | button label | 4.5 | 5.2 | — | 5.2 | — |
| `--fg-on-solid` on `--danger-solid-hover` | button label | 4.5 | 6.6 | — | 6.6 | — |
| `--focus-ring` | non-text | 3.0 | 10.1 | 8.7 | 4.6 | 5.2 |
| `--series-download` | line · arc | 3.0 | 10.1 | 8.7 | 4.6 | 5.2 |
| `--series-upload` | line · arc | 3.0 | 8.0 | 6.9 | 4.8 | 5.4 |
| `--series-latency` | line · arc | 3.0 | 8.1 | 7.0 | 4.7 | 5.3 |
| `--sending` | line | 3.0 | 4.7 | 4.1 | 3.1 | 3.5 |
| `--ok` | icon · dot | 3.0 | 9.5 | 8.2 | 3.3 | 3.7 |
| `--ok-fg` | text | 4.5 | 13.1 | 11.3 | 5.1 | 5.6 |
| `--ok-fg` on `--ok-bg` | tinted text | 4.5 | 10.6 | 8.8 | 4.5 | 5.0 |
| `--warn` | icon · dot | 3.0 | 10.5 | 9.1 | 3.4 | 3.8 |
| `--warn-fg` | text | 4.5 | 14.2 | 12.3 | 5.1 | 5.7 |
| `--warn-fg` on `--warn-bg` | tinted text | 4.5 | 11.4 | 9.4 | 4.6 | 5.1 |
| `--danger` | icon · dot | 3.0 | 6.1 | 5.3 | 3.9 | 4.4 |
| `--danger-fg` | text | 4.5 | 9.7 | 8.4 | 5.4 | 6.1 |
| `--danger-fg` on `--danger-bg` | tinted text | 4.5 | 8.4 | 7.1 | 4.8 | 5.3 |
| `--info` | icon · dot | 3.0 | 8.1 | 7.0 | 3.0 | 3.4 |
| `--info-fg` | text | 4.5 | 12.3 | 10.6 | 5.4 | 6.0 |
| `--info-fg` on `--info-bg` | tinted text | 4.5 | 10.1 | 8.4 | 4.9 | 5.4 |
| `--grade-good` | text | 4.5 | 13.1 | 11.3 | 5.1 | 5.6 |
| `--grade-fair` | text | 4.5 | 14.2 | 12.3 | 5.1 | 5.7 |
| `--grade-poor` | text | 4.5 | 9.7 | 8.4 | 5.4 | 6.1 |
| `--quality-great` | text | 4.5 | 13.1 | 11.3 | 5.5 | 6.1 |
| `--quality-good` | text | 4.5 | 12.3 | 10.6 | 5.4 | 6.1 |
| `--quality-average` | text | 4.5 | 13.4 | 11.6 | 5.5 | 6.1 |
| `--quality-poor` | text | 4.5 | 10.7 | 9.3 | 5.3 | 5.9 |
| `--quality-bad` | text | 4.5 | 9.7 | 8.4 | 5.9 | 6.6 |

## Layout and control sizes

| Token | Value | Use |
| --- | --- | --- |
| `--layout-max` | 1200 px | content column |
| `--layout-gutter` / `-compact` | 40 / 16 px | page side padding |
| `--layout-section-gap` / `-compact` | 20 / 14 px | between sections |
| `--layout-tile-gap` / `-compact` | 16 / 10 px | between tiles |
| `--layout-rail`, `--layout-instrument` | 340, 400 px | side rail; Test gauge column |
| `--control-h-sm / -md / -lg / -xl` | 28 / 34 / 38 / 46 px | Button sizes (xl = Start/Stop) |
| `--control-h-touch`, `--control-h-touch-xl` | 44, 52 px | touch minimum; Start/Stop compact |
| `--input-h`, `--pill-h`, `--pill-h-sm`, `--chip-h`, `--chip-h-sm`, `--tab-h` | 36, 22, 20, 30, 24, 36 px | |
| `--header-h` / `-compact`, `--tabbar-h` | 56 / 52, 64 px | AppHeader, TabBar |
| `--modal-w`, `--modal-w-wide`, `--start-w` | 452, 540, 248 px | Dialog; StartButton min width |
| `--modal-max-w`, `--modal-icon` | 92vw, 36 px | Dialog max width on narrow viewports; Dialog icon box |
| `--layout-text-basis` | 220 px | flex basis of a wrapping text body: Notice body, SaveBar message |
| `--layout-input-basis`, `--layout-input-max` | 200, 340 px | SaveBar label field |
| `--layout-grade-basis`, `--layout-grade-max`, `--layout-load-basis` | 172, 220, 260 px | LoadCard grade column; latency rows |
| `--layout-error-max`, `--layout-error-min-h` / `-compact` | 600, 760 / 720 px | FullScreenError column and height |
| `--layout-measure-xs / -sm / -md` | 180 / 300 / 420 px | text measure: Gauge state message, Chart empty message, EmptyState message |
| `--control-h-item` | 32 px | menu items, nav links, Segmented options, Checkbox rows |
| `--list-row-h` | 36 px | MetaList / QualityList row minimum |
| `--menu-w`, `--toast-w` | 212, 380 px | Menu popup; Toast |
| `--check-size` | 16 px | Checkbox box, ChoiceCard radio |
| `--switch-w`, `--switch-h`, `--switch-knob` | 42, 24, 18 px | Switch (knob travel is computed from these) |
| `--dot-size`, `--dot-size-lg` | 6, 7 px | status dots; header server dot and offline pill dot |
| `--progress-h`, `--indicator-h` | 4, 2 px | PhaseStep bar; Tabs underline and TabBar indicator |
| `--tab-indicator-inset` | 28 % | TabBar indicator inset from each side of its tab |
| `--tile-value-h`, `--tile-qualifier-h` | 34, 15 px | MetricTile word-value line ( "warming up"); qualifier line minimum |
| `--grade-size`, `--grade-size-sm`, `--grade-cell` | 52, 30, 17 px | GradeBadge; small GradeBadge (no longer used by SharePreview); scale strip cell |
| `--empty-glyph` | 46 px | EmptyState glyph box |
| `--share-aspect` | 1200 / 630 | SharePreview |
| `--share-w`, `--share-h`, `--share-scale` | 480, 252 px; 2.5 | Share image reference box; × 2.5 = the 1200 × 630 PNG |
| `--share-pad-y`, `--share-pad-x`, `--share-header-h` | space-3-5, space-4, 20 px | Share image padding; logo row |
| `--share-gap-min`, `--share-label-h`, `--share-block-w` | space-2-5 (10 px), 14, 171 px | Share image: least gap around the middle group; label row; column width |
| `--share-grade-size`, `--share-grade-w` | 48, 74 px | Share image grade tile; grade column |
| `--share-server-max` | 224 px | Share image server name before its ellipsis |
| `--term-comment`, `--term-command`, `--term-muted` | slate-5, teal-5, slate-3 | Snippet syntax on `--term-bg` |

## Type

| Role | Spec |
| --- | --- |
| Gauge readout | Plex Mono 500 · 58 / 46 (mobile) · −0.03em |
| Metric value | Plex Mono 500 · 30 / 24 · −0.02em |
| Page title | Plex Sans 600 · 30 / 24 · −0.01em |
| State title | Plex Sans 600 · 26 / 22 |
| Section title | Plex Sans 600 · 14–16 |
| Body | Plex Sans 400 · 13–14 · 1.5 |
| Eyebrow | Plex Sans Condensed 600 · 11 · caps · 0.08em |
| Data / meta | Plex Mono 400 · 11–13 · tabular |

Scale tokens: `--text-nano` 10 … `--text-6xl` 48. Weights 400/500/600/700.
Role tokens: `--type-gauge-readout` 58 / `-compact` 46, `--type-metric-value` 30 / 24,
`--type-page-title` 30 / 24, `--type-state-title` 26 / 22; tracking `--tracking-readout` −0.03em,
`--tracking-metric` −0.02em. Line heights: `--lh-tight` 1.15 · `--lh-snug` 1.3 · `--lh-compact` 1.45 ·
`--lh-normal` 1.5 (body default, set in `base.css`) · `--lh-prose` 1.55 · `--lh-relaxed` 1.65 · `--lh-none` 1 (pills,
badges) · `--lh-display` 1.05 (gauge readout) · `--lh-stat` 22 px (Stat value row). `--text-pico` 9 px (grade strip,
share-image meta); share image (480 × 252 box, × 2.5 in the PNG) `--type-share-value` 48, `--type-share-label` 12, `--type-share-unit` 16,
`--type-share-qual` 10, `--type-share-meta` 10, `--type-share-head` 11, `--type-share-grade` 26.

## Breakpoints

- `--breakpoint-desktop` 1140 px: desktop layout from here; below it the `-compact` tokens apply (compact header,
  TabBar, compact gutters). `--breakpoint-tablet` 768 px: Table `.flip` turns into a card list below it.
- Media queries can't read custom properties, so an `@media` rule repeats the literal with a comment naming the token
  (`max-width: 1139px` = below `--breakpoint-desktop`); scripts read the token with `getComputedStyle`.

## Lines, focus, opacity

- `--border-width` 1 px (every hairline) · `--border-width-strong` 1.5 px (hollow dots, Checkbox and radio boxes).
- Focus: `--focus-width` 2 px solid `--focus-ring`, `--focus-offset` 2 px (inset rings use `calc(-1 * var(--focus-offset))`).
- `--underline-offset` 2 px (link hover) · `--radius-2xs` 2 px (progress bar, TabBar indicator).
- `--opacity-disabled` 0.45 · `--opacity-hint` 0.8 (keyboard hint, chip count) · `--scrim-blur` 2 px.
- Shadows: `--shadow-card` = `inset 0 1px 0 var(--card-highlight)` (Card top edge; transparent in light) ·
  `--shadow-ring-danger` = `0 0 0 3px var(--danger-bg)` (invalid field, focused).

## Charts (non-colour)

Strokes `--chart-stroke` 1 (grid, edges, separators, now line) · `--chart-stroke-latency` 1.25 · `--chart-stroke-mark` 1.5;
dashes `--chart-dash-sep` 2 3 · `--chart-dash-latency` 4 3 · `--chart-dash-mark` 3 3; steady window
`--chart-window-fill` 0.08 / `--chart-window-stroke` 0.4; `--chart-latency-opacity` 0.9, `--chart-now-opacity` 0.5;
warm-up hatch `--chart-hatch-angle` 135deg, `--chart-hatch-pitch` 6 px; phase / mark labels `--chart-label-gap` 6 px from their line, rows `--chart-label-row` 12 px apart; label anchors `--chart-label-anchor` −75 %,
`--gauge-tick-anchor` −80 %; legend `--legend-swatch-w` 14 × `--legend-swatch-h` 10 px, `--legend-band-w` 12 px,
`--legend-stroke` 2 px.

## Number formatting

3 significant digits, unit steps at ×1000: `9.4 kbit/s`, `640 kbit/s`, `1.25 Mbit/s`, `94.1 Mbit/s`,
`9.41 Gbit/s`; bytes mode ÷ 8 (`117 MB/s`). Latency: `< 1 ms` below timer resolution, one decimal
under 10 ms, whole ms from 10 ms. Durations: `24.6 s`, `1 m 12 s`, `42:18` (Continuous). The unit is
always a separate, smaller span. Tabular numbers everywhere.

## Spacing, radius, motion, z

- Spacing: 4 px grid, `--space-0-5` (2) … `--space-20` (80); half-steps below 20 px. Optical steps off the grid,
  for 1 px alignment nudges and tight icon-to-text gaps only: `--space-0-25` 1 · `--space-0-75` 3 · `--space-1-25` 5 ·
  `--space-1-75` 7. `--tooltip-gap` (= `--space-1-75`) between a Tooltip and its control.
  Desktop: content max 1200 px, 40 px gutters, 20 px between sections, 16 px between tiles.
  Mobile (below `--breakpoint-desktop`): 16 px gutters, 10–14 px gaps. Touch targets ≥ 44 px; Start/Stop 52 px on mobile.
- Motion: `--dur-fast` 120 · `--dur-base` 180 (gauge sample, tile fill-in) · `--dur-slow` 280
  (phase change, window shift) · `--dur-shimmer` 1.4 s (Skeleton loop); `--ease-out`, `--ease-standard`. Entrances:
  `--enter-shift-sm` 4 px (page content), `--enter-shift-md` 6 px + `--enter-scale` 0.99 (Dialog), `--enter-shift-lg`
  10 px (Toast); `--press-shift` 0.5 px (Button pressed). Reduced motion: no tweening, no pulsing.
- Radius: 2xs 2 · xs 3 · sm 5 · md 7 (controls) · lg 10 (cards) · xl 14 (dialogs) · full (pills, dots).
- Kit Demo panel only (prototype scaffolding, not product UI): `--demo-w` 300, `--demo-w-compact` 320,
  `--demo-row-basis` 160 px, `--demo-max-h` `calc(100vh - 20px)`.
- Z: sticky 20 · tooltip 30 · popover 40 · overlay 50 · toast 60 · nav 80 · skip-link 100.
