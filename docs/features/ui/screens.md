# Screens

[Feature index](../README.md) / [UI](README.md) / Screens

Five screens. For each: purpose, elements, states, notices and responsive notes. Visual design comes
from the design export; this page fixes content and behaviour only. Terms follow the
[glossary](../glossary.md).

## 1. Test (Home) — `/`

**Purpose.** Run a test and read the result at a glance.

**Elements:**

- **Server name** (`server.display_name`).
- **Connection info:** client IP with IP version; suggested context label (`LAN`, `VPN` or none),
  editable; negotiated HTTP protocol (`HTTP/1.1`, `HTTP/2`, `HTTP/3`, or "not reported"); stream
  count, live during a run, with the plateau reason afterwards.
- **Start / Stop** button (one control that changes role); keyboard accessible
  ([i18n-a11y.md §2.4](i18n-a11y.md#24-keyboard)).
- **Phase indicator:** info → idle latency → download → upload, showing skipped phases.
- **Live gauge:** logarithmic, 0.1 Mbit/s to 10 Gbit/s, with a numeric readout; during upload it
  shows the client's sending progress, labelled as such.
- **Live chart:** throughput over time (download; upload `received` solid and `sending` faint),
  optional loaded-latency series toggle.
- **Result metrics** (§6), each with its qualifiers.
- **Packet loss slot** reading "packet loss — not measured" (§6).
- **Data used** live during the run.
- **Notices** area (§7).
- Link "Details" to the Result detail of the finished run.

**States:**

| State | What the screen shows |
| --- | --- |
| Idle | Server name, connection info (from `GET /info`), Start, the last result summary if any, preset in use. |
| Running: info | Phase indicator on info; Start becomes Stop. |
| Running: idle latency | Ping counter, live median. |
| Running: download / upload | Gauge, chart, stream count, protocol, data used; per-direction "measuring" or "warming up" hint; loaded latency live. |
| Done | Result metrics, notices, Details link, Run again. |
| Cancelled | Partial result with `partial — stopped early` and what was covered ([../measurement.md §7.8](../measurement.md#78-worked-example-b--cancellation-mid-request)). |
| Error | What failed and in which phase, completed phases kept, Retry. |
| Offline / retry | `GET /info` fails, or every idle-latency ping is lost ([../measurement.md §10](../measurement.md#10-idle-latency)): "Server unreachable" with Retry; Start disabled until `/info` succeeds. A WebSocket that cannot be opened is **not** offline: the test runs with the HTTP latency fallback and the notice `WebSocket unavailable — HTTP latency fallback`. |
| Auto-start countdown | When `run` is set: a cancellable countdown (3 s) before the test starts ([flows.md §2](flows.md#2-auto-run-from-url)). |

**Responsive notes.** On narrow screens the gauge and Start stay above the fold; the chart collapses
below the metrics; connection info collapses into a single line with a disclosure. The page must
work in portrait on a phone without horizontal scrolling.

## 2. Result Detail — `/result/{id}`

**Purpose.** Everything about one result.

**Elements:**

- All metrics of §6 with full qualifiers, confidence reasons and every notice.
- **Per-phase charts:** download and upload steady-window series (warm-up shaded, unknown upload
  cells as gaps), idle and loaded latency samples per direction.
- **Test parameters:** preset, phases, stream mode and plateau reason, durations, data cap, units,
  warm-up mode, ping count, overhead compensation, protocol, server name and version, timer
  resolution and whether the page was cross-origin isolated.
- **Label and note:** editable, saved to history.
- **Copy summary:** plain-text summary to the clipboard (content rules as the share image).
- **Download share image:** rendered client-side; a preview shows exactly what is included
  ([../security.md §7](../security.md#7-browser-only-history-and-privacy)); option to include the
  label.
- **Delete** (with confirmation) and **Run again** (same settings).

**States:** loaded; not found (unknown id, or history unavailable after a reload) with a link to
History; history unavailable (the detail of the current in-memory result works, editing and
deleting are disabled).

**Responsive notes.** Charts stack vertically; parameters collapse into a disclosure.

## 3. History — `/history`

**Purpose.** Review results stored in this browser.

**Elements:**

- Notice: "Stored only in this browser, for <origin>" with a link explaining per-origin storage
  ([../edge-cases.md §8](../edge-cases.md#8-different-origins-give-separate-histories)).
- **List** of results: date and time, label, download, upload, idle latency, grade, protocol,
  status; sortable by date, download, upload, latency; **filters** by label and date range.
- **Trend chart** of download and upload (and optionally idle latency) over the filtered results.
- **Compare two results:** select two rows; side-by-side metrics with differences and both
  parameter sets, with a warning when they differ in preset, protocol or label.
- **Export** (JSON or CSV, with the "contains client IPs and notes" warning), **Import** (JSON),
  **Delete** selected, **Clear all** (with confirmation).
- On Safari, a hint recommending export ([../edge-cases.md
  §17](../edge-cases.md#17-safari-and-ios-quirks)).

**States:** loading; empty ("No results yet" with a Run test button); populated; filtered with no
match; history unavailable ([../edge-cases.md
§7](../edge-cases.md#7-indexeddb-unavailable-private-mode)); import in progress, import result
(added, skipped as duplicates, rejected with reason).

**Responsive notes.** On narrow screens rows become cards with download, upload and grade; compare
shows one result per column with horizontal paging.

## 4. Settings — `/settings`

**Purpose.** Change how tests run in this browser.

**Elements:**

- **Preset:** Quick, Standard, Extended, Continuous, with a one-line description each.
- **Phases:** toggles for idle latency, download, upload, and the order of download and upload;
  for Continuous, the direction.
- **Streams:** auto, fixed (1–6), single.
- **Duration:** minimum and maximum per direction (defaults from the preset; "custom" when edited);
  for Continuous, an optional **run length** (none by default, 1 minute to 7 days).
- **Data cap:** none or a size.
- **Units:** bits or bytes.
- **Auto-start:** off or on, with the countdown length; cancellable countdown before each auto run.
- **Theme:** system, light, dark. **Language.**
- **Advanced:** warm-up (`auto` or a fixed duration), ping count, overhead compensation (0 by
  default, LibreSpeed presets offered, with the "shown next to every number" note).
- **Reset to defaults** (the server's defaults from `GET /info`).
- **Shareable URL:** a read-only field with a Copy button that encodes the current settings as URL
  parameters ([url-params.md §3](url-params.md#3-shareable-settings-url)).

**States:** clean; modified (Save / Discard); invalid input (inline error per field); saved
(confirmation toast).

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
- **Version** (`server.version`), **licence** (GPL-3.0-or-later), **source link**, **credits**
  (OpenSpeedTest™ trademark note, LibreSpeed, Cloudflare, Apple and the IETF draft).
- Short methodology summary linking to the published docs.

**States:** layers enabled or not; server unreachable (snippets built from the page's own origin).

**Responsive notes.** Snippets wrap with a horizontal scroll inside the code block only.

## 6. Result Metrics, Units and Precision

| Metric | Unit and precision | Qualifiers shown |
| --- | --- | --- |
| Download, upload (headline) | auto-scaled kbit/s, Mbit/s, Gbit/s (or kB/s, MB/s, GB/s), 3 significant digits | status (`insufficient data`, `partial`, `error`), confidence and reasons, overhead compensation when non-zero |
| Peak (per direction) | as above, labelled "peak" | Continuous: "p90, last hour" |
| Idle latency | ms; min, median, p90; whole ms ≥ 10 ms, one decimal below, "< 1 ms" below the timer resolution | path (`websocket` or HTTP), loss percentage |
| Jitter | ms, same precision | — |
| Idle probe loss | %, one decimal | labelled "probe timeouts", never "packet loss" |
| Loaded latency (per direction) | ms; median and p90; increase over idle | label "Loaded latency (WebSocket)" or the fallback source `http-h1-reserved` / `http-h2` / `http-h3`; `unavailable` with reason |
| Bufferbloat grade | letter plus a word: A+ Excellent, A Good, B Mild, C Moderate, D Severe, F Critical | basis (`download+upload` or one direction) |
| HTTP loaded responsiveness | RPM, integer | always labelled "HTTP loaded responsiveness — connection sharing not verifiable" with the protocol; state `measured`, `uncertain`, or `unavailable` with reason ("needs HTTP/2 or HTTP/3 at the reverse proxy", "protocol not reported — treated as HTTP/1.1", "not enough samples") |
| Quality scores | band per experience: streaming, gaming, video calls (bad, poor, average, good, great) | missing input named; note that packet loss is not measured |
| Packet loss | reserved slot: "packet loss — not measured" | link to why ([../measurement.md §18](../measurement.md#18-future-packet-loss-via-webrtcturn)) |
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
- **Limits:** `data cap reached`; `overhead compensation +p %`.
- **Interrupted:** `partial — stopped early`; `upload interrupted by a failed request`;
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
