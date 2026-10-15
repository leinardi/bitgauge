# Changelog — atomic-design structure audit (2026-10-14)

Layering after this change: **tokens** (`colors_and_type.css`) → **base** (`base.css`) → **components**
(`components/<group>/` .jsx + .d.ts + group CSS, contracts in `components/*.md`) → **templates** (page shell
`.page`, `FullScreenError`, `AppHeader`/`TabBar`) → **screens** (`ui_kits/app/`, a consumer). `features/` was
read as the source of truth and not edited.

Decision rule used where layers disagreed: `features/` wins on behaviour and copy; otherwise the lower layer
wins (component contract → component → kit). Where the kit needed something a component could not express,
a variant was added to the component instead of styling it locally.

## Inventory (by layer)

- **Tokens:** colour primitives + semantic (dark/light), measurement, type scale, spacing, radii, motion, z.
  Missing before: line-height usage at body level, type-role tokens, layout tokens, control sizes, terminal
  syntax colours. Kit screens referenced primitives directly (`--slate-*`, `--teal-5`).
- **Base:** did not exist. Body had font size but no line height; reset, links, focus, `.sr-only` and reduced
  motion lived in the kit's `app.css` / `kit.css`.
- **Components:** 22 components whose looks were defined in the **kit's** CSS (`ui_kits/app/buttons.css`,
  `badges.css`, `inputs.css`, `surfaces.css`, `tables.css`, `dialog.css`, `app.css`), plus inline styles in
  the .jsx. No component for: start control, link, menu, live region, save bar, full-screen error, phase
  indicator, load card, quality list, not-measured slot, share preview, chart, header/tab bar, meta list,
  snippet, number formatting.
- **Screens:** `TestScreen` hand-rolled notices, phase list, gauge, chart, tiles, load card, quality list,
  meta card, save bar, toast, share dialog and base-path page (~250 inline style objects, 139 raw px).
  `bg-lib.js` duplicated `Icon` (`<bg-icon>`), `Logo` (`<bg-logo>`), the gauge geometry and formatting.
  The kit's `App.jsx` mounted itself at load — and the bundle sweeps kit files in, so **every component card
  mounted the whole prototype into its own `#root`**.

## What moved where

- `ui_kits/app/{buttons,badges,inputs,surfaces,tables,dialog,app}.css` → deleted. Their rules now live once in
  `components/{actions,status,forms,layout,feedback,dialog,measurement,gauge,charts,navigation}/*.css`, imported
  by `components/components.css`. `styles.css` is now `@import`s only: tokens → base → components.
- Reset, body type, links, focus ring, selection, scrollbars, reduced motion, `.sr-only` → `base.css`.
- `kit.css` → Demo panel only (removed its `a` colours, page reset and `hv-*` `!important` hover hacks).
- `bg-lib.js` → `fixtures.js` (kit-only `window.BG`): sample server (`KIT`), synthetic series, gauge window
  replay, grade/AIM tables. Removed `<bg-icon>`, `<bg-logo>`, gauge geometry; formatting delegates to
  `DS.Format`; grades/quality labels come from `DS.GRADES` / `DS.QUALITY`.
- Kit wiring: `index.html` links `../../styles.css` + the bundle; `ds.js` exposes components as `window.DS`
  (falls back to compiling the same component sources when the bundle is older than them); the app mounts
  from `index.html` after DS is ready, not from `App.jsx`.
- `Nav.jsx` → thin adapter over `DS.AppHeader` / `DS.TabBar`.
- `TestScreen` render now composes only DS components: `FullScreenError`, `LiveRegion`, `Stat`, `Menu`,
  `Chip`, `Link`, `Notice`, `Card`, `PhaseIndicator`, `Gauge`, `StartButton`, `Chart`, `SaveBar`, `Tooltip`,
  `MetricTile`, `LoadCard`, `QualityList`, `MetaList` + `NotMeasured`, `LastResult`, `ToastRegion`/`Toast`,
  `Dialog` + `SharePreview` + `Snippet`. Remaining inline styles are layout only, in tokens.
- `About` rewritten on `Notice`, `Card`, `StatusPill`, `Snippet`, `MetaList`, `Logo`, `Link`, `Button`.
- All screens: `<bg-icon>`/`<bg-logo>` → `DS.Icon`/`DS.Logo`; static `.btn` buttons → `DS.Button`; dot pills →
  `DS.StatusPill`; eyebrow style copies → `.ds-eyebrow`; literal font sizes, weights, line heights, tracking,
  `1200px` and on-scale spacing → tokens (≈ 500 replacements). History notices, toast, empty states and
  Result-detail notices / packet-loss slot → components.

## Tokens added

- Line heights: `--lh-compact` 1.45, `--lh-prose` 1.55 (body default `--lh-normal` set in `base.css`).
- Type roles: `--type-gauge-readout(-compact)` 58/46, `--type-metric-value(-compact)` 30/24,
  `--type-page-title(-compact)` 30/24, `--type-state-title(-compact)` 26/22; `--tracking-readout`,
  `--tracking-metric`.
- Layout: `--layout-max`, `--layout-gutter(-compact)`, `--layout-section-gap(-compact)`,
  `--layout-tile-gap(-compact)`, `--layout-rail`, `--layout-instrument`.
- Controls: `--control-h-sm/md/lg/xl`, `--control-h-touch`, `--control-h-touch-xl`, `--input-h`, `--pill-h(-sm)`,
  `--chip-h(-sm)`, `--tab-h`, `--header-h(-compact)`, `--tabbar-h`, `--modal-w`, `--start-w`.
- Terminal syntax: `--term-comment`, `--term-command`, `--term-muted` (replace primitives in About).
- `tokens.md` Tailwind mapping now covers the full shadcn-vue set: `card/popover-foreground`, `secondary(-foreground)`,
  `accent(-foreground)`, `destructive-foreground`, `chart-1…5`, `sidebar-*`, status triads, `term`; fixed
  `.ds-eyebrow` to the documented 11 px.

## Components and variants added

- New: `StartButton`, `Link`, `Menu`, `LiveRegion`, `SaveBar`, `FullScreenError`, `ToastRegion`, `MetaList`, `Stat`,
  `Snippet`, `Chart`, `Format`, `PhaseIndicator`, `LoadCard`, `GradeBadge`, `QualityList`, `NotMeasured`,
  `SharePreview`, `LastResult`, `AppHeader`, `TabBar`.
- `Button`: size `xl`, `block`, `touch`, `href`, `iconAfter`, `tipAlign`. `Notice`: tone `neutral`, `live`.
  `Gauge`: `state` (idle, connecting, countdown, live, cancelled, error, offline), `compact`, `note`,
  `innerLabel`, `captionNote`, countdown props. `MetricTile`: `icon`, states `warming-up`/`skipped`, state pill,
  `tag`, `notes`, `compact` (dropped `incomplete`). `PhaseStep`: `stacked`, default name "Idle latency".
  `StatusPill`: `size="sm"`, `dot`, `dashed`. `StatusBadge`: `size`. `Chip`: `size="sm"`, `changed`.
  `Segmented`: icon-only options, `block`. `Card`: `as`, `label`, `clip`. `Dialog`: `body`, `onClose` button,
  `footerStack`, `align`. `Toast`: `onDismiss`. `Logo`: `wordmarkSize`, `href`.

## Contract rules added (each in one place)

- **Button / StartButton:** a keyboard hint is never part of the accessible name (`aria-hidden` +
  `aria-keyshortcuts`); desktop only. `disabledReason` is linked with `aria-describedby`.
- **Menu (navigation.md):** trigger named "<purpose>: <value>[, <hint>]", `aria-haspopup`/`aria-expanded`,
  `menuitemradio` rows, Escape returns focus.
- **LiveRegion (gauge.md, navigation.md):** exactly one per screen, direct child of `<main>`; the Gauge
  renders none; the header announces only status changes.
- **Chart (charts.md):** `role="img"` label is a data summary, never a static title; `summary` is required.
- **Notice (notices.md):** danger `role="alert"`, others `role="status"`; neutral surface defined; error tone
  follows what failed.
- **AppHeader (navigation.md):** server name from props only; `null` when unknown → host + "Unreachable".
  Navigation items come from one version scope.
- **Version scope:** one `caps` object in the Prototype drives nav (v0.1: Test, About), Edit link, save bar,
  share, load/grade/quality, "Not available in this version" for /history, /settings, /result, and About's
  v0.3 layers + v0.1 methodology.
- **Phase indicator:** meta is always "<state> · <detail>"; capped only for the data cap.
- **Tiles:** states = direction statuses + live states; error qualifier always "error · …"; warming-up shows
  no number.

## Kit ↔ contract disagreements fixed

- Phase list: own markup and wording ("Error at 6.4 s", "Not run", "Cancelled at …", numbered pending dots,
  "Latency") → `PhaseIndicator` with contract wording ("failed · interrupted at 6.4 s", "skipped",
  "cancelled · 3.1 s", `circle-dashed`, "Idle latency").
- Error tile text "3 requests in a row failed" → "error · 3 requests in a row failed" in `--danger-fg`.
- Live tiles showed the current rate during warm-up → "warming up", then steady-window average + peak
  (screens.md §1, measurement.md §14).
- Gauge states were ad hoc (Ready / Connecting / Connection lost / Cancelled …) → the contract's state table.
- Insufficient-data download was shown as `capped` → `done · insufficient data` (capped = data cap).
- Skipped directions said "not run" → "skipped" (direction status).
- Error notices for "server restarted" / "network changed" were danger → neutral (screens.md §7).
- About "Server unreachable" was warn → danger + `role="alert"` (screens.md §7).
- Header fell back to "Basement NAS" / "speed.home.lan" and showed the name while `/info` failed → props only.
- v0.1 switch hid History only → also Settings, Edit link, share, routes, About layers (screens.md §1, §5).
- Base-path heading 28/22 px raw → `--type-state-title` 26/22.

## Visual changes (deliberate, from "lower layer wins")

Notice body 13 → 12 px and title in `--fg`; neutral notices on `--surface-3`; kbd hint unboxed; "Not measured"
is the condensed-caps dashed StatusBadge; all text links semibold; tile units mono 12 px; tile pills 20 px;
gauge 316/272 → 300/272 px with its sub-line under the caption; phase bar 4 px below the name; snapped
off-scale spacing (28 → 24 px instrument padding, 9 → 8 px fact rows).

## Second pass (2026-10-14): Result detail, History, Settings

- **Result detail:** per-phase charts → new `PhaseChart` (null gaps, hatched warm-up, event chips, Chart / Table
  toggle, summary label; geometry shared with `Chart` via `chartGeometry`); share image → `SharePreview` (now
  with an optional grade tile, also passed on the Test screen); tiles → `MetricTile` (Continuous upload is
  `skipped`, not "not measured"); load card → `LoadCard`; quality + packet loss → `QualityList packetLoss`;
  history-unavailable and clipboard-denied banners → `Notice` (new `attached` variant); cards → `Card`.
- **History:** export menu and date range → new `Popover` + `OptionRows`; compare dialog → `Dialog size="xl" flush`;
  clear-all confirm → `Dialog` (stacked touch footer on narrow layouts); notices, toast, empty states, skeletons,
  search / date inputs, metric `Segmented`, pills and cards → components.
- **Settings:** six segmented groups → `Segmented` (new per-option `color`); selects → new `Select`; numeric fields
  → `Input` (new `suffix`) + new `FieldError`; switches → `Switch`; phase toggles and "include run=1" → new
  `Checkbox`; preset cards → new `ChoiceCard`; "changed" markers → new `ChangedMark`; Advanced → `.disclosure`
  header; reset / keep-durations dialogs → `Dialog`; cards → `Card`. Inputs are 36 px (`--input-h`) instead of 34.
- Tokens: `--modal-w-xl` 760. Dialog: `aria-describedby` on its description, `size`, `flush`.

## Remaining (small, kit-only)

- History's narrow-layout compare is a full-screen sheet built in the screen (no `Dialog` sheet variant yet).
- The Demo state panel (`App.jsx`, kit-only scaffolding) uses `.btn` / `.seg` / `.input` classes directly.
- `fixtures.js` still carries `BG.chart` geometry used by Result detail's `mk()` for its table windows; the
  drawing itself is `PhaseChart`.
- Screens keep layout-only inline styles (grid tracks, paddings) in tokens; a few fixed widths remain
  (`width: "84px"` fields, 320 / 690 px chart widths in Result detail).

## Open questions — resolved

1. A phase that reaches its maximum without a value → `done · insufficient data`; `capped` is only the data cap (screens.md §1).
2. Start control labels "Start test", "Stop test", "Run again", "Retry test", "Start now" — now stated in screens.md §1.
3. The Error state's message is always danger with `role="alert"` (screens.md §7, revised); the kit no longer
   downgrades it to neutral for "server restarted" / "network changed" — those now appear as an additional neutral
   notice. cpu-bound → warn (a low-confidence reason).
4. "Connecting…" on the first phase step and in the gauge readout during the info phase (screens.md §1 states table).

## Open questions — still open

5. Whether the History origin note and the import progress / result are notices (no spec tone) — rendered as info /
   neutral / ok Notices.
6. ~~Narrow layout threshold~~ — resolved in the fifth pass: `--breakpoint-desktop` 1140 px.

## Third pass (2026-10-14): Error state vs features/ui/screens.md §7

- Bug: the Test screen's notice builder dropped `tone`, so every Test-screen notice rendered as info (no danger
  surface, no `role="alert"`). It now passes the tone; Notice decides surface and role.
- The Error state's message is always danger (`role="alert"`). Cause notices for server restarted / network changed
  (neutral) use edge-cases.md §11 / §6 wording.
- New kit state `upload-interrupted`: per flows.md §1 and measurement.md §7.5 it is **not** an Error state — the run
  completes, upload reports the window up to the failure, and the danger notice "Upload interrupted by a failed request"
  carries the HTTP/2 hint.
- Server restarted no longer shows the header as unreachable (the server is back).
- Icon: added Lucide `network` (the network-changed glyph rendered empty).

## Fourth pass (2026-10-14): foundation previews and explorations

- All 13 `preview/*.html` cards and `explorations/Logo Explorations.dc.html` linked the deleted
  `ui_kits/app/app.css` and loaded the deleted `bg-lib.js`. They now link `styles.css` (tokens → base → components);
  `preview/card.css` keeps only card layout helpers (`.row`, `.col`, `.lbl`, `.tok`, `.mono`, `.subtle`).
- `<bg-logo>` / `<bg-icon>` → `<span data-ds="Logo" …>` / `<span data-ds="Icon" …>`, rendered from the bundle's
  `Logo` / `Icon` by a small inline script in each page that uses them (no Babel, no extra file).
  The exploration page uses the DC runtime's React (loading a second React broke it).
- `Logo variant="mono"` now inherits `currentColor` from its parent (it was forced to `--fg`).
- `NotMeasured` CSS class `.nm` → `.notmeasured` (a global two-letter class collided with card helpers).
- Removed the leftover `bg-lib-ready` listeners in History / Result detail and the kit's `screenshots/` captures.

## Fifth pass (2026-10-15): remaining literals, contract fixes

No visual value changed: every token holds the literal it replaces. `features/` was read, not edited.

### Tokens added (`colors_and_type.css`, documented in `tokens.md`)

- Breakpoints: `--breakpoint-desktop` 1140px, `--breakpoint-tablet` 768px. `@media` rules can't read custom
  properties, so `kit.css` (1139px) and `layout.css` (768px) keep the literal with a comment naming the token;
  `Prototype.jsx` now reads `--breakpoint-desktop` instead of `DESKTOP_MIN = 1140`.
- Line heights: `--lh-none` 1, `--lh-display` 1.05, `--lh-stat` 22px.
- Type: `--text-pico` 9px, `--type-share-value` 26px, `--type-share-label` 8px.
- Spacing (optical steps): `--space-0-25` 1px, `--space-0-75` 3px, `--space-1-25` 5px, `--space-1-75` 7px;
  `--tooltip-gap` var(--space-1-75) = 7px.
- Layout: `--layout-text-basis` 220px, `--layout-input-basis` 200px, `--layout-input-max` 340px,
  `--layout-grade-basis` 172px, `--layout-grade-max` 220px, `--layout-load-basis` 260px, `--layout-error-max` 600px,
  `--layout-error-min-h` 760px, `--layout-error-min-h-compact` 720px, `--layout-measure-xs` 180px,
  `--layout-measure-sm` 300px, `--layout-measure-md` 420px.
- Sizes: `--control-h-item` 32px, `--list-row-h` 36px, `--menu-w` 212px, `--toast-w` 380px, `--check-size` 16px,
  `--switch-w` 42px, `--switch-h` 24px, `--switch-knob` 18px, `--dot-size` 6px, `--dot-size-lg` 7px, `--progress-h` 4px,
  `--indicator-h` 2px, `--tab-indicator-inset` 28%, `--tile-value-h` 34px, `--tile-qualifier-h` 15px, `--grade-size` 52px,
  `--grade-size-sm` 30px, `--grade-cell` 17px, `--empty-glyph` 46px, `--modal-icon` 36px, `--modal-max-w` 92vw,
  `--share-aspect` 1200 / 630.
- Lines and focus: `--border-width` 1px, `--border-width-strong` 1.5px, `--focus-width` 2px, `--focus-offset` 2px,
  `--underline-offset` 2px, `--radius-2xs` 2px.
- Opacity and overlay: `--opacity-disabled` 0.45, `--opacity-hint` 0.8, `--scrim-blur` 2px.
- Shadows: `--shadow-card` inset 0 1px 0 var(--card-highlight), `--shadow-ring-danger` 0 0 0 3px var(--danger-bg).
- Motion: `--dur-shimmer` 1.4s, `--press-shift` 0.5px, `--enter-shift-sm` 4px, `--enter-shift-md` 6px,
  `--enter-shift-lg` 10px, `--enter-scale` 0.99.
- Charts: `--chart-stroke` 1, `--chart-stroke-latency` 1.25, `--chart-stroke-mark` 1.5, `--chart-dash-sep` 2 3,
  `--chart-dash-latency` 4 3, `--chart-dash-mark` 3 3, `--chart-window-fill` 0.08, `--chart-window-stroke` 0.4,
  `--chart-latency-opacity` 0.9, `--chart-now-opacity` 0.5, `--chart-hatch-angle` 135deg, `--chart-hatch-pitch` 6px,
  `--chart-label-anchor` -75%, `--gauge-tick-anchor` -80%, `--legend-swatch-w` 14px, `--legend-swatch-h` 10px,
  `--legend-band-w` 12px, `--legend-stroke` 2px.
- Kit Demo panel only: `--demo-w` 300px, `--demo-w-compact` 320px, `--demo-row-basis` 160px,
  `--demo-max-h` calc(100vh - 2 × var(--space-2-5)) = calc(100vh - 20px).
- Tailwind mapping (tokens.md) gains `--breakpoint-desktop/-tablet`, `--leading-display/-stat`, `--text-pico`,
  `--radius-2xs`, `--shadow-card`, `--shadow-ring-danger`, `--blur-scrim`, `--spacing-tooltip`, `--container-error`,
  `--container-measure-xs/-sm/-md`.

On-scale literals now use existing tokens: `.optrows .menu-item` 34px → `--control-h-md`, `.tile-h` 20px →
`--pill-h-sm`, `.hdr-sep` 20px → `--space-5`, `.optrows .ck` and the Demo checkbox 14px → `--space-3-5`, Demo
paddings/offsets → `--space-*`, closed Demo button 30px → `--chip-h`, `border-radius: 50%` → `--radius-full`,
`letter-spacing: 0` → `--tracking-normal`. Dropped the literal fallbacks in `var(--start-w, 248px)` and
`var(--chip-h-sm, 24px)`. Left as geometry, not design values: `100%` sizes, `50%` / `-50%` / `-100%` centring and
anchoring, the visually-hidden 1px pattern in `.tbl.flip thead`, the Skeleton gradient stops / `200%` size / `90deg`,
z-index offsets (`± 1`, `- 2`) and the LoadCard's `flex-grow: 999`.

### Class renamed

- Callout `.block` → `.callout` (`feedback.css`, with `.callout .h`, `.callout .h svg`, `.callout .b`, `.callout .b b`).
  `.block` also matched `.btn.block` and `.seg.block`, giving block Buttons (About: "Source repository", "LICENSE file
  in the repository") the Callout's amber border and 14 × 16 px padding. No markup in the kit used the Callout class.
- EmptyState `.empty` → `.empty-state` (`feedback.css`, with `.empty-state .eg/.et/.em/.ea`; `EmptyState.jsx`).
  `.empty` also matched MetaList's `.val.empty` dash, giving every unmeasured value 48 × 24 px padding and a flex
  column: the cause of the Test card's tall, spread-out rows. MetaList keeps `.val.empty`.

### Contract fixes

- **AppHeader compact:** the mark was `role="img"` named "BitGauge" next to the visible wordmark. New `Logo decorative`
  prop (aria-hidden, no role or name, as wordmark mode already does); the compact header uses it.
- **Test screen h1:** `<h1 class="sr-only">Speed test</h1>` is the first child of `<main>` (i18n-a11y.md §2.8).
- **Packet-loss reason visible:** the Test MetaList's packet-loss row shows "Browsers can't see packet loss over TCP"
  as its sub line under "Packet loss"; badge and "Why?" link unchanged. New export `NOT_MEASURED_REASON`
  (NotMeasured); tiles.md and NotMeasured.prompt.md updated. MetaList rows with a component value get `.mrow.node`,
  a small grid: label and value on the first line, the sub line full width beneath. (An interim flex-wrap version
  inflated the list's intrinsic height and spread the Test card's rows over the whole card; `.mlist` also gets
  `align-content: start`.) In the Test card the "Why?" link moves to the end of the reason line: new
  `NotMeasured link` prop (default true) and `NotMeasuredWhy` export.
- **Slow client context:** the slow states (slow, slowdone, cancelled-slow, cancelled-slow-up) use the CGNAT address
  100.101.4.17 instead of 10.8.0.6, so "VPN, suggested" matches the address mapping.
- **Gauge flicker on phase switch** (latency → download → upload): the window decade (`useGaugeWindow`) and its tween
  (`useTweenK`) reset in effects, so the first render after a mode or start-window change drew the arc and ticks on the
  previous scale for one frame, and the arc's `d` transition swept from the old phase's arc. Both are now derived in the
  same render (kept). The real jump was the arc's `d` transition: it moved the endpoint along a straight chord, so for
  180 ms the stroke was a radius-r arc off the dial's centre (≈ 90 px at t = 0.5 on latency → download), and the
  large-arc flag flipped mid-tween. The value arc is now a static full-track path with `pathLength="1"` and
  `stroke-dasharray: <fraction> 1`; only `stroke-dasharray` transitions (180 ms, `--dur-base`), dropped only for a
  window shift and reduced motion. The interim "snap on phase switch" is reverted, so gauge.md rule 8 holds across
  phase switches. Behaviour change: a value at the window floor (fraction 0) draws nothing, where the old clamp left a
  round cap dot at 135°. Matches the shipped app.
