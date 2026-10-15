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
