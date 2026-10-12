# BitGauge web UI — UI kit

Clickable prototype of the BitGauge web UI: mock data, no real server. Use it to see how BitGauge
looks and behaves, and to compare against the production frontend (Vue 3 + Vite + TypeScript +
shadcn-vue + Tailwind 4).

## Run it

Open `index.html`. It loads React 18 + Babel from CDN, the design-system tokens
(`../../colors_and_type.css`), the kit styles (`app.css`, `kit.css`) and `bg-lib.js` (icons, logo,
formatting, gauge and chart geometry). The production app makes no outbound calls; the CDN is for
this design artifact only.

## Try the flows

- **Test** — press **Start test** or Enter (not while a control has focus, and not while Start is
  disabled); Enter during the autostart countdown starts the test now. Escape stops; Enter and Escape
  act only on the Test screen. The run goes Connecting → idle latency → download (10 s) → upload
  (12 s) → result, with the live gauge, chart, phase indicator and tiles. Stopping in any phase ends
  Cancelled with the partial-result rules (Keep in history, Download JSON); it returns to Idle only
  when nothing was measured (stopped while connecting, or during idle latency with too few pings).
- **Result detail** — "Details" after a run, or open a row in History.
- **History** — Compare, Clear all, Export, date range and Import JSON open their states.
- **Settings**, **About** — from the header (mobile: bottom tab bar).
- **Theme** — header toggle (light / dark / follow system).

## Demo state panel

Centred in the top bar (on mobile, a compact "Demo" pill left of the theme button), collapsed by default. It is **kit-only debug scaffolding, not a product control**. It
picks the run scenario (normal, error, slow, autostart, continuous) and speed, switches between the
desktop and 390 px mobile frame, and forces the states the product only reaches through real
conditions: every Test-screen state (offline, base-path mismatch, WebSocket fallback, insufficient
data, URL parameter ignored, Continuous…), units, v0.1 scope, error kind, latency probe, HTTP
responsiveness state, every History variant, Result-detail states, Settings states and About's
compatibility layers. Its values persist in `localStorage`.

## Files

| File | Role |
| --- | --- |
| `index.html` | Single entry point; loads deps and mounts `<App>`. |
| `App.jsx` | Mounts the prototype and the Demo state panel. |
| `Prototype.jsx` | Routing between screens, the test run timeline per scenario, global Enter / Escape. |
| `Nav.jsx` | Desktop header, mobile header, mobile bottom tab bar. |
| `TestScreen.jsx` | Test (Home), all states — `features/ui/screens.md` §1. |
| `ResultDetail.jsx` | Result detail — §2. |
| `History.jsx` | History — §3. |
| `Settings.jsx` | Settings — §4. |
| `About.jsx` | Other clients / About — §5. |
| `bg-lib.js` | `<bg-icon>` (Lucide glyphs, inline), `<bg-logo>`, number formatting, gauge and chart geometry. Ports 1:1 to Vue composables. |
| `app.css` | App shell + shared layer; imports the component files below. |
| `buttons.css` · `badges.css` · `inputs.css` · `surfaces.css` · `tables.css` · `dialog.css` | Component styles (see the root README). |
| `kit.css` | Kit-only: page reset, hover states, Demo state panel. |

Each `.jsx` exports its component to `window` (Babel scripts don't share scope). Screens are class
components: `renderVals()` computes everything the markup shows, `render()` is plain JSX over it —
the same split as a Vue SFC's `<script setup>` and `<template>`.

## Component inventory (production mapping)

| Component | Built on (shadcn-vue / Reka) | States / notes |
| --- | --- | --- |
| AppHeader / TabBar | NavigationMenu, ToggleGroup | Desktop top bar with server name and theme toggle. Mobile: compact header plus a 4-tab bottom bar. |
| ConnectionStrip | Badge | Client IP, suggested context (LAN/VPN/…), protocol, streams. Includes a summary of non-default settings with Edit. |
| PhaseIndicator | custom &lt;ol> + Progress | Shows 1–3 phases. Each one: pending, active (progress or time left), done, failed, cancelled, skipped or capped. |
| Gauge | custom SVG | 270° log arc over a 4-decade window supplied by the engine (shifts one decade after a 2 s hold, 280 ms). Shows a recent-range band, peak tick, and an inner upload arc on completion. Rate or ms mode, plus idle, countdown, cancelled and error readouts. |
| StartButton | Button size=lg | One button that changes role: Start, Stop, Run again, Retry, Start now. Shows a kbd hint on desktop; full width, 52 px, on mobile. |
| ThroughputChart | uPlot | Throughput series, optional latency-under-load on a second y-axis, null gaps for unknown upload cells, a now line, and phase separators and event marks (lost, cancelled, cap, extended) drawn via hooks. |
| MetricTile | Card | States: empty (—), live, done, partial, incomplete, low confidence. |
| LoadCard | Card + GradeBadge | Bufferbloat grade (A+ Minimal, A Low, B Mild, C Moderate, D High, F Severe) with an A+–F scale strip, loaded latency for down/up with change vs idle, and RPM. |
| QualityList | Badge | Streaming, Gaming, Video calls → Great, Good, Average, Poor or Bad (AIM point tables, measurement §13: Streaming = latency, packet loss, download, loaded-latency increase; Gaming = latency, packet loss, loaded-latency increase; Video calls = latency, jitter, packet loss, loaded-latency increase). Upload is not an input. Each rating has an icon and text. |
| NotMeasured | Badge (outline, dashed) | Placeholder for packet loss; the tooltip explains it is not measured (fixed at 0 points in the quality scores). |
| Notice | Alert | info, warn, danger or neutral, with up to two actions. Danger uses role="alert". |
| SaveBar | Card + Input + ToggleGroup | Confirms “Saved to history” and offers a label field with suggested label chips, Share, Download JSON and Details. Partial results offer Keep in history and Download JSON. |
| ResultHeader | Input (inline edit) | Editable label, context, timestamp (absolute on hover), plus the actions. |
| NoteField | Textarea | Saves automatically with the result in IndexedDB (history). |
| ShareImage | &lt;canvas> → PNG | A 1200×630 image always rendered in the dark theme, with a preview in the rail. |
| SummaryBlock | &lt;pre> + Clipboard | A preview of exactly the text that gets copied. |
| HistoryTable | Table, Checkbox, DropdownMenu | Every column sorts (aria-sort). Selecting rows opens a bar with Compare. Below 640 px it becomes a card list. |
| FilterBar | ToggleGroup, Popover + RangeCalendar, Input | Label/context chips with counts, date range, search. |
| TrendChart | uPlot | Small multiples: download and upload on a log scale, latency linear, null gaps where a run has no value. Filtered by label. |
| CompareDialog | Dialog | A vs B with the change, worded as better or worse and shown with an icon. |
| ConfirmDialog | AlertDialog | Clear all names the count, states it is irreversible, and offers Export first. |
| EmptyState | — | First run with Start a test and Import JSON. |
| PresetPicker | RadioGroup (cards) | Quick, Standard, Extended, Continuous. Continuous shows a duration field. |
| Segmented / Switch / NumberField / Select | ToggleGroup, Switch, NumberField, Select | Streams (Auto/Fixed/Single + stepper), cap, units, theme, language. |
| Advanced | Collapsible | Collapsed by default: warm-up and ping count. |
| ShareUrlField | Input readonly + Button | URL rebuilt from the non-default settings, with an optional autostart flag. |
| SnippetBlock | &lt;pre> + Clipboard | Client snippets on the terminal surface. |
| Toast | vue-sonner | “Summary copied.”, “Image downloaded.” |
| UndoToast | vue-sonner (action) | “Result deleted.” with Undo; the delete commits when the toast expires. |
| ShareDialog | Dialog | Same content as the Result-detail rail: share image preview, summary text, copy and download. |
| ImportResult | Dialog + Alert | Reports a JSON import: how many results were added, skipped as duplicates, or rejected, and why. |
| OfflineState | Alert + EmptyState | Shown when the server is unreachable: history stays readable, starting a test is disabled with the reason. |
| FullScreenError | — | Base-path mismatch: the app was served from a path it was not built for. Names the expected and actual path. |
| Skeleton | Skeleton | Initial-load placeholders matching the final layout (tiles, history rows, charts); refreshes keep content. |
| Tooltip | Tooltip | Absolute timestamps, disabled reasons, not-measured explanation. |

## Notes for production

- Icons are Lucide; in Vue use `@lucide/vue` with `stroke-width="1.75"`.
- Charts are uPlot; the gauge is custom SVG (see `components/gauge.md`).
- Toasts are `vue-sonner`.
- Copy, states and behaviour come from `features/ui/`; where this kit and the spec disagree, the
  spec wins.
