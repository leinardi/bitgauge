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
6. Narrow layout threshold: the kit uses 1140 px; tokens.md gives mobile values without a breakpoint.

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
