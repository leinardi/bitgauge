# Screens

[Feature index](../README.md) / [UI](README.md) / Screens

Five screens. For each: purpose, elements, states, notices and responsive notes. Visual design comes
from the design export; this page fixes content and behavior only. Terms follow the
[glossary](../glossary.md).

## 1. Test (Home) — `/`

**Purpose.** Run a test and read the result at a glance.

**Elements:**

- **Server name** (`server.display_name`), in the persistent header with the page's host and a
  reachability indicator (dot plus text for screen readers: connected or unreachable).
- **Connection info:** client IP with IP version; suggested context label (`LAN`, `VPN`, an operator label or none),
  editable; negotiated HTTP protocol (`HTTP/1.1`, `HTTP/2`, `HTTP/3`, or "not reported", as it is
  before a run has made a request); stream count, live during a run ("—" before one when the
  count is automatic), with the plateau reason afterwards.
- **Settings summary:** the settings that differ from the server defaults, one chip each (for
  example "Extended", "4 streams", "Cap 500 MB"), or the preset name when nothing differs, with
  an Edit link to Settings. The run's settings are compared with the server defaults under the
  run's preset, so a preset's own durations, streams and ping count are not changes; the chips
  follow the order of Settings' changed list: preset, Continuous direction, run length, phases,
  streams, download duration, upload duration, data cap, units, warm-up, ping count and overhead
  compensation. Theme, language, the label and Auto-start do not change a run and have no chip. It summarizes against the server's settings, so it shows only while
  they are known and the server is reachable: before `GET /info` has answered, offline, and after
  an error whose re-check of `/info` fails, the row, Edit included, is absent.
- **Start / Stop** button (one control that changes role, each with its label: Start "Start
  test", Stop "Stop test", Run again "Run again", Retry "Retry test", Start now "Start now");
  keyboard accessible, including the page-wide Enter shortcut
  ([i18n-a11y.md §2.4](i18n-a11y.md#24-keyboard)).
- **Phase indicator:** idle latency → download → upload in the configured order. The info phase
  is shown as "Connecting…" on the first step rather than as a step of its own. Each step is
  pending, active (with progress or time left), done, failed, cancelled, skipped, or capped (the
  data cap ended it). A phase that reaches its maximum without a value is done, with its
  direction's status as the detail: "done · insufficient data".
- **Live gauge:** the auto-windowed logarithmic gauge of
  [../measurement.md §14](../measurement.md#14-units-and-gauge), with a numeric readout and a
  caption naming the current window; during idle latency it switches to milliseconds; during
  upload it shows the client's sending progress, labeled "sending".
- **Live chart:** throughput over time (download; upload `received` solid and `sending` faint),
  phase separators, event marks (extended, data cap, cancelled, error), and the loaded-latency
  series on its own axis. Its legend entry, "Latency under load", is the series' toggle (a button,
  pressed while the series is shown), listed in every state, before the first loaded ping too.
  Warm-up samples are drawn over a shaded band until warm-up ends: they exist only in memory and
  count toward no number. During idle latency it is the **latency samples** chart instead: each
  ping's round-trip time in milliseconds on a linear axis, over the phase's time, a lost ping a gap
  and the warm-up ping not drawn, with the "now" line and the phase time against its estimate
  ("1.4 s / ~2 s"). A run that stops or fails during idle latency keeps it, marked "Cancelled" or
  "Connection lost", with the time it stopped at.
- **Result metrics** (§6), each with its qualifiers. While a direction runs, its tile shows
  "warming up" until warm-up ends, then the steady-window average and peak so far. A direction's
  HTTP loaded responsiveness is settled when the direction ends
  ([../measurement.md §12.3](../measurement.md#123-path-b-procedure)), so a standard run shows it
  from then on: the download's while upload runs, "—" for a direction still to run.
- **Data used** and **duration**: data used live during the run, "—" until the first byte and
  qualified "so far" (while upload runs after a download that ended without a number, "so far ·
  download" with the download's own bytes); the duration counts up from the run's start,
  qualified "elapsed", until the result gives it. After an error, data used is qualified "not
  saved".
- **Browser**: the browser's family, major version and operating system ("Firefox 131 · Linux"),
  as the result records them ([../measurement.md §17](../measurement.md#17-result-object)), shown
  in every state from page load: idle, during a run, Continuous included, and after it; "—" when
  the browser family is not recognized.
- **Notices** area (§7).
- **Save bar** after a `complete` run: "Saved to history", an inline label
  field with suggested labels (the context label and the 5 most recent distinct labels from
  history), Share and Details. Share opens the share panel of §2 as a focus-trapped dialog
  ([flows.md §8](flows.md#8-sharing)).
- **Keep in history** for a `partial` or `error` result with at least one finished phase, or with
  the partial idle latency a stop during it keeps: such results are not saved unless the user
  keeps them ([flows.md §4](flows.md#4-cancel-mid-test)).
- Link "Details" to the Result detail of the finished run.
- **Download JSON** of the finished result: the single result object in the JSON export format
  of [../technical-stack/frontend.md §5](../technical-stack/frontend.md#5-history-module-idb)
  (`results` with one entry), with the same "contains client IPs and notes" warning as the History
  export. It works without history, for `complete`, `partial` and `error` results, and it is the
  accuracy harness's extraction path
  ([decisions.md §36](../technical-stack/decisions.md#36-harness-extraction--download-json-on-the-test-screen)).
  The file is named `bitgauge-<YYYY-MM-DD>-<HHMM>.json` after the result's start in the browser's
  local time, as the design export's kit names it, and its `exportedAt` is the moment of the
  download as an ISO 8601 timestamp.
- **Last result line** in the idle state: when, headline numbers and label of the latest saved
  result, linking to its detail.
- **Continuous live view**, in place of the direction's tile while a Continuous run runs
  ([flows.md §7](flows.md#7-continuous-mode)): the run-wide minimum, average and maximum; the
  "p90, last hour"; the loaded latency of the last minute; data used with its rate; and the elapsed
  time against the run length with the run's end time, or the elapsed time alone without a run
  length. The rates read "—" until the run has 3 fully known 1 s cells, never 0
  ([../measurement.md §15](../measurement.md#15-continuous-mode)). The live chart shows the
  retention tier the elapsed time picks. The live notices hold only the latest `data-used` notice,
  which names the next threshold ("The next notice appears at 10 GB"); the finished result lists
  every one. The grade, the HTTP loaded responsiveness and the quality scores appear only in the
  finished result.

**States:**

| State | What the screen shows |
| --- | --- |
| Idle | Server name, connection info (from `GET /info`), Start, the last result line if any, the settings summary. |
| Running: info | "Connecting…" on the first phase step and in the gauge readout; Start becomes Stop. |
| Running: idle latency | Gauge in milliseconds, ping counter, live median, latency samples chart. |
| Running: download / upload | Gauge, chart, stream count, protocol, data used; per-direction "measuring" or "warming up" hint; loaded latency live. |
| Done | Result metrics, notices, save bar, Details link, Download JSON, Run again. |
| Running: Continuous | Idle latency first unless the phases leave it out, then the Continuous live view; Stop ends the run. |
| Done: Continuous | With at least 3 fully known 1 s cells since the steady start, `complete`: the Done state, saved automatically, the direction's run-wide numbers and its "p90, last hour", with no `partial — stopped early`. With fewer, a stop right after warm-up included, `partial` with the direction `insufficient-data`: the Cancelled state's Keep in history and Download JSON ([../measurement.md §15](../measurement.md#15-continuous-mode)). |
| Cancelled | Partial result with `partial — stopped early` and what was covered ([../measurement.md §7.8](../measurement.md#78-worked-example-b--cancellation-mid-request)); an interrupted direction shows a number only when its confirmed steady window meets the minimum ([../measurement.md §7.6](../measurement.md#76-headline-peak-and-minimum-window)), otherwise "insufficient data". Not saved; Keep in history and Download JSON offered. |
| Error | What failed and in which phase, completed phases kept, the failed direction with status `error` and no number, Retry. Not saved; Keep in history and Download JSON offered. |
| Offline / retry | `GET /info` fails, or every idle-latency ping is lost ([../measurement.md §10](../measurement.md#10-idle-latency)): "Server unreachable" with Retry and the time to the next automatic check ([flows.md §1](flows.md#1-first-run)); Start disabled until `/info` succeeds; the phases and the metrics stay, pending and empty; no settings summary. A WebSocket that cannot be opened is **not** offline: the test runs with the HTTP latency fallback and the notice `WebSocket unavailable — HTTP latency fallback`. |
| Auto-start countdown | When `run` is set, or the stored Auto-start is on: a cancellable countdown (3 s, or the Auto-start setting's length) before the test starts ([flows.md §2](flows.md#2-auto-run-from-url)). |

**Responsive notes.** On narrow screens the gauge and Start stay above the fold, with Start full
width; the chart collapses below the metrics; connection info keeps its grid. Navigation becomes a
compact header plus a bottom tab bar (Test, History, Settings, About). The page must work in
portrait on a phone without horizontal scrolling.

## 2. Result Detail — `/result/{id}`

**Purpose.** Everything about one result.

**Elements:**

- Header: breadcrumb back to History, the label (editable inline), context label, date and time
  (absolute on hover), preset and server name.
- All metrics of §6 with full qualifiers, and a **confidence and notices** card listing every
  confidence reason and notice, each with an icon and text.
- **Continuous results:** the direction that ran shows its headline (the run-wide average) with
  its minimum, maximum and "p90, last hour"; the other direction reads `skipped`, worded "not run ·
  Continuous runs one direction", never "not measured". A run longer than 7 days notes that only
  its last 7 days were saved ([../measurement.md §15](../measurement.md#15-continuous-mode)).
- **Per-phase charts:** download and upload steady-window series with their event marks, each
  with the direction's loaded-latency samples on a second axis in milliseconds, and the idle
  latency samples. Each throughput chart and its loaded latency are drawn on the direction's own
  `series` timeline, where `loadedLatency.series` already lies
  ([../measurement.md §11.5](../measurement.md#115-time-base-and-series)). Warm-up is drawn as a
  marked, excluded interval (its samples are not stored); unknown upload cells and failure gaps are
  gaps. The stored data behind them is specified in
  [../measurement.md §17](../measurement.md#17-result-object).
- **Chart or table** toggle per chart. The table is the charts' text alternative: rows of 2 s
  windows from warm-up end on the same timeline, throughput as bytes over known time (a window with
  no known time shows "—", a shorter edge row shows its real span) and, in a column of its own,
  the median loaded latency of the samples in the window ("—" when it holds none). When the stored
  cells are coarser than 2 s (Continuous), one row per stored cell, with the header naming the cell
  size.
- **Test parameters:** preset, phases and order, stream mode, count and plateau reason, each
  direction's duration with its configured bounds (when the result records them; a direction the
  user stopped reads its duration to the stop and "stopped by you"; one without a steady window
  reads the instant its error or the data cap ended it, or its maximum when it ran to it without a
  steady window), data cap with the data used,
  units, warm-up mode with where each direction's warm-up ended (or that the user stopped it in
  warm-up), ping count, overhead compensation, protocol, server name and version, browser, client
  IP, timer resolution and whether the page was cross-origin isolated.
- **Label and note:** editable, saved with the result in history as they change.
- **Share panel:** always visible beside the metrics: a preview of the share image and of the
  copied text, showing exactly what each contains
  ([../security.md §7](../security.md#7-browser-only-history-and-privacy)), an "include label"
  option (off by default), Download image, Copy summary and, where the Web Share API is available,
  Share ([flows.md §8](flows.md#8-sharing)). A Continuous result is one direction block, its
  headline with its qualifiers and no peak, as the export's share panel draws it
  ([share-panel.md](../../design_system/components/share-panel.md)). The HTTP loaded
  responsiveness and the quality scores stay off the share image and the copied summary.
- **Download JSON**, **Delete** and **Run again** (same settings). Delete removes the result from
  history at once and shows an undo toast for 8 s (§8), as on History; the page then shows "Result
  deleted" with a link to History in place of the result, and the toast's Undo puts the result
  back and shows it again.

**States:** loaded; deleted, until the undo toast's Undo; not saved (the id is not in history but
matches the result of the run just finished, which the Test screen still holds in memory: a
`partial` or `error` result not kept, or any result while history is unavailable; it is shown with a
"not saved" badge, Download JSON and Share work, and editing and deleting are disabled with the
reason); not found (any other id, or history unavailable after a reload) with a link to History;
history unavailable (as not saved for the current in-memory result).

**Responsive notes.** One column; charts stack vertically; the share panel follows the charts;
parameters collapse into a disclosure.

## 3. History — `/history`

**Purpose.** Review results stored in this browser.

**Elements:**

- Notice: "Stored only in this browser, for <origin>" with a link explaining per-origin storage
  ([../edge-cases.md §8](../edge-cases.md#8-different-origins-give-separate-histories)).
- **Header:** the number of stored results and, where `navigator.storage.estimate()` is
  available, the storage this origin uses. There is no retention limit: a result stays until it is
  deleted.
- **List** of results: date and time, label, context label, download, upload, idle latency,
  jitter, grade, protocol, status; every column sortable, newest first (`startedAt` descending) by
  default, the sorted column header carrying `aria-sort`; a row action menu (open, delete). On a
  focused row, Space toggles its selection and Enter opens it. The list shows the first 100
  results of the filtered, sorted set, then "Showing 100 of 2,140" with a **Show 100 more**
  button (fewer when fewer are left), which adds the next ones below and moves the focus to the
  first added row. A change of filter or sort starts again from 100. The header's count, the filter chips' counts, the trend chart and export of the
  current filter cover every filtered result, not only those shown.
- **Filters:** chips by label and by context label, each with its count; a date range (last 7,
  30 or 90 days, each that many calendar days ending today in the browser's time zone, so the last
  30 days of Oct 8 start on Sep 9; all time; or a custom range of two date fields); a search over
  labels and notes.
  The filter lives in the query string, so Back and a reload keep it: `labels` and `contexts`
  (one occurrence per selected chip), `range` (`7d`, `30d`, `90d`, `all` by default, or a custom
  `<from>..<to>` of local dates as `YYYY-MM-DD`, both inclusive) and `q`. None of them is a name
  of the URL parameters of [url-params.md §2](url-params.md#2-parameters), which apply on any
  route; in particular the label filter is not `label`, which would pre-fill the next result's
  label. A value the screen cannot read (an unknown `range`, a date that is not a local date) is
  dropped from the query string, and a custom range whose start is after its end is swapped; the
  correction replaces the history entry and shows no notice.
- **Trend chart** (uPlot) over the filtered results: small multiples of download and upload (log
  scale) and idle latency (linear). Results whose status is not `complete` are drawn as hollow
  markers, with a legend entry. Axes follow the date filter and the data, with minimum spans; a
  single result shows as a labeled marker with "Trends appear from the second result." See
  [components/charts.md § Trend chart axes](../../design_system/components/charts.md#trend-chart-axes).
- **Selection bar** once rows are selected: the selection count, Compare (exactly two), Delete
  selected (with an undo toast), Clear selection.
- **Compare two results**, in a focus-trapped dialog: side-by-side metrics with the change per
  metric, worded as better or worse with an icon, and both parameter sets including the browser; a
  warning when they differ in preset, protocol or label, naming the difference; Copy comparison.
  The older result (by start time) is A and the newer B, and each change is B's against A. A rate
  (download, upload, peak) within ±2 % of A's and a latency (idle median, jitter, loaded latency)
  within 1 ms of A's read "same"; grades compare by their order, A+ best; any other difference in
  those metrics is better or worse. A metric absent on either side (a direction without a number,
  no grade) reads "not comparable". The other rows (probe timeouts, data used, duration) show both
  values without a judgment. The comparison also has:
  - one HTTP loaded responsiveness row per direction: the RPM is compared, higher being better and
    within ±2 % "same", only when both sides are `measured`; otherwise the row shows both states and
    reads "not comparable";
  - one row per quality-score experience (streaming, gaming, video calls), compared by band order,
    `great` best and `bad` worst; an experience scored on one side only reads "not comparable".
- **Delete** removes the rows at once and shows an undo toast for 8 s, whose Undo puts them back;
  **Clear all** has no undo.
- **Export** (JSON or CSV, each for all results or the current filter, with the "contains client
  IPs and notes" warning), **Import** (JSON; a CSV is refused with "CSV exports are summaries and
  can't be restored"), **Clear all** (with a confirmation naming the count and offering "Export
  JSON first"). The import rules and its summary are in
  [../technical-stack/frontend.md §5](../technical-stack/frontend.md#5-history-module-idb).
- On Safari, a hint recommending export ([../edge-cases.md
  §17](../edge-cases.md#17-safari-and-ios-quirks)).
- Recent labels, offered by the Test screen's label field, are the 5 most recent distinct labels
  of the stored results.

**States:** loading (placeholder chips, trend and rows under a status that announces "Loading
history"; Import JSON waits, disabled, until the store is open, since an import cannot write before
it); empty ("No results yet" with Start a test and Import JSON); populated; filtered with no match
(with Clear filters); history unavailable ([../edge-cases.md
§7](../edge-cases.md#7-indexeddb-unavailable-private-mode)); import in progress ("Checking 9 of 16
results…" with a progress bar named Import progress, and Cancel, which stops the import before
anything is written), import result (added, skipped as duplicates, rejected with each record's
position and reason, a label over 64 characters among them, or the whole file refused with its
reason).

**Responsive notes.** On narrow screens rows become cards with label, date, download, upload,
latency and grade, with a sort control; the trend shows one metric at a time with a selector;
compare shows one result per column with horizontal paging.

## 4. Settings — `/settings`

**Purpose.** Change how tests run in this browser.

**Elements:**

Settings are saved in this browser as each valid change is made; there is no Save or Discard
step. A setting that differs from the server default is marked "changed" and has its own reset.
Only the settings the user set are stored, under the `localStorage` key `bitgauge.settings.v1`
([../technical-stack/frontend.md §4](../technical-stack/frontend.md#4-state-ownership)); the
effective settings are the URL parameters over the stored settings over the server defaults
([url-params.md §1](url-params.md#1-rules)).

- **Preset:** Quick, Standard, Extended, Continuous, as cards with a one-line description each
  stating streams, durations and ping count
  ([../measurement.md §8.5](../measurement.md#85-presets)). The Continuous card is a preset like
  the others.
- **Phases:** toggles for idle latency, download, upload (at least one stays on), and the order of
  download and upload; for Continuous, the idle-latency toggle and the one direction it runs,
  download by default, stored as `continuousDirection` only when the user picks upload or picks
  download over another stored value.
- **Streams:** auto, fixed (1–6), single.
- **Duration:** minimum and maximum per direction in whole seconds, 5–600 s, the minimum at most
  the maximum (defaults from the preset; "custom" when edited, and kept with no question when
  another preset is chosen); for Continuous, in place of the durations, an
  optional **run length**, as the design export's kit draws it: a switch, then a number and a
  minutes, hours or days select. Off by default, meaning none; switched on, the number starts empty
  and the select at hours, and a value is a whole number of its unit from 1 minute to 7 days.
  Switching it off clears it. It is stored as `runLengthS` in whole seconds, absent meaning none.
  A stored value shows in the largest of days, hours and minutes it is a whole number of; one that
  is not a whole number of minutes shows in minutes with up to two decimals until the user changes
  it, as the data cap's non-whole MB does. The URL's `duration` stays whole seconds, 60–604800
  ([url-params.md §2](url-params.md#2-parameters)).
- **Data cap:** none or a whole number of MB (decimal, 10^6 bytes) from 2 to 100000; 1 MB is
  below the 1 MiB floor of a data cap
  ([../configuration.md §2.3](../configuration.md#23-test-defaults)). A server default that is not
  a whole number of MB shows with up to three decimals until the user changes it. Switched on, the
  cap starts from the last size shown, 500 MB when there was none.
- **Result label:** an optional label, at most 64 characters, that pre-fills the label of every
  result in this browser, as the `label` URL parameter does for one page load; empty by default.
- **Units:** bits or bytes.
- **Auto-start:** off or on, with the countdown length, 1–30 s (3 s by default); cancellable
  countdown before each auto run. Stored on, it acts as `run=1` on every load of the Test screen;
  a `run=0` in the URL wins for that load.
- **Theme:** system, light, dark (also switchable from the header). **Language:** the shipped
  locales only.
- **Advanced** (collapsed by default): warm-up (`auto` or a fixed 1–60 s, from 2 s), ping count
  (6–200), overhead compensation (0–20 %, 0 by default, LibreSpeed presets offered, with the "shown
  next to every number" note).
- **Changed from defaults:** a list of every changed setting with its default, its value and a
  reset each, plus **Reset all to defaults** (the server's defaults from `GET /info`, after
  confirmation).
- **Shareable URL:** a read-only field with a Copy button that encodes the current settings as URL
  parameters, with an "include `run=1`" option, and a "Not in the link" line naming the changed
  settings a link cannot carry ([url-params.md §3](url-params.md#3-shareable-settings-url)).

**States:** defaults; changed (markers and the changed list); invalid input (inline error on the
field, value not saved; focus is not moved, and Tab leaves the field as usual); saved (the change applies to the next test).

**Responsive notes.** One column on narrow screens; Advanced collapsed by default.

## 5. Other Clients / About — `/about`

**Purpose.** How to use BitGauge from other clients, and what BitGauge is.

**Elements:**

- **Copyable snippets**, each shown only when its layer's flag is on (`compat` in `GET /info`),
  otherwise a note that the operator can enable it. Every URL in them starts with the
  `<base URL>`, the page's `location.origin` followed by the base path without its trailing `/`
  (`https://speed.example.lan/speed` with `base_path: /speed`), and their content follows the
  compatibility page exactly:
  - `librespeed-cli`: the `bitgauge.json` server-list JSON, with this server as entry `1`, and the
    command lines `librespeed-cli --local-json bitgauge.json --server 1 --no-icmp --chunks 8 --json`
    and `librespeed-cli --server-json <base URL>/.well-known/librespeed --server 1 --no-icmp`
    ([../compatibility.md §2.3](../compatibility.md#23-librespeed-cli-server-list));
  - the OpenSpeedTest UI `?Host=` URL, `<your OpenSpeedTest UI>/?Host=<base URL>`, with the note about
    its results link ([../compatibility.md §1.3](../compatibility.md#13-client-usage));
  - `networkQuality -C <base URL>/nq/config` and its verbose form with `-v` ([../compatibility.md
    §3.5](../compatibility.md#35-client-usage)). On a page that is not `https` the snippet carries
    a note that networkQuality needs HTTPS through the reverse proxy (or `server.public_url`), so
    the URL shown may not be the one to use ([../compatibility.md
    §3.3](../compatibility.md#33-absolute-url-construction)).
- **About BitGauge:** server name, **version** (`server.version`) with build commit and date
  (`server.commit`, `server.buildDate`), **license** (GPL-3.0-or-later), **source link**.
- **Privacy:** no accounts, no tracking; the server keeps no results: they and the history exist
  only in this browser.
- Short methodology summary linking to the published docs.

The screen has no credits: the projects BitGauge learns from, and the trademark notes, are
credited in the README and the docs ([../technical-stack/decisions.md
§33](../technical-stack/decisions.md#33-third-party-code--ideas-and-protocol-compatibility-only)).

**States:** layers enabled or not; server unreachable (snippets built from the page's own origin).

**Responsive notes.** Snippets never wrap: a long line scrolls horizontally inside its code block,
and the page itself never scrolls sideways.

## 6. Result Metrics, Units and Precision

| Metric | Unit and precision | Qualifiers shown |
| --- | --- | --- |
| Download, upload (headline) | auto-scaled kbit/s, Mbit/s, Gbit/s (or kB/s, MB/s, GB/s), 3 significant digits | direction status (`insufficient-data` shown as "insufficient data", `partial` (stopped, always with its number), `skipped`, `error`; `measured` shows the number), confidence and reasons, overhead compensation when non-zero |
| Peak (per direction) | as above, labeled "peak" (the p90 of the steady window, never a maximum); live, the steady-window p90 so far, hidden during warm-up | Continuous: "p90, last hour" |
| Minimum and maximum (Continuous) | as above, run-wide over fully known 1 s cells | "run-wide"; "—" while absent |
| Idle latency | ms; min, median, p90; whole ms ≥ 10 ms, one decimal below, "< 1 ms" below the timer resolution | path (`websocket` or HTTP), loss percentage |
| Jitter | ms, same precision | described as the mean of consecutive differences |
| Idle probe loss | %, one decimal | labeled "probe timeouts", never "packet loss" |
| Loaded latency (per direction) | ms; median and p90; increase over idle | Continuous: "last hour"; label "Loaded latency (WebSocket)" or the fallback source `http-h1-reserved` / `http-h2` / `http-h3`; "vs idle over WebSocket" (or HTTP) when idle latency ran on the other path; "no idle latency" in place of the increase when idle latency has no median; `unavailable` with reason (no steady window, fewer than 10 samples, HTTP/1.1 reservation not held, no latency probe) |
| Bufferbloat grade | letter plus words: A+ Minimal, A Low, B Mild, C Moderate, D High, F Severe bufferbloat | basis (`download+upload` or one direction); without a grade, "Not graded" and the one reason, the same on every screen: no idle latency, else no loaded latency, else no gradable direction, and test incomplete when an error ended the run before any direction measured its loaded latency |
| HTTP loaded responsiveness | RPM, integer | always labeled "HTTP loaded responsiveness — connection sharing not verifiable" with the protocol; state `measured`, `uncertain`, `unavailable_h1` ("needs HTTP/2 or HTTP/3 at the reverse proxy", or "protocol not reported — treated as HTTP/1.1") or `unavailable_insufficient` ("not enough samples"); the Result detail adds TM95 and the samples, and states "TM95 equals the plain mean" when `trimmed` is 0; for `unavailable_h1` the Test screen's direction rows read "—" beside the note that says why, and the Result detail names the state ("unavailable") |
| Quality scores | band per experience: streaming, gaming, video calls (bad, poor, average, good, great), each band with an icon and its name | missing input named; basis when only one direction has a loaded-latency increase ("download only"); note "upper bound: packet loss is not measured" ([../measurement.md §18](../measurement.md#18-packet-loss)) |
| Data used | decimal kB, MB, GB, 3 significant digits | — |
| Duration | s, one decimal | — |
| Browser | "<name> <major> · <os>"; "—" when the family is not recognized | — |
| Protocol, streams | `HTTP/1.1`, `HTTP/2`, `HTTP/3`; stream count and plateau reason | — |

Definitions: [../measurement.md §9–§17](../measurement.md#9-final-value).

## 7. Notices

Notices appear in the notices area of the Test screen (live where relevant) and in the Result
detail, each with a short explanation and, where useful, a link to the docs. The full list is
[../measurement.md §16](../measurement.md#16-confidence-and-notices); the UI groups them:

- **Duration:** `test extended`, one notice naming the extended direction, or both
  directions when both extended (the engine carries one per direction, [../measurement.md §16](../measurement.md#16-confidence-and-notices);
  the notice shown for the download grows to name the upload when that extends too);
  `insufficient data` with an "Try Standard/Extended" action, titled by its direction
  ("Download: insufficient data"), its body naming the maximum the direction reached, the data it
  used, the direction still running while the run goes on, and what the offered preset allows:
  "Download reached its 20 s maximum without a confirmed steady window long enough for a number.
  50 kB used. Upload continues; Extended allows up to 40 s per direction." The action follows only
  a direction that reached its maximum: one the data cap ended says so and offers no larger preset
  ([../measurement.md §8.6](../measurement.md#86-shortfall)), and a stopped one reads as stopped.
- **Confidence:** `low confidence` with reasons; `cpu-bound` ("limited by this device's CPU");
  `browser upload limit` with a "Known browser limits" link to the docs.
- **Limits:** `data cap reached`; `server stream limit — N streams`; `server rate limit` or
  `server busy`, its body saying whether the direction waited and continued; `data used: N GB`
  (Continuous: live, only the latest, naming the next threshold; in the result, every one);
  `overhead compensation +p %`.
- **Settings:** `URL parameter ignored`, naming each invalid parameter.
- **Interrupted:** `partial — stopped early` (a Continuous run that ends with at least 3 fully known
  1 s cells is `complete` instead, and one with fewer is `partial`, a stop right after warm-up
  included); `upload interrupted by a failed request`;
  `server restarted`; `network changed`; `page was hidden during the test`.
- **Connectivity:** `server unreachable` with Retry; `WebSocket reopened`;
  `WebSocket unavailable — HTTP latency fallback`; `HTTP/1.1 probe reservation active — 5 streams`.
- **Deployment:** `proxy buffering suspected`; `response compression detected`;
  `timer throttling detected`; `base path mismatch` (full-screen error,
  [../edge-cases.md §20](../edge-cases.md#20-base-path-mismatches)).

Notices are text with an icon, never color alone, and are announced to screen readers when they
appear during a run ([i18n-a11y.md](i18n-a11y.md)). Their tones: **info** for test extended,
server stream limit, server rate limit and server busy, overhead compensation, browser upload
limit, WebSocket reopened, WebSocket unavailable, HTTP/1.1 probe reservation and data used;
**warn** for low confidence, cpu-bound, data cap reached, insufficient data, URL parameter
ignored, proxy buffering suspected, response compression detected and timer throttling detected;
**danger**, with `role="alert"`, for server unreachable, upload interrupted and base path mismatch;
**neutral** for partial — stopped early, server restarted, network changed and page was hidden.
The Error state's message (what failed and in which phase) is not a notice, but takes the same
**danger** tone with `role="alert"`.

## 8. Toasts

A toast confirms an action the user just took, or says that it failed. It floats at the bottom
right over the page, taking no room in it, above the narrow layout's tab bar. Each has a tone with
its icon, a title that is one short sentence ending in a period, an optional message line, an
optional action and a Dismiss button; it is announced politely, once, when it appears.

- **Undo toasts**, info tone, shown for 8 s with Undo:
  - Delete on History and on the Result detail: "Result deleted." or "N results deleted.", with
    the trash icon and the line "Undo within N s.", which counts the 8 s down each second; the
    countdown is not announced again as it changes. The Result detail's Undo then confirms
    "Result restored." in the ok tone.
  - Keep in history on the Test screen: "Kept in history as partial." (or "as error."), with the
    history icon; its Undo confirms "Removed from history.".
- **Done**, ok tone: "Summary copied.", "Comparison copied.", "Image downloaded." with the file
  name, and, on the Result detail, "JSON downloaded." with the file name and "contains client IP
  and notes".
- **Failed**, danger tone: the browser refused to store a kept result, could not make the share
  image, or a stored result failed validation so the History export was not created.

## Related

- [UI overview](README.md)
- [Flows](flows.md)
- [URL parameters](url-params.md)
- [i18n and accessibility](i18n-a11y.md)
- [Measurement methodology](../measurement.md)
