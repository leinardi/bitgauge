# Design System Upstream Notes

The design export in `docs/design_system/` is never edited in this repository
([docs/README.md](../README.md#design-export)). When the demo parity triage decides that the export
is the side to change (a triage cluster's `upstream` action in `.parity-triage.json`), or when the
Vue app needs a value the export draws only as a literal with no token (the `design-system-guard`
skill), the change is written down here instead, as a note to paste into the Claude Design project,
so that the next export carries it. Once an export with the change has been imported, its note is
removed.

Each note names the triage cluster or the skill it comes from, the kit file and the element, what
the export shows, and what it should show, with the reason; behavior comes from
[`docs/features/ui/`](../features/ui/README.md), visuals from the export's own tokens.

## Notes

### The Upload-Interrupted Failure After Warm-Up

- **Source:** triage cluster `fixture-demo-results`, confirmed: the demo reaches the kit's upload
  value, so its failure moved to 12 s into upload.
- **Kit:** `ui_kits/app/TestScreen.jsx`, the `upload-interrupted` state (`UF = 8.2`), with the
  upload warm-up `UWU = 9.5` it draws through `ubBand(UWU)`.
- **Export today:** the upload fails at 8.2 s, inside its own 9.5 s warm-up band, yet the upload
  keeps 402 Mbit/s, "window up to the failed request at 8.2 s".
- **Wanted:** the failure after the warm-up end plus at least 3 s of steady window, such as at 12 s
  (`UF = 12`), with the chart, the tile and the totals following it; or, failing at 8.2 s, the
  upload as `insufficient data`.
- **Why:** [measurement.md §7.6](../features/measurement.md#76-headline-peak-and-minimum-window)
  counts only the window from warm-up end to `W_end_final`, and gives no number below 3 s of it.

### The Cancelled Slow Download's Gauge Window

- **Source:** triage cluster `content-cancel-slow-window`, decided for the spec: the gauge's window
  follows its values.
- **Kit:** `ui_kits/app/TestScreen.jsx`, the `cancelled-slow` state of the `cancelled-download`
  branch, whose gauge passes no previous window, unlike `cancelled-slow-up`'s `prev`.
- **Export today:** the Cancelled gauge over the 634 kbit/s download is captioned with the start
  window, "log scale · 1 Mbit/s – 10 Gbit/s · auto".
- **Wanted:** the floor window the slow download reached, "log scale · 10 kbit/s – 100 Mbit/s ·
  auto", as `cancelled-slow-up` and the live slow states show it.
- **Why:** [gauge.md](../design_system/components/gauge.md) behavior rules 3 and 6 and
  [measurement.md §14](../features/measurement.md#14-units-and-gauge): the window shifts down after
  the value stays in the bottom decade for 2 s, and a slow link reaches the floor window within two
  shifts.

### The Slow Upload's Chart Total

- **Source:** triage cluster `content-chart-slow-meta`, decided for Vue: one meta rule for every
  running state.
- **Kit:** `ui_kits/app/TestScreen.jsx`, the `slow` state's upload branch, whose chart `meta` is
  `(10 + t).toFixed(1) + ' s'`.
- **Export today:** the live slow upload reads "22.1 s" with no total, while the LAN upload reads
  "22.0 s / 26 s" and every live download "7.5 s / 10 s".
- **Wanted:** the slow upload's elapsed time over its total, as the LAN upload reads it, in the
  chart's meta line and in its summary.
- **Why:** [charts.md](../design_system/components/charts.md) (Chart or table) words the live
  chart's position as elapsed over the phase's length ("7.5 s / 10 s"), and the kit's other running
  states follow it.

### The Live Region's Wording and the Result Summary

- **Source:** triage cluster `a11y-live-status`, decided for the spec:
  [i18n-a11y.md §2.1](../features/ui/i18n-a11y.md#21-live-region-for-the-gauge) and
  [§2.7](../features/ui/i18n-a11y.md#27-screen-reader-result-summary) define what is announced.
- **Kit:** `ui_kits/app/TestScreen.jsx`, the per-state `ann` sentences it fills its one
  `LiveRegion` with (`components/feedback/LiveRegion.jsx`).
- **Export today:** one region reads a sentence per state, with short units and the server named:
  "Latency 3.1 milliseconds. Measuring download.", "Download finished: 612 Mbit/s. Measuring
  upload.", "Upload finished: 438 Mbit/s. Test complete.", "Connection lost during latency.
  Nothing was saved.".
- **Wanted:** the live region announces the phase on change ("Measuring download"), the rate the
  gauge shows at most every 5 s ("Download, 597 megabits per second"; on upload "Upload sending,
  …"), and each finished direction's headline once ("Download result: 612 megabits per second", or
  "Download finished without a number"), all with long unit names. When a result is ready, a
  separate summary region reads it in the order of §2.7: "Test complete. Download 612 megabits per
  second. Upload 438 megabits per second. Idle latency 3.1 milliseconds, jitter 0.4. Data used
  1.3 gigabytes." The stopped and failed states put their ending there too ("Partial result: the
  test was stopped early.", "Test failed. The phases that finished before the error are kept.").
- **Why:** the spec owns accessibility over the export, and screen readers read abbreviated units
  such as Mbit/s badly; the result is one message of its own, not the last phase announcement.

### About in v0.1

- **Source:** triage cluster `content-about-page`, decided for a new About that keeps Vue's page
  with the US spelling "License".
- **Kit:** `ui_kits/app/About.jsx` before v0.3 (`caps.clients` false), and its facts in
  `ui_kits/app/fixtures.js`.
- **Export today:** the sections are eyebrow spans; the facts have a Clients row ("Arrive in
  v0.3"); the version reads "v1.4.0 · a1b2c3d · 2026-09-30"; the credits have no version notes;
  the intro says the server answers the LibreSpeed and OpenSpeedTest protocols and serves a
  networkQuality config; the privacy text says history lives in the browser.
- **Wanted:** h2 section headings ("How it measures", "Privacy", "Credits") in the eyebrow style;
  no Clients row before v0.3; the version as the server reports it, without a "v", and the build
  date through `Intl` ("1.4.0 · a1b2c3d · Sep 30, 2026"); each credit with the version its feature
  arrives in (", from v0.3.", ", from v0.2."); the intro "How to test against this server from other
  speed test clients, and what BitGauge is."; and the privacy text "No accounts, no tracking, no
  ads. The server keeps no results: a result exists only in this browser."
- **Why:** [screens.md §5](../features/ui/screens.md#5-other-clients--about--about) lists the
  facts and makes the privacy line true for v0.1, which has no history;
  [i18n-a11y.md §1.3](../features/ui/i18n-a11y.md#13-number-unit-and-date-formatting) formats dates
  through `Intl`, and §2.8 asks for headings that structure each screen; v0.1 answers none of the
  other clients' protocols.

### About's Unreachable Alert

- **Source:** triage cluster `content-about-unreachable`, decided for an About-specific body.
- **Kit:** `ui_kits/app/About.jsx`, the danger `Notice` shown when the server is unreachable.
- **Export today:** "The commands below are built from this page's address, … BitGauge can't
  check which clients the operator enabled, or the server's name, until the server answers."
- **Wanted:** before v0.3, which has no commands: "BitGauge could not reach the server at <host>,
  so its version and name are unknown until it answers."
- **Why:** v0.1 shows no snippets, and the facts read "— · server unreachable" and "—" while the
  server does not answer.

### Data Used During Idle Latency

- **Source:** triage cluster `content-test-card`, decided for the spec.
- **Kit:** `ui_kits/app/TestScreen.jsx`, the `meta(...)` rows of the latency and early-error
  states.
- **Export today:** data used counts the pings, about 17 kB "so far" while idle latency runs, and
  that count after an error or a stop in it.
- **Wanted:** "—" with no qualifier until the first download byte, as in the connecting state.
- **Why:** data used counts the download and upload transfers only
  ([glossary](../features/glossary.md)); the engine cannot see a probe's bytes on the wire.

### The Connection Strip's Protocol and Streams

- **Source:** triage cluster `content-connection-strip`, decided for a new wording.
- **Kit:** `ui_kits/app/TestScreen.jsx`, the `conn` facts of the connection strip.
- **Export today:** Protocol reads "HTTP/2" in every state: before a run, while connecting and
  during idle latency, and in the upload-interrupted state, whose own notice says the upload ran
  over HTTP/1.1. Streams read "6 auto", the cap, before a run, and the cancelled slow run leaves
  out the plateau reason although its download's ramp stopped at no-gain before the stop.
- **Wanted:** "— not reported" until a run has made a request, and "HTTP/1.1" in the
  upload-interrupted state; Streams "— auto" before a run and after a stop during idle latency,
  when the count is automatic and no direction ran, and
  "2 auto · plateau: no-gain" after the cancelled slow run.
- **Why:** the protocol is read from a request's `nextHopProtocol`
  ([measurement.md §4](../features/measurement.md#4-adaptive-stream-count)), and an automatic
  stream count is known once the ramp starts, so neither is known before a run;
  [screens.md §1](../features/ui/screens.md#1-test-home--) lists "not reported".

### The Base-Path Error Screen

- **Source:** triage cluster `content-basepath-error`, decided for the spec.
- **Kit:** `ui_kits/app/TestScreen.jsx`, the `FullScreenError` of the base-path state.
- **Export today:** the eyebrow "Deployment error"; "This page was opened at /speed/, but the
  server is configured for /"; the rows Page path, Server base path "/ ·
  BITGAUGE_SERVER__BASE_PATH not set" and Check "GET /api/v1/info → 404"; a hint that offers to
  strip the `/speed` prefix at the proxy.
- **Wanted:** the eyebrow "Base path mismatch"; "BitGauge is configured for / but this page was
  served at /speed/."; the rows Page path and Server base path ("/"), and the base path the API
  reports only when it differs; a hint that keeps the prefix on forwarded requests.
- **Why:** [edge-cases.md §20](../features/edge-cases.md#20-base-path-mismatches) gives the
  sentence and the rows. A page that fails the path checks sends no request, so there is no Check
  result; the SPA cannot know whether an environment variable is set; and the sub-path
  instructions say not to strip the prefix, which leaves the page blank.

### The Offline State Without the Server's Settings

- **Source:** triage cluster `layout-offline-state`, decided for the kit's layout with two
  exceptions.
- **Kit:** `ui_kits/app/TestScreen.jsx`, the `offline` state.
- **Export today:** no notice; the preset summary "Standard preset · Auto streams · No data cap";
  the pending phases with their estimates (~2 s, ~10–20 s, ~15–25 s).
- **Wanted:** the danger notice "Server unreachable" with `role="alert"` above the strip; no preset
  summary; the pending phases without estimates.
- **Why:** [screens.md §7](../features/ui/screens.md#7-notices) gives server
  unreachable a danger notice with `role="alert"`, and the preset and the phase durations come
  from the server defaults, which `GET /info` never delivered.

### The Results Tiles' Probe Timeouts and Insufficient-Data Reason

- **Source:** triage cluster `content-results-tiles`, decided for the kit's tiles with two
  exceptions.
- **Kit:** `ui_kits/app/TestScreen.jsx`, the idle latency tile's `IDLE.sub` and the insufficient
  download of the `insufficient` state.
- **Export today:** "0 % probe timeouts"; "Insufficient data — only 1 request contributed within
  the 20 s max".
- **Wanted:** "0.0 % probe timeouts"; "Insufficient data — no steady window within the 20 s max".
- **Why:** [screens.md §6](../features/ui/screens.md#6-result-metrics-units-and-precision) gives
  the probe-timeout share one decimal, and the result object records no count of contributing
  requests, so the reason names the maximum it reached instead.

### The Slow Run's Upload Confidence

- **Source:** triage cluster `content-results-tiles`, an upstream note decided on 2026-10-15.
- **Kit:** `ui_kits/app/TestScreen.jsx`, the upload tile of the `slowdone` state.
- **Export today:** a 210 kbit/s upload on two streams with no confidence qualifier.
- **Wanted:** the Low confidence pill and "low confidence · few samples" on that upload tile, as on
  the live status.
- **Why:** at a few hundred kbit/s the streams added last confirm too few requests before the
  warm-up's cap, so the upload carries `confidence: low` (`insufficient-samples`), as
  [measurement.md §19.1](../features/measurement.md#191-slow-link-budget-300-kbits-300-ms-rtt-standard)
  works out, and the demo's slow link reports it.

### The Upload-Interrupted Alert's Deployment Guide Link

- **Source:** triage cluster `content-upload-interrupted-alert`, decided for the kit's body with
  Vue's link kept.
- **Kit:** `ui_kits/app/TestScreen.jsx`, the notice of the `upload-interrupted` state.
- **Export today:** the alert's body with no action.
- **Wanted:** a "Deployment guide" link after the body, as the other deployment notices carry.
- **Why:** the hint asks for HTTP/2 at the proxy, which the deployment guide explains how to set
  up.
