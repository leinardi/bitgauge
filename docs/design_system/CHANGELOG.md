# Changelog

## Share image layout and states (2026-10-18)

`components/share-panel.md`, `SharePreview`, tokens, `ui_kits/app` (ResultDetail, TestScreen, App); `features/` was not edited.

- **Share image layout:** new section in share-panel.md specifying the 1200 × 630 image: regions (header, number
  blocks, grade, foot), positions, type roles and rules. The image is laid out on a 480 × 252 reference box and
  drawn at 2.5×; new tokens `--share-scale`, `--share-w`, `--share-h`, `--share-pad-y`, `--share-pad-x`,
  `--share-header-h`, `--share-body-top`, `--share-label-h`, `--share-block-w`, `--share-grade-size`,
  `--share-grade-w`, `--share-server-max`, `--type-share-unit`, `--type-share-qual`, `--type-share-meta`,
  `--type-share-head`, `--type-share-grade`.
- **Scale:** the numbers are the dominant element, sized for the widest case (two "9.41 Gbit/s" blocks beside the
  grade): `--type-share-value` 26 → 48 px on the box (120 px in the PNG). Grade tile 30 → 48 (the number row's height),
  letter 15 → 26, words now under the tile; block label 8 → 12; unit 10 → 16; qualifiers, foot and grade words 9 → 10;
  header label 9 → 11; logo 15 → 20. Number blocks start at 48 (was 76), so the band under the header is gone.
- **Per-image placement:** header on the top padding, foot on the bottom padding, and the group (number row, qualifier
  stacks, grade) centred in the band between them, at least `--share-gap-min` 10 → 25 px from each (replaces the fixed
  `--share-body-top`). Images without qualifiers no longer carry an empty band reserved for them.
- **Limits rechecked:** qualifier stack ≤ 5 lines and foot ≤ 3 now bound the worst case: the worst group (135 → 337.5)
  fits the worst middle band (139 → 347.5), so the 10 → 25 px minimum gap always holds. Server name ellipsis at
  224 → 560 px, tested with a 64-character name.
- **One baseline per image:** both numbers share one fixed-height grid row; qualifiers grow the group downward, the foot
  grows upward. A qualifier under one number can no longer lift it above the other.
- **Qualifiers sit with their number:** status, confidence (with reasons, or CPU-bound) and overhead compensation
  stack under each rate; the loaded-latency increase names its direction, a non-WebSocket source and, when idle ran on
  the other path, "vs idle over WebSocket" / "vs idle over HTTP"; the grade names a one-direction basis.
- **SharePreview:** props `blocks[].dir/status/confidence`, `overhead`, `basis`, `idle`, `jitter`,
  `loaded: { increase, dir, source, idleSource }`, `where`, `when`, `size` ("fluid" | "full"); it words the
  qualifiers itself (`ShareFormat.qualifiers`, `ShareFormat.loaded`; capitalised so they reach the namespace) and builds its accessible summary from its content. It
  scales one fixed box to its frame, so the preview matches the PNG at any panel width.
- **Copied text = the image's lines:** new `ShareFormat.summary(props)` (also exported as `shareSummary`) builds the summary from the same props as the image.
  Both kit screens use it, so the text carries the same numbers and qualifiers (confidence, status, overhead, source,
  "vs idle over WebSocket / HTTP", basis) and nothing more: gone are Continuous "(2 h average)", "Upload not measured",
  the peak and "Continuous · 42:18", "stopped at 3.1 s", and the Test screen's "(worse direction)"; added are the Test
  screen's missing upload "low confidence: insufficient samples", CPU-bound, overhead and source qualifiers.
- **Kit:** every share (Result detail and Test screen, Continuous included) passes result fields, no foot strings, so
  no share repeats the grade words in the foot. Continuous shows one download block: no peak block, no
  "continuous · 42:18" item. Result detail's confidence per direction now comes from the new `confDown` / `confUp`
  props (Demo panel: Download / Upload confidence) instead of being fixed at normal.
- **States sheet:** `preview/share-image-states.html` renders every state at card scale (k adds "WebSocket closed after
  idle latency") and a, c, e, o at 1200 × 630.

---

## Result detail, Test screen and History fixes (2026-10-18)

Shared components and `ui_kits/app`; `features/` was not edited.

- **Result detail chart summaries:** Download and Upload end with "; latency under load on a second scale" while that
  series is drawn, as on the Test screen.
- **Result detail Copy:** the Text summary's button keeps the visible "Copy" and is named "Copy summary" (aria-label).
- **LoadCard `ended`:** with no grade, the letter reads "Bufferbloat not graded" once the run has ended, and
  "Bufferbloat grade pending" only while it can still be graded. The Test screen sets it in its ended states
  (complete, cancelled, error).
- **Test screen load rows:** the source is named only once the direction has its result; Pending, Not run and live
  rows read "During download" / "During upload". A partial download row (cancelled-slow, cancelled-download) gives its
  p90 before the increase.
- **Test screen latency toggle:** the throughput chart's "Latency under load" legend item is a button with
  aria-pressed (pressed while drawn) that hides and shows the loaded-latency series and its right-hand axis; it stays
  listed in every state, before the first loaded ping too. Chart legend items accept `pressed` + `onToggle`.
- **Test screen follow-ups:** `ended` follows the button's role, so error-early's Retry copy also reads "Bufferbloat
  not graded". While the run is in progress (upload, slow, insufficient) no load row names a source; the download row
  reads "During download" with its p90 and increase, and the source appears with the result.
- **Result detail header:** the breadcrumb "/" and the meta line's "·" separators are aria-hidden, still visible.
- **Result detail not-saved-partial:** draws the run stopped 3.1 s into the upload (the no-steady-window run): upload
  insufficient data, grade from download only, "Test cancelled during upload", "Upload: insufficient data", no upload
  chart. Badge, reason line and read-only note unchanged.
- **History Date range:** a custom range sits in one span inside the button ("Oct 2 – 8, 2026"), its time elements kept.
- **History unavailable:** new body text, starting with the spec's sentence for this state.

---

## Accessibility follow-ups (2026-10-18)

Shared components and `ui_kits/app`; `features/` was not edited.

- **Popover non-modal by default:** Escape and a click outside still call `onClose`, but the page stays readable and
  Tab can leave it (History's Date range). `modal` opts in; History's Export menu sets it. The mobile Compare sheet stays modal.
- **Menu is modal:** page inert while open, focus in the menu, back on the trigger on close; a click outside closes it.
  New `placement="top"` (`.menu.up`) and a placement-only `style`. History's row Actions buttons are now Menus (Open,
  Delete); the last two table rows open upward so the card's clipping doesn't cut them.
- **Named regions:** Result detail's tiles are a section "Results" (the Test screen's already was); `LoadCard` is a
  section named "Bufferbloat" by aria-label, its title still the small caps label. PhaseChart's image reads
  "<title> chart: <summary>"; Result detail's summaries no longer repeat the title.
- **Test screen chart summary** ends with "; latency under load on a second scale" while that series is drawn.

---

## Accessibility: modal dialogs, headings, named sections (2026-10-18)

Shared components and `ui_kits/app`; `features/` was not edited. Semantic changes only, no visual change.

- **Modal:** new `useModal` / `Modal` (dialog/Modal.jsx). While open, the page behind is inert (`inert` on the siblings
  of the dialog and of each ancestor; aria-hidden as fallback), focus moves inside and Tab wraps; on close both are
  restored and focus returns to the invoking control. Used by `Dialog` (non-inline) and `Popover` (new `modal`, default
  true, and `onClose` for Escape / click outside). Kit: History's Export menu, Date range, Compare (desktop dialog and
  mobile sheet) and Clear all, Settings' Reset all, the Test screen's Share result. The Demo panel is `data-modal-exempt`.
- **Headings:** `Card` gets `headingLevel` (default 2) and renders its title as that heading; `Dialog` titles are h2;
  `EmptyState` gets `headingLevel` (default 2); `PhaseChart` titles are h2. Group titles inside cards (Test parameters,
  Confidence and notices) are h3; History's Trend title and Settings' Advanced disclosure are h2. Cards in the share
  dialog use h3. v0.1's "Not available" page uses its empty-state title as the screen's h1.
- **Named sections:** a titled `Card as="section"` is labelled by its title heading. Result detail's Share image, Text
  summary and Test parameters, and the share dialog's cards, are sections named this way; PhaseChart sections too.

---

## Chart follow-ups (2026-10-16)

`components/charts/`; `features/` was not edited.

- **ms axes in one precision:** every tick on a ms axis (Chart's main axis and the latency-under-load axis) takes the
  top label's decimals, the top label following screens.md §6: "3", "6", "9", "12 ms"; "1.0", "2.0", "3.0", "4.0 ms".
  Previously each tick was formatted on its own ("3.0 … 12 ms") and the latency axis always rounded to whole ms.
- **PhaseChart on Chart's placement rules:** placement moved into `placeTopLabels` (Chart.jsx), used by both. Event
  chips keep their preferred side (right of the line), take the left when the right is crossed or leaves the plot, else
  a further row. Offsets are `--chart-label-gap` (was a literal 4px) and `--chart-label-row`; rows grow to the chip
  height plus half the gap when chips are taller than the row token (was a literal 18px). Chip sizes are measured after
  render. Chart mark labels now also check that their preferred side stays inside the plot, and a second-row mark label sits
  one label height (or `--chart-label-row`, if taller) below row 1, so it no longer reaches into the phase label above.

---

## Chart corrections (2026-10-16)

`components/charts/Chart.jsx`; `features/` was not edited.

- **Value labels in one unit:** `chartGeometry` formatted each y tick with its own `Format.rate` unit while only the
  top label named one, so an axis up to 1 Gbit/s read "250", "500", "750", "1.00 Gbit/s". Every tick now reads in the
  top label's unit with the top value's decimals (three significant digits): "0.25", "0.50", "0.75", "1.00 Gbit/s";
  "200" … "800 Mbit/s" is unchanged (principles.md, honest numbers). Latency (ms) axes unchanged.
- **Mark label over a phase label:** a mark label that would cross a phase label on the top row now goes right of its
  line when it fits there, else to a second row; the Cancelled state's "Upload" / "Cancelled" no longer overlap.
  Label widths are measured after render (estimate on the first). New tokens `--chart-label-gap` 6px and
  `--chart-label-row` 12px replace the literal 6 / 12 offsets (same values); `.chart-lb .mk.r` for right-placed labels.

---

## v0.2 version scope for the app kit (2026-10-16)

Adds a v0.2 scope between v0.1 and v0.3. Source of truth: `features/ui/screens.md`, `features/measurement.md`
and the scope brief (`features/roadmap.md` is not in this project, so §1.2 / §1.3 could not be read directly).
`features/` was not edited.

- **Prototype:** `caps()` defaults to v0.2 and adds `quality` (v0.3: RPM, quality scores, Continuous);
  `clients` stays v0.3. `caps` now also goes to History, Result detail and Settings.
- **Demo panel (App):** the "v0.1 scope" checkbox is now a **Scope** control (v0.1 / v0.2 / v0.3, default
  v0.2). Outside v0.3 it hides the `continuous`, `cont-warmup`, `cont-done` Force-state entries, the Continuous
  scenario, Responsiveness and the Result-detail Kind; no state or variant name changed. Latency probe gains
  "HTTP/3 probe"; new "Upload loaded lat." select forces a no-value reason (v0.2+).
- **Components:** `LoadCard` takes `basis` and renders the RPM part only when `responsiveness` is passed;
  `ChoiceCard` takes `disabledReason` (aria-disabled, tooltip). CSS in tokens only (`.grade-b`,
  `.choice[aria-disabled]`).
- **Test screen:** grade with words and basis; per-direction loaded latency (median, p90, change vs idle, "over
  WebSocket" when idle used the WebSocket and load the HTTP fallback) or its reason ("no steady window",
  "fewer than 10 samples", "HTTP/1.1 reservation not held", "no latency probe"); source labels WebSocket /
  HTTP/1.1 reserved / HTTP/2 probe / HTTP/3 probe. HTTP/1.1 reserved: 5 streams, HTTP/1.1, and the info notice
  "HTTP/1.1 probe reservation active — 5 streams" next to the fallback notice. No RPM, no QualityList before
  v0.3. The screen-reader summary adds grade and loaded-latency increase from v0.2.
- **Result detail:** same LoadCard rules; no QualityList, no responsiveness notice and no Continuous kind before
  v0.3. JSON: `loadedLatency` with `lost` and `idleSource` (only when it differs), or the `unavailable` form
  with its reason; `bufferbloat.basis` follows the directions graded; no `responsiveness` or `scores` keys
  before v0.3; `schemaVersion` 1.
- **History:** Compare drops the HTTP loaded responsiveness row before v0.3.
- **Settings:** before v0.3 the Continuous card is disabled with a "v0.3" badge and the tooltip "Arrives in
  v0.3"; run length and direction stay hidden.
- `ui_kits/app/README.md`: "Version scope" section.
- **Latency paths (correction, measurement §10–§11):** Latency probe sets the one path for idle and loaded
  latency; ws-fallback runs both over HTTP (idle tile labelled with the HTTP source, change line "vs idle"
  without qualifier). New Demo checkbox **"WebSocket closes after idle latency"** (v0.2+): idle stays WebSocket,
  loaded rows use the HTTP source from Latency probe (WebSocket/auto → HTTP/2 probe) and read "vs idle over
  WebSocket", with the fallback notice. On HTTP/1.1 the download row is unavailable ("HTTP/1.1 reservation not
  held"), upload is measured with the reservation and the grade's basis is upload only.
- **Result detail follows the same two controls:** idle tile path, loaded row source labels and change lines,
  the fallback notice under Notices, and JSON (`idle.path`, `loadedLatency.source` from the probe control incl.
  `http-h3`; `idleSource` only when the WebSocket closed after idle). HTTP/1.1 + checkbox: download
  `unavailable` / `reservation-broken`, upload measured, `bufferbloat.basis` "upload".
- **Result detail on HTTP/1.1 (probe reservation):** stream counts as saved — 5 streams, plateau "HTTP/1.1 probe
  reservation" in Test parameters, tile lines, chart meta and JSON `streams`; Protocol HTTP/1.1; info notice
  "HTTP/1.1 probe reservation active — 5 streams" after the fallback notice; JSON notice
  `{ code: "probe-reservation", streams: 5 }`. Closed-after-idle: download keeps 6, upload 5.
- **Test screen, closed-after-idle on HTTP/1.1:** connection strip shows 6 streams during download and 5 from
  upload; the probe-reservation notice appears when upload starts; done state reads "6 · 5" (download 6 · plateau:
  cap; upload 5 · plateau: HTTP/1.1 probe reservation) and the download tile 6 streams. The 5-stream plateau reason
  reads "HTTP/1.1 probe reservation" in both HTTP/1.1 cases.

---

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
