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

- **`v02-fixture-slowdone-unstable`**, `ui_kits/app/TestScreen.jsx`, state `slowdone`: the
  upload tile's sub line and the connection strip read `2 streams · plateau: no-gain`. They should
  read `2 streams · plateau: floor-limited`. On the kit's 210 kbit/s upload, a trial to 4 streams
  would give each about 6.4 KiB/s, under the 8 KiB/s floor, so a ramp that kept its second stream
  skips it as `floor-limited`
  ([measurement.md §8.2](../features/measurement.md#82-ramp-auto-mode--baseline-trial-settle-compare));
  `no-gain` needs one stream to fill the link within 5 %, which a 48 ms round trip per request
  cycle leaves on the bound. The download keeps `no-gain`.
- **`v02-date-format`** (also `v02-history-table-geometry`, `v02-result-header-geometry`),
  `ui_kits/app/History.jsx` (the rows' dates, the trend's range), `ResultDetail.jsx` (the header's
  date, the breadcrumb) and `TestScreen.jsx` (the save bar's time): dates and times are literal
  ISO, en-GB and 24-hour strings ("2026-10-08 08:41", "17 Sep – 8 Oct", "Thu 8 Oct 2026 ·
  14:02:11", "Saved to history 14:02:11").
  They should be formatted with `Intl.DateTimeFormat` in the active locale and the browser's time
  zone (en: "Oct 8, 2026, 2:02 PM", "Sep 17 – Oct 8"), each in a `<time datetime>` element
  ([i18n-a11y.md §1.3](../features/ui/i18n-a11y.md#13-number-unit-and-date-formatting)). The
  History table's Date column then takes the locale's width, and its value columns, rows and the
  Result header's meta line follow it.
- **`v02-loaded-stopped-cases`**, `ui_kits/app/App.jsx` (`LL_GAPS`), `TestScreen.jsx` and
  `ResultDetail.jsx`, the loaded-latency cases `ll-no-steady-window` and `ll-no-probe-path`: both
  are drawn on the complete LAN run, saved, with the upload's loaded latency marked "no steady
  window" or "no latency probe". A complete result always has a steady window in each direction
  and no direction as short as the WebSocket's close sequence
  ([measurement.md §11.1](../features/measurement.md#111-path-a--websocket-echo-bufferbloat-source),
  [§11.4](../features/measurement.md#114-loaded-latency-statistics-and-availability)), so both
  should be drawn on a run stopped in the upload: partial, not saved, with Keep in history.
  `ll-no-steady-window` stops 3.1 s into the upload, before its window; `ll-no-probe-path` loses
  the WebSocket in the download, its reopening unanswered, and stops 0.8 s into the upload.
- **`v02-history-search-narrow`** (also `v02-history-narrow-geometry`), `ui_kits/app/History.jsx`,
  the filter bar: the search field is rendered on desktop only. It should stay on narrow screens
  too: the filter bar has search, and the responsive notes of
  [screens.md §3](../features/ui/screens.md#3-history--history) change the rows, the trend and
  Compare, not the filters. The narrow card list then sits under the search field.
- **`v02-result-confidence-card`** (also `v02-result-confidence-geometry`),
  `ui_kits/app/ResultDetail.jsx`, the Confidence and notices card: it lists per-run reasons ("Both
  directions reached the 6-stream cap…", "94 % of upload time known — 0.4 s unknown after a failed
  request…"). It should give one confidence line per direction in the terms of
  [measurement.md §16](../features/measurement.md#16-confidence-and-notices): normal, low with its
  reasons, or cpu-bound (en: "Download confidence: normal — Warm-up ended at 6.5 s and the steady
  window covered 3.5 s."), then every notice
  ([screens.md §7](../features/ui/screens.md#7-notices)). The spec defines no known-time reason,
  so "94 % of upload time known" goes. The card's height follows its lines.
- **`v02-result-probe-precision`**, `ui_kits/app/ResultDetail.jsx`, the Idle latency tile: its note
  reads "min 2.4 · p90 4.1 ms · WebSocket · 0 % probe timeouts". It should give the probe timeouts
  with one decimal, "0.0 % probe timeouts", as
  [screens.md §6](../features/ui/screens.md#6-result-metrics-units-and-precision) sets and the Test
  screen's tile already does.
- **`v02-result-not-saved`** (also `v02-result-not-saved-geometry`, and with the two notes above
  `v02-result-column-geometry`), `ui_kits/app/ResultDetail.jsx`, a result not in history
  (`history-unavailable`): there is no badge, and each disabled control carries the reason in a
  tooltip ("History unavailable · labels can't be saved", "… nothing saved to delete", "… notes
  can't be saved"). It should show the "Not saved" badge beside the label and the reason as text
  under the header, with the note read-only, as
  [screens.md §2](../features/ui/screens.md#2-result-detail--resultid) sets: Download JSON and
  Share work, editing and deleting are disabled with the reason. The header's height follows the
  badge and the reason, and the main column's cards sit where the header and the cards above them
  end.
- **`v02-a11y-result-side-regions`** (also `v02-result-parameters`), `ui_kits/app/ResultDetail.jsx`,
  the side column's Share image, Text summary and Test parameters cards: they are plain sections.
  They should be sections named by their titles (`aria-labelledby` on the title), regions, so a
  screen reader lands on each card by name, as
  [i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility) holds the UI to WCAG 2.2 AA.
  The Test parameters rows, which already match, then pair with Vue's.
