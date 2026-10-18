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
- **`v02-modal-inert-page`**, `components/dialog/Dialog.jsx` and `ui_kits/app/History.jsx` (the
  Compare, Clear all and Export dialogs and menus), `Settings.jsx` (Reset all), the share dialog:
  they are drawn over the page without `aria-modal`, so the page under them stays in the
  accessibility tree. They should be modal: `aria-modal="true"`, focus trapped, and the page
  behind them inert while they are open, as
  [screens.md §3](../features/ui/screens.md#3-history--history) and
  [i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility) set.
- **`v02-compare-table-headers`**, **`v02-compare-rows`** and **`v02-compare-detail-links`** (also
  `v02-compare-geometry`), `ui_kits/app/History.jsx`, the Compare dialog and its narrow cards:
  - The metric names and the Parameters and Results rows are plain cells. The metric names
    should be row headers (`th scope="row"`), and the Parameters and Results rows column headers
    spanning the table ([i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)).
  - The parameters are Label, Preset, Protocol, Streams, the download and upload durations as
    ranges, and Browser; the results have no peaks, probe timeouts, data used or duration; the
    change reads "+12%". The parameters should be Label, Context, Preset, Protocol, Streams, Data
    cap and Browser; the results add the peaks, judged as rates (±2 % reads "same"), and the
    probe timeouts, data used and duration, which show both values without a judgment; the change
    reads "+3.4 %", one decimal with a space before the percent sign
    ([screens.md §3](../features/ui/screens.md#3-history--history)).
  - The column heads and the narrow cards are plain text. Each should link to its result's Result
    detail, so the detail opens from either side
    ([flows.md §6](../features/ui/flows.md#6-history-review-and-compare)).
  - The dialog's rows, cells and buttons then sit where those rows, headers and links put them.
- **`v02-history-row-checkbox-names`**, `ui_kits/app/History.jsx`, the desktop table's rows: each
  row's checkbox (`span role="checkbox"`) has no name. It should be named "Select <label>,
  <date>", as the narrow cards' already are, since every control has an accessible name
  ([i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)).
- **`v02-headings`**, `components/layout/Card.jsx` and `ui_kits/app/History.jsx`, `Settings.jsx`,
  `ResultDetail.jsx`: card, dialog and empty-state titles are styled spans and divs, read as plain
  text before the card's content. They should be headings: `h2` for cards, dialogs and empty
  states, `h3` for groups inside a card, under the screen's one `h1`, without skipping a level
  ([i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)); `Card.jsx` takes a heading
  level.
- **`v02-share-loaded-source`** (also `v02-result-side-geometry`), `ui_kits/app/ResultDetail.jsx`
  and `components/share/SharePreview.jsx`, the share image and the text summary: a loaded latency
  measured over the HTTP/2 probe reads "+39 ms loaded (upload)". A source other than the
  WebSocket should be named with the direction, "+38 ms loaded (upload, HTTP/2 probe)", since
  each number carries its qualifiers ([flows.md §8](../features/ui/flows.md#8-sharing)). The
  side column's boxes then follow that line, the card headings and the side regions.
- **`v02-share-dialog`**, `ui_kits/app/TestScreen.jsx`, the share dialog:
  - Share via… is always drawn. It should be offered only where the Web Share API can share the
    image, as [flows.md §8](../features/ui/flows.md#8-sharing) and
    [screens.md §2](../features/ui/screens.md#2-result-detail--resultid) set; its own tooltip
    already says so.
  - The image preview takes `SharePreview`'s default name, "Share image preview". It should be
    named with what the image holds, "Share image: <the summary's lines>", as Vue's share panel
    names it, so a screen reader hears the numbers.
  - Its Share image and Text summary cards should be regions named by their titles, as the Result
    detail's (`v02-a11y-result-side-regions`), and its title a heading (`v02-headings`).
  - Vue follows the kit's dialog otherwise: the actions in the sticky footer, Download image the
    primary one, Copy summary bordered.
- **`v02-a11y-result-regions`**, **`v02-a11y-load-card-region`** (also
  `v02-a11y-load-card-region-text`), `ui_kits/app/ResultDetail.jsx`, `TestScreen.jsx` and
  `components/measurement/LoadCard.jsx`: the result tiles, the load card and the chart cards are
  unnamed sections. They should be regions named by what they hold
  ([i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)): the tiles "Results", the load
  card "Bufferbloat" on the Test screen and the Result detail (by `aria-label`, its title staying
  the small caps label it is), each chart card by its title, and each chart image
  "<title> chart: …". The load card's words then leave the Results text.
- **`v02-a11y-chart-second-scale`**, `ui_kits/app/TestScreen.jsx`, the throughput chart's summary:
  it leaves out the loaded latency drawn against the right-hand axis. While that series is shown,
  the summary should end "; latency under load on a second scale", so a screen reader knows the
  second axis is there ([i18n-a11y.md §2](../features/ui/i18n-a11y.md#2-accessibility)).
