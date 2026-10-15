# Design System Upstream Notes

The design export in `docs/design_system/` is never edited in this repository
([docs/README.md](../README.md#design-export)). When the demo parity triage decides that the export
is the side to change (a triage cluster's `upstream` action in `.parity-triage.json`), or when the
Vue app needs a value the export draws only as a literal with no token (the `design-system-guard`
skill), the change is written down here instead, as a note to paste into the Claude Design project,
so that the next export carries it. Once an export with the change has been imported, its note is
removed.

Each note names the triage cluster or the skill it comes from, the kit file and the element, what
the export shows, and what it should show, with the reason; behaviour comes from
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
- **Why:** [gauge.md](../design_system/components/gauge.md) behaviour rules 3 and 6 and
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
