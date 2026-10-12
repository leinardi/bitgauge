# Tokens

Source: `colors_and_type.css`. Theme with `data-theme="dark" | "light"` on `<html>` (dark is
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
| `--chart-grid` | Chart gridlines (hairline, non-text) |
| `--grade-good / -fair / -poor` | Bufferbloat grade tone: A+/A/B → good, C/D → fair, F → poor. The letter is the signal. |
| `--quality-great / -good / -average / -poor / -bad` | AIM quality bands; always with icon + label |

## Tailwind 4 mapping

```css
/* tokens.css — import colors_and_type.css first */
@theme inline {
  --color-background: var(--bg-base);  --color-foreground: var(--fg);
  --color-card: var(--surface-2);      --color-muted: var(--surface-3);
  --color-muted-foreground: var(--fg-muted);
  --color-subtle-foreground: var(--fg-subtle);
  --color-border: var(--border-subtle); --color-input: var(--border-default);
  --color-primary: var(--primary);     --color-primary-foreground: var(--primary-fg);
  --color-primary-text: var(--primary-text);
  --color-destructive: var(--danger);
  --color-ring: var(--focus-ring);     /* ring-2 ring-offset-2 */
  --color-series-download: var(--series-download);
  --color-series-upload: var(--series-upload);
  --color-series-latency: var(--series-latency);
  --color-sending: var(--sending);
  --color-chart-grid: var(--chart-grid);
  --color-grade-good: var(--grade-good); --color-grade-fair: var(--grade-fair); --color-grade-poor: var(--grade-poor);
  --color-quality-great: var(--quality-great); --color-quality-good: var(--quality-good);
  --color-quality-average: var(--quality-average); --color-quality-poor: var(--quality-poor);
  --color-quality-bad: var(--quality-bad);
  --radius: 7px;
  --font-sans: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
}
/* --fg-faint is non-text only: no text-faint utility. */
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

## Number formatting

3 significant digits, unit steps at ×1000: `9.4 kbit/s`, `640 kbit/s`, `1.25 Mbit/s`, `94.1 Mbit/s`,
`9.41 Gbit/s`; bytes mode ÷ 8 (`117 MB/s`). Latency: `< 1 ms` below timer resolution, one decimal
under 10 ms, whole ms from 10 ms. Durations: `24.6 s`, `1 m 12 s`, `42:18` (Continuous). The unit is
always a separate, smaller span. Tabular numbers everywhere.

## Spacing, radius, motion, z

- Spacing: 4 px grid, `--space-0-5` (2) … `--space-20` (80); half-steps below 20 px.
  Desktop: content max 1200 px, 40 px gutters, 20 px between sections, 16 px between tiles.
  Mobile: 16 px gutters, 10–14 px gaps. Touch targets ≥ 44 px; Start/Stop 52 px on mobile.
- Radius: xs 3 · sm 5 · md 7 (controls) · lg 10 (cards) · xl 14 (dialogs) · full (pills).
- Motion: `--dur-fast` 120 · `--dur-base` 180 (gauge sample, tile fill-in) · `--dur-slow` 280
  (phase change, window shift); `--ease-out`, `--ease-standard`. Menus/dialogs fade with a 4 px
  translate. Reduced motion: no tweening, no pulsing.
- Z: sticky 20 · tooltip 30 · popover 40 · overlay 50 · toast 60 · nav 80 · skip-link 100.
