# Screens

[Feature index](../README.md) / [UI](README.md) / Screens

Five screens. For each: purpose, elements, states, notices and responsive notes. Visual design comes
from the design export; this page fixes content and behaviour only. Terms follow the
[glossary](../glossary.md).

## 1. Test (Home) — `/`

**Purpose.** Run a test and read the result at a glance.

**Elements:**

- **Server name** (`server.display_name`), in the persistent header with the page's host and a
  reachability indicator (dot plus text for screen readers: connected or unreachable).
- **Connection info:** client IP with IP version; suggested context label (`LAN`, `VPN` or none),
  editable; negotiated HTTP protocol (`HTTP/1.1`, `HTTP/2`, `HTTP/3`, or "not reported"); stream
  count, live during a run, with the plateau reason afterwards.
- **Settings summary:** the settings that differ from the server defaults, one chip each (for
  example "Extended", "4 streams", "Cap 500 MB"), or the preset name when nothing differs, with
  an Edit link to Settings.
- **Start / Stop** button (one control that changes role: Start, Stop, Run again, Retry, Start
  now); keyboard accessible, including the page-wide Enter shortcut
  ([i18n-a11y.md §2.4](i18n-a11y.md#24-keyboard)).
- **Phase indicator:** idle latency → download → upload in the configured order. The info phase
  is shown as "Connecting…" on the first step rather than as a step of its own. Each step is
  pending, active (with progress or time left), done, failed, cancelled, skipped, or capped (the
  data cap ended it).
- **Live gauge:** the auto-windowed logarithmic gauge of
  [../measurement.md §14](../measurement.md#14-units-and-gauge), with a numeric readout and a
  caption naming the current window; during idle latency it switches to milliseconds; during
  upload it shows the client's sending progress, labelled "sending".
- **Live chart:** throughput over time (download; upload `received` solid and `sending` faint),
  phase separators, event marks (extended, data cap, cancelled, error), optional loaded-latency
  series toggle on its own axis. Warm-up samples are drawn over a shaded band until warm-up ends:
  they exist only in memory and count toward no number.
- **Result metrics** (§6), each with its qualifiers. While a direction runs, its tile shows
  "warming up" until warm-up ends, then the steady-window average and peak so far.
- **Packet loss slot** reading "packet loss — not measured" (§6).
- **Data used** live during the run.
- **Notices** area (§7).
- **Save bar** after a `complete` run (v0.2, with history): "Saved to history", an inline label
  field with suggested labels (the context label and recent labels from history), Share and
  Details. Share opens the share dialog of [flows.md §8](flows.md#8-sharing).
- **Keep in history** for a `partial` or `error` result with at least one finished phase: such
  results are not saved unless the user keeps them ([flows.md §4](flows.md#4-cancel-mid-test)).
- Link "Details" to the Result detail of the finished run.
- **Download JSON** of the finished result: the single result object in the JSON export format
  of [../technical-stack/frontend.md §5](../technical-stack/frontend.md#5-history-module-idb)
  (`results` with one entry), with the same "contains client IPs and notes" warning as the History
  export. It works without history, for `complete`, `partial` and `error` results, and it is the
  accuracy harness's extraction path from v0.1
  ([decisions.md §36](../technical-stack/decisions.md#36-v01-harness-extraction--download-json-on-the-test-screen)).
- **Last result line** in the idle state: when, headline numbers and label of the latest saved
  result, linking to its detail.

**States:**

| State | What the screen shows |
| --- | --- |
| Idle | Server name, connection info (from `GET /info`), Start, the last result line if any, the settings summary. |
| Running: info | "Connecting…" on the first phase step; Start becomes Stop. |
| Running: idle latency | Gauge in milliseconds, ping counter, live median. |
| Running: download / upload | Gauge, chart, stream count, protocol, data used; per-direction "measuring" or "warming up" hint; loaded latency live. |
| Done | Result metrics, notices, save bar (v0.2), Details link, Download JSON, Run again. |
| Cancelled | Partial result with `partial — stopped early` and what was covered ([../measurement.md §7.8](../measurement.md#78-worked-example-b--cancellation-mid-request)); an interrupted direction shows a number only when its confirmed steady window meets the minimum ([../measurement.md §7.6](../measurement.md#76-headline-peak-and-minimum-window)), otherwise "insufficient data". Not saved; Keep in history and Download JSON offered. |
| Error | What failed and in which phase, completed phases kept, the failed direction with status `error` and no number, Retry. Not saved; Keep in history and Download JSON offered. |
| Offline / retry | `GET /info` fails, or every idle-latency ping is lost ([../measurement.md §10](../measurement.md#10-idle-latency)): "Server unreachable" with Retry; Start disabled until `/info` succeeds. A WebSocket that cannot be opened is **not** offline: the test runs with the HTTP latency fallback and the notice `WebSocket unavailable — HTTP latency fallback`. |
| Auto-start countdown | When `run` is set: a cancellable countdown (3 s) before the test starts ([flows.md §2](flows.md#2-auto-run-from-url)). |

**Before v0.2.** The v0.1 Test screen has no history, Result detail, share, loaded latency, grade,
quality scores or HTTP loaded responsiveness ([../roadmap.md](../roadmap.md)): its only result
action is Download JSON, and its metrics are download, upload, idle latency, jitter, data used,
duration and the packet loss slot. The layout must read as complete without the later cards.

**Responsive notes.** On narrow screens the gauge and Start stay above the fold, with Start full
width; the chart collapses below the metrics; connection info collapses into a single line with a
disclosure. Navigation becomes a compact header plus a bottom tab bar (Test, History, Settings,
About). The page must work in portrait on a phone without horizontal scrolling.

## 2. Result Detail — `/result/{id}`

**Purpose.** Everything about one result.

**Elements:**

- Header: breadcrumb back to History, the label (editable inline), context label, date and time
  (absolute on hover), preset and server name.
- All metrics of §6 with full qualifiers, and a **confidence and notices** card listing every
  confidence reason and notice, each with an icon and text.
- **Per-phase charts:** download and upload steady-window series with their event marks, idle
  latency samples, and loaded latency samples per direction. Warm-up is drawn as a marked,
  excluded interval (its samples are not stored); unknown upload cells and failure gaps are gaps.
  The stored data behind them is specified in
  [../measurement.md §17](../measurement.md#17-result-object).
- **Chart or table** toggle per chart. The table is the charts' text alternative: rows of 2 s
  windows from warm-up end, throughput as bytes over known time (a window with no known time shows
  "—", a shorter edge row shows its real span) and the median latency of the samples in the
  window. When the stored cells are coarser than 2 s (Continuous), one row per stored cell, with
  the header naming the cell size.
- **Test parameters:** preset, phases and order, stream mode, count and plateau reason, durations,
  data cap, units, warm-up mode, ping count, overhead compensation, protocol, server name and
  version, browser, client IP, timer resolution and whether the page was cross-origin isolated.
- **Label and note:** editable, saved with the result in history as they change.
- **Share panel:** always visible beside the metrics: a preview of the share image and of the
  copied text, showing exactly what each contains
  ([../security.md §7](../security.md#7-browser-only-history-and-privacy)), an "include label"
  option (off by default), Download image, Copy summary and, where the Web Share API is available,
  Share ([flows.md §8](flows.md#8-sharing)).
- **Download JSON**, **Delete** (with an undo toast) and **Run again** (same settings).

**States:** loaded; not found (unknown id, or history unavailable after a reload) with a link to
History; history unavailable (the detail of the current in-memory result works, editing and
deleting are disabled with the reason).

**Responsive notes.** One column; charts stack vertically; the share panel follows the charts;
parameters collapse into a disclosure.

## 3. History — `/history`

**Purpose.** Review results stored in this browser.

**Elements:**

- Notice: "Stored only in this browser, for <origin>" with a link explaining per-origin storage
  ([../edge-cases.md §8](../edge-cases.md#8-different-origins-give-separate-histories)).
- **List** of results: date and time, label, context label, download, upload, idle latency,
  jitter, grade, protocol, status; every column sortable; a row action menu (open, delete).
- **Filters:** chips by label and by context label, each with its count; a date range (last 7,
  30 or 90 days, all time, or a custom range); a search over labels and notes.
- **Trend chart** over the filtered results: small multiples of download and upload (log scale)
  and idle latency (linear). Results whose status is not `complete` are drawn as hollow markers,
  with a legend entry.
- **Selection bar** once rows are selected: the selection count, Compare (exactly two), Delete
  selected (with an undo toast), Clear selection.
- **Compare two results:** side-by-side metrics with the change per metric, worded as better or
  worse with an icon, and both parameter sets including the browser; a warning when they differ in
  preset, protocol or label, naming the difference; Copy comparison.
- **Export** (JSON or CSV, each for all results or the current filter, with the "contains client
  IPs and notes" warning), **Import** (JSON; a CSV is refused with "CSV exports are summaries and
  can't be restored"), **Clear all** (with a confirmation naming the count and offering "Export
  JSON first").
- On Safari, a hint recommending export ([../edge-cases.md
  §17](../edge-cases.md#17-safari-and-ios-quirks)).

**States:** loading; empty ("No results yet" with Start a test and Import JSON); populated;
filtered with no match (with Clear filters); history unavailable ([../edge-cases.md
§7](../edge-cases.md#7-indexeddb-unavailable-private-mode)); import in progress, import result
(added, skipped as duplicates, rejected with reason).

**Responsive notes.** On narrow screens rows become cards with label, date, download, upload,
latency and grade, with a sort control; the trend shows one metric at a time with a selector;
compare shows one result per column with horizontal paging.

## 4. Settings — `/settings`

**Purpose.** Change how tests run in this browser.

**Elements:**

Settings are saved in this browser as each valid change is made; there is no Save or Discard
step. A setting that differs from the server default is marked "changed" and has its own reset.

- **Preset:** Quick, Standard, Extended, Continuous, as cards with a one-line description each
  stating streams, durations and ping count
  ([../measurement.md §8.5](../measurement.md#85-presets)).
- **Phases:** toggles for idle latency, download, upload (at least one stays on), and the order of
  download and upload; for Continuous, the one direction it runs (current answer to an item in
  [../open-questions.md](../open-questions.md)).
- **Streams:** auto, fixed (1–6), single.
- **Duration:** minimum and maximum per direction (defaults from the preset; "custom" when edited);
  for Continuous, an optional **run length** (none by default, 1 minute to 7 days).
- **Data cap:** none or a size.
- **Units:** bits or bytes.
- **Auto-start:** off or on, with the countdown length (3 s by default); cancellable countdown
  before each auto run.
- **Theme:** system, light, dark (also switchable from the header). **Language:** the shipped
  locales only.
- **Advanced** (collapsed by default): warm-up (`auto` or a fixed duration), ping count, overhead
  compensation (0 by default, LibreSpeed presets offered, with the "shown next to every number"
  note).
- **Changed from defaults:** a list of every changed setting with its default, its value and a
  reset each, plus **Reset all to defaults** (the server's defaults from `GET /info`, after
  confirmation).
- **Shareable URL:** a read-only field with a Copy button that encodes the current settings as URL
  parameters, with an "include `run=1`" option
  ([url-params.md §3](url-params.md#3-shareable-settings-url)).

**States:** defaults; changed (markers and the changed list); invalid input (inline error on the
field, value not saved; focus is not moved, and Tab leaves the field as usual); saved (the change applies to the next test).

**Responsive notes.** One column on narrow screens; Advanced collapsed by default.

## 5. Other Clients / About — `/about`

**Purpose.** How to use BitGauge from other clients, and what BitGauge is.

**Elements:**

- **Copyable snippets**, each shown only when its layer is enabled (`compat` in `GET /info`),
  otherwise a note that the operator can enable it:
  - `librespeed-cli` server-list JSON and command lines
    ([../compatibility.md §2.3](../compatibility.md#23-librespeed-cli-server-list));
  - the OpenSpeedTest UI `?Host=` URL, with the note about its results link
    ([../compatibility.md §1.3](../compatibility.md#13-client-usage));
  - `networkQuality -C …/nq/config` ([../compatibility.md
    §3.5](../compatibility.md#35-client-usage)).
- **About BitGauge:** server name, **version** (`server.version`) with build commit and date
  (`server.commit`, `server.buildDate`), **licence** (GPL-3.0-or-later), **source link**.
- **Privacy:** no accounts, no tracking; the server keeps no results, history lives only in this
  browser.
- **Credits:** OpenSpeedTest™ trademark note, LibreSpeed, Cloudflare (AIM quality scores), Apple
  `networkQuality` and the IETF responsiveness draft, Waveform (bufferbloat thresholds).
- Short methodology summary linking to the published docs.

**States:** layers enabled or not; server unreachable (snippets built from the page's own origin).

**Responsive notes.** Snippets wrap with a horizontal scroll inside the code block only.

## 6. Result Metrics, Units and Precision

| Metric | Unit and precision | Qualifiers shown |
| --- | --- | --- |
| Download, upload (headline) | auto-scaled kbit/s, Mbit/s, Gbit/s (or kB/s, MB/s, GB/s), 3 significant digits | direction status (`insufficient-data` shown as "insufficient data", `partial`, `skipped`, `error`; `measured` shows the number), confidence and reasons, overhead compensation when non-zero |
| Peak (per direction) | as above, labelled "peak" (the p90 of the steady window, never a maximum); live, the steady-window p90 so far, hidden during warm-up | Continuous: "p90, last hour" |
| Idle latency | ms; min, median, p90; whole ms ≥ 10 ms, one decimal below, "< 1 ms" below the timer resolution | path (`websocket` or HTTP), loss percentage |
| Jitter | ms, same precision | described as the mean of consecutive differences |
| Idle probe loss | %, one decimal | labelled "probe timeouts", never "packet loss" |
| Loaded latency (per direction) | ms; median and p90; increase over idle | label "Loaded latency (WebSocket)" or the fallback source `http-h1-reserved` / `http-h2` / `http-h3`; `unavailable` with reason |
| Bufferbloat grade | letter plus words: A+ Minimal, A Low, B Mild, C Moderate, D High, F Severe bufferbloat | basis (`download+upload` or one direction) |
| HTTP loaded responsiveness | RPM, integer | always labelled "HTTP loaded responsiveness — connection sharing not verifiable" with the protocol; state `measured`, `uncertain`, `unavailable_h1` ("needs HTTP/2 or HTTP/3 at the reverse proxy", or "protocol not reported — treated as HTTP/1.1") or `unavailable_insufficient` ("not enough samples") |
| Quality scores | band per experience: streaming, gaming, video calls (bad, poor, average, good, great), each band with an icon and its name | missing input named; basis when only one direction has a loaded-latency increase ("download only"); note "upper bound: packet loss is not measured" |
| Packet loss | reserved slot: "packet loss — not measured" | "browsers can't see packet loss over TCP", link to why ([../measurement.md §18](../measurement.md#18-future-packet-loss-via-webrtcturn)); no promise of a release |
| Data used | decimal kB, MB, GB, 3 significant digits | — |
| Duration | s, one decimal | — |
| Protocol, streams | `HTTP/1.1`, `HTTP/2`, `HTTP/3`; stream count and plateau reason | — |

Definitions: [../measurement.md §9–§17](../measurement.md#9-final-value).

## 7. Notices

Notices appear in the notices area of the Test screen (live where relevant) and in the Result
detail, each with a short explanation and, where useful, a link to the docs. The full list is
[../measurement.md §16](../measurement.md#16-confidence-and-notices); the UI groups them:

- **Slow link:** `slow link — test extended`; `insufficient data` with an "Try Standard/Extended"
  action.
- **Confidence:** `low confidence` with reasons; `cpu-bound` ("limited by this device's CPU").
- **Limits:** `data cap reached`; `server stream limit — N streams`; `data used: N GB`
  (Continuous); `overhead compensation +p %`.
- **Settings:** `URL parameter ignored`, naming each invalid parameter.
- **Interrupted:** `partial — stopped early` (a Continuous run stopped after its steady window began
  is `complete` instead); `upload interrupted by a failed request`;
  `server restarted`; `network changed`; `page was hidden during the test`.
- **Connectivity:** `server unreachable` with Retry; `WebSocket reopened`;
  `WebSocket unavailable — HTTP latency fallback`; `HTTP/1.1 probe reservation active — 5 streams`.
- **Deployment:** `proxy buffering suspected`; `response compression detected`;
  `timer throttling detected`; `base path mismatch` (full-screen error,
  [../edge-cases.md §20](../edge-cases.md#20-base-path-mismatches)).

Notices are text with an icon, never colour alone, and are announced to screen readers when they
appear during a run ([i18n-a11y.md](i18n-a11y.md)).

## Related

- [UI overview](README.md)
- [Flows](flows.md)
- [URL parameters](url-params.md)
- [i18n and accessibility](i18n-a11y.md)
- [Measurement methodology](../measurement.md)
